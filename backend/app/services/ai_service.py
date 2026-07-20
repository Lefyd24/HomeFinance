"""DeepSeek-backed conversational agent with tool calling and streaming.

`run_agent_stream` is a generator that yields small dicts describing what's
happening (a streamed answer token, a tool call starting/finishing, or an
error) so the router can forward each one to the browser as an SSE event in
real time.
"""
import json
import logging
from typing import Callable, Generator, Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.services import ai_tools

logger = logging.getLogger("app.ai")

SYSTEM_PROMPT = (
    "You are a financial advisor assistant embedded in a personal finance app. "
    "You can only discuss the user's own finances (transactions, accounts, budgets, "
    "recurring expenses, and debts) and general personal-finance advice. "
    "Always use the provided tools to look up real numbers before answering questions "
    "about the user's data — never guess or fabricate figures. Use the currency shown "
    "in the account data. Be concise and use plain language. "
    "Only call send_analysis_email_tool when the user explicitly asks you to email them "
    "something; when you do, write analysis_text as a clear, well-organized summary."
)

AI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_transactions_tool",
            "description": (
                "Look up the user's transactions. Use this to answer questions about "
                "specific transactions, spending in a date range, or a search for a "
                "merchant/description."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "format": "date", "description": "YYYY-MM-DD, inclusive"},
                    "end_date": {"type": "string", "format": "date", "description": "YYYY-MM-DD, inclusive"},
                    "type": {"type": "string", "enum": ["income", "expense", "transfer"]},
                    "category_id": {"type": "integer"},
                    "account_id": {"type": "integer"},
                    "search": {"type": "string", "description": "Free-text search on the description"},
                    "limit": {"type": "integer", "description": "Max rows to return, default 50, max 200"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_totals_tool",
            "description": (
                "Get the user's total income, expenses, and net for the given period. "
                "Omit group_by for a single overall total. Pass group_by as day, month, "
                "or year to get a period-keyed summary (e.g. monthly breakdown) plus overall totals."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "format": "date", "description": "YYYY-MM-DD, inclusive"},
                    "end_date": {"type": "string", "format": "date", "description": "YYYY-MM-DD, inclusive"},
                    "group_by": {
                        "type": "string",
                        "enum": ["day", "month", "year"],
                        "description": "Optional. Group totals by day (YYYY-MM-DD), month (YYYY-MM), or year (YYYY).",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_account_balances_tool",
            "description": "Get the user's account balances and total balance across all active accounts.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_budgets_status_tool",
            "description": "Get the user's budgets with current-period spend, remaining amount, and percentage used.",
            "parameters": {
                "type": "object",
                "properties": {
                    "active_only": {"type": "boolean", "description": "Default true"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recurring_expenses_tool",
            "description": "Get the user's recurring expenses (bills, subscriptions), optionally filtered to those due soon.",
            "parameters": {
                "type": "object",
                "properties": {
                    "active_only": {"type": "boolean", "description": "Default true"},
                    "upcoming_days": {"type": "integer", "description": "Only include expenses due within this many days"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_debts_tool",
            "description": "Get the user's debts (loans, credit cards) with balances, interest rates, and next payment dates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "active_only": {"type": "boolean", "description": "Default true"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_analysis_email_tool",
            "description": (
                "Email the user a copy of an analysis you've prepared. Only call this when "
                "the user explicitly asks to be emailed something. Always sends to the "
                "user's own account email — you cannot choose a recipient."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {"type": "string", "description": "Email subject line"},
                    "analysis_text": {"type": "string", "description": "The analysis body, in plain text paragraphs"},
                },
                "required": ["subject", "analysis_text"],
            },
        },
    },
]

TOOL_DISPATCH: dict[str, Callable] = {
    "get_transactions_tool": ai_tools.get_transactions_tool,
    "get_totals_tool": ai_tools.get_totals_tool,
    "get_account_balances_tool": ai_tools.get_account_balances_tool,
    "get_budgets_status_tool": ai_tools.get_budgets_status_tool,
    "get_recurring_expenses_tool": ai_tools.get_recurring_expenses_tool,
    "get_debts_tool": ai_tools.get_debts_tool,
    "send_analysis_email_tool": ai_tools.send_analysis_email_tool,
}

# Tools that need the caller's identity injected server-side rather than
# taking every argument straight from the model.
_EMAIL_TOOL_NAME = "send_analysis_email_tool"


def _execute_tool(db: Session, user_id: int, user_email: str, name: str, args: dict) -> dict:
    fn = TOOL_DISPATCH.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        if name == _EMAIL_TOOL_NAME:
            return fn(db, user_id, **args, user_email=user_email)
        return fn(db, user_id, **args)
    except Exception as exc:  # tool errors surface to the model, not as a broken stream
        logger.warning("Tool %s failed: %s", name, exc)
        return {"error": str(exc)}


def run_agent_stream(
    db: Session,
    user_id: int,
    user_email: str,
    messages: list[dict],
) -> Generator[dict, None, None]:
    if not settings.DEEPSEEK_API_KEY:
        yield {"type": "error", "message": "AI chat is not configured."}
        return

    client = OpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url=settings.DEEPSEEK_BASE_URL,
        timeout=60.0,
    )

    for _ in range(settings.AI_CHAT_MAX_TOOL_ROUNDS):
        try:
            stream = client.chat.completions.create(
                model=settings.DEEPSEEK_MODEL,
                messages=messages,
                tools=AI_TOOLS,
                stream=True,
            )
        except Exception as exc:
            logger.warning("DeepSeek request failed: %s", exc)
            yield {"type": "error", "message": f"DeepSeek API error: {exc}"}
            return

        content_buf = ""
        tool_call_buf: dict[int, dict] = {}
        finish_reason: Optional[str] = None

        try:
            for chunk in stream:
                choice = chunk.choices[0]
                delta = choice.delta
                if choice.finish_reason:
                    finish_reason = choice.finish_reason

                if delta.content:
                    content_buf += delta.content
                    yield {"type": "token", "content": delta.content}

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        entry = tool_call_buf.setdefault(
                            tc.index, {"id": None, "name": None, "arguments": ""}
                        )
                        if tc.id:
                            entry["id"] = tc.id
                        if tc.function and tc.function.name:
                            entry["name"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            entry["arguments"] += tc.function.arguments
        except Exception as exc:
            logger.warning("DeepSeek stream interrupted: %s", exc)
            yield {"type": "error", "message": f"DeepSeek stream error: {exc}"}
            return

        if finish_reason == "tool_calls" and tool_call_buf:
            assistant_tool_calls = []
            for entry in tool_call_buf.values():
                assistant_tool_calls.append(
                    {
                        "id": entry["id"],
                        "type": "function",
                        "function": {"name": entry["name"], "arguments": entry["arguments"]},
                    }
                )
            messages.append(
                {"role": "assistant", "content": content_buf or None, "tool_calls": assistant_tool_calls}
            )

            for entry in tool_call_buf.values():
                try:
                    args = json.loads(entry["arguments"]) if entry["arguments"] else {}
                except json.JSONDecodeError:
                    args = {}

                yield {"type": "tool_call_start", "tool": entry["name"], "args": args}
                result = _execute_tool(db, user_id, user_email, entry["name"], args)
                yield {"type": "tool_call_result", "tool": entry["name"], "result": result}

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": entry["id"],
                        "content": json.dumps(result),
                    }
                )
            continue

        yield {"type": "done", "content": content_buf}
        return

    yield {"type": "error", "message": "Reached maximum tool-call rounds without a final answer."}
