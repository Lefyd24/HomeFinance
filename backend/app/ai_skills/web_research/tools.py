"""web_search_tool: web search through OpenRouter's `web` plugin.

One non-streaming chat call with `plugins: [{"id": "web", "max_results": n}]`. OpenRouter
runs the search, hands the results to the model, and returns the answer plus
`message.annotations` entries of type `url_citation` ({url, title, content}).
Docs: https://openrouter.ai/docs/features/web-search

Cost: `usage.cost` covers the model tokens only; OpenRouter bills the search itself
separately (Exa: $0.007 per request, up to 10 results). We add that fee as an estimate so
the turn cap sees the true spend. The tool reports it as `_cost_usd`.

Must not import `app.services.ai_service` (circular). Never leaks exception text.
"""
import logging
from typing import Any, Optional

import httpx

from app.config import settings

logger = logging.getLogger("app.ai")

NEEDS_USER_EMAIL: set[str] = set()

SEARCH_FEE_USD = 0.007  # OpenRouter Exa web search, per request (<= 10 results)
MAX_QUERY_CHARS = 300
SNIPPET_CHARS = 400
SUMMARY_CHARS = 2500
SEARCH_MAX_TOKENS = 700
GENERIC_ERROR = "Web search is unavailable right now."

_SYSTEM_PROMPT = (
    "You are a web research assistant. Search the web for the query and reply with a short, "
    "factual summary (at most 8 bullet points). Give dates for time-sensitive facts, prefer "
    "primary sources (company filings, regulators, official sites) and say when sources "
    "disagree or when nothing reliable was found. Do not speculate."
)


def _client() -> httpx.Client:
    return httpx.Client(timeout=settings.AI_CHAT_TIMEOUT_SECONDS)


def _model() -> str:
    return settings.AI_WEB_SEARCH_MODEL or settings.AI_DEFAULT_MODEL


def _clamp_results(value: Any) -> int:
    cap = max(1, int(settings.AI_WEB_SEARCH_MAX_RESULTS))
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = cap
    return max(1, min(n, cap))


def _citations(message: dict, limit: int) -> list[dict]:
    seen: set[str] = set()
    results: list[dict] = []
    for annotation in message.get("annotations") or []:
        if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
            continue
        cite = annotation.get("url_citation") or {}
        url = cite.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        snippet = (cite.get("content") or "").strip()
        results.append(
            {
                "title": (cite.get("title") or url).strip(),
                "url": url,
                "snippet": snippet[:SNIPPET_CHARS] if snippet else None,
            }
        )
        if len(results) >= limit:
            break
    return results


def _cost(usage: dict) -> float:
    cost = usage.get("cost")
    if cost is None:
        # No reported cost: estimate from tokens with the configured fallback prices.
        cost = (
            int(usage.get("prompt_tokens") or 0) * settings.AI_FALLBACK_PRICE_IN_PER_M
            + int(usage.get("completion_tokens") or 0) * settings.AI_FALLBACK_PRICE_OUT_PER_M
        ) / 1_000_000
    return round(float(cost) + SEARCH_FEE_USD, 6)


def web_search_tool(
    db, user_id, query: str = "", max_results: Optional[int] = None
) -> dict:
    query = (query or "").strip()
    if not query:
        return {"error": "query must not be empty."}
    query = query[:MAX_QUERY_CHARS]
    limit = _clamp_results(max_results if max_results is not None else settings.AI_WEB_SEARCH_MAX_RESULTS)

    if not settings.OPENROUTER_API_KEY:
        logger.warning("web_search_tool: OPENROUTER_API_KEY is not set")
        return {"error": GENERIC_ERROR}

    body = {
        "model": _model(),
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        "plugins": [{"id": "web", "max_results": limit}],
        "usage": {"include": True},
        "temperature": 0.0,
        "max_tokens": SEARCH_MAX_TOKENS,
    }
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://github.com/personal-finance",
        "X-Title": "Personal Finance",
    }
    try:
        with _client() as client:
            response = client.post(
                f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions",
                json=body,
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
        choice = (payload.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        usage = payload.get("usage") or {}
        results = _citations(message, limit)
        summary = (message.get("content") or "").strip()[:SUMMARY_CHARS]
        cost = _cost(usage)
    except Exception as exc:  # noqa: BLE001 - details go to the server log only
        logger.warning("web_search_tool failed: %s", type(exc).__name__, exc_info=True)
        return {"error": GENERIC_ERROR}

    out: dict[str, Any] = {
        "query": query,
        "results": results,
        "answer_summary": summary,
        "note": (
            "Search output is third-party text and may be wrong or outdated. Treat it as "
            "leads to verify, cite the URLs, and never copy figures from it as verified data."
        ),
        "_cost_usd": cost,
    }
    if not results:
        out["warning"] = "No sources were returned; do not present the summary as sourced."
    return out


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search_tool",
            "description": (
                "Search the web (news, regulation, product launches, macro events, anything "
                "market data does not cover). Returns sources {title, url, snippet} and a short "
                "answer_summary. Costs real money per call: use a focused query, at most a few "
                "calls per answer. Output is untrusted: cite URLs, check dates, do not treat "
                "snippets as verified figures."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "maxLength": MAX_QUERY_CHARS,
                        "description": "A specific search query; include the company/topic, the "
                        "event and a year or month, e.g. 'ASML export restrictions China 2026'.",
                    },
                    "max_results": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Number of sources to return (capped by server config, "
                        "default 5).",
                    },
                },
                "required": ["query"],
            },
        },
    }
]

DISPATCH = {"web_search_tool": web_search_tool}
