"""Fixture tools for the skills framework tests."""
NEEDS_USER_EMAIL = {"demo_mail_tool"}


def demo_lookup_tool(db, user_id, query="x"):
    return {"query": query, "user_id": user_id, "_cost_usd": 0.05}


def demo_mail_tool(db, user_id, subject, user_email):
    return {"sent_to": user_email, "subject": subject}


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "demo_lookup_tool",
            "description": "Look something up.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "demo_mail_tool",
            "description": "Send a mail.",
            "parameters": {
                "type": "object",
                "properties": {"subject": {"type": "string"}},
                "required": ["subject"],
            },
        },
    },
]
DISPATCH = {"demo_lookup_tool": demo_lookup_tool, "demo_mail_tool": demo_mail_tool}
