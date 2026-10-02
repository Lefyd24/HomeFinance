"""The advisor-skills framework: loader validation, progressive disclosure of tools,
request-activated skills, round limits, tool cost accounting and the HTTP surface.

No network: the OpenRouter client is the FakeClient from test_ai_chat, and skills come
from backend/tests/fixtures/ai_skills (or are written to tmp_path per case).
"""
import json
import textwrap
from pathlib import Path

import pytest

from app import ai_skills
from app.config import settings
from app.llm.openrouter import OpenRouterClient
from app.services import ai_service
from app.services.ai_prompt import build_system_prompt

# Fixtures (stub_llm, _fresh_catalog) and helpers are shared with the chat tests.
from tests.test_ai_chat import (  # noqa: F401
    _answer,
    _chat,
    _events,
    _fresh_catalog,
    _tool_round,
    stub_llm,
)

GOOD = Path(__file__).parent / "fixtures" / "ai_skills" / "good"
CORE = set(ai_service.TOOL_DISPATCH)


def _names(tools):
    return {t["function"]["name"] for t in tools}


def _write_skill(root: Path, dirname: str, frontmatter: str, body="Do the thing.", tools_py=None):
    d = root / dirname
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(f"---\n{frontmatter.strip()}\n---\n\n{body}\n", encoding="utf-8")
    if tools_py is not None:
        (d / "tools.py").write_text(textwrap.dedent(tools_py), encoding="utf-8")
    return d


_MIN_FM = "name: {name}\ntitle: T\ndescription: D\n"

_ONE_TOOL = """
    def a_tool(db, user_id):
        return {}
    TOOLS = [{"type": "function", "function": {"name": "a_tool", "description": "x",
              "parameters": {"type": "object", "properties": {}}}}]
    DISPATCH = {"a_tool": a_tool}
"""


@pytest.fixture()
def fixture_skills(monkeypatch):
    registry = ai_skills.load_all(GOOD, core_tool_names=CORE)
    monkeypatch.setattr(ai_skills, "_REGISTRY", registry)
    return registry


# --- loader -----------------------------------------------------------------


def test_the_loader_works_with_no_skills(tmp_path):
    assert ai_skills.load_all(tmp_path, core_tool_names=CORE) == {}
    assert ai_skills.load_all(tmp_path / "missing", core_tool_names=CORE) == {}


def test_a_valid_skill_is_parsed(fixture_skills):
    skill = fixture_skills["demo-skill"]
    assert skill.title == "Demo skill"
    assert skill.description == "Use for demo work. Second line of the description."
    assert skill.command == "demo"
    assert skill.max_rounds == 20
    assert skill.uses == ["get_debts_tool"]
    assert skill.suggested_model == "acme/strong"
    assert skill.tool_names == ["demo_lookup_tool", "demo_mail_tool"]
    assert skill.needs_user_email == {"demo_mail_tool"}
    assert skill.body.startswith("# Demo method")
    assert fixture_skills["other-skill"].command is None


def test_duplicate_skill_names_fail(tmp_path):
    _write_skill(tmp_path, "one", _MIN_FM.format(name="same"))
    _write_skill(tmp_path, "two", _MIN_FM.format(name="same"))
    with pytest.raises(RuntimeError, match="Duplicate skill name"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_listed_tool_missing_from_tools_py_fails(tmp_path):
    _write_skill(
        tmp_path, "s", _MIN_FM.format(name="s") + "tools: [a_tool, ghost_tool]", tools_py=_ONE_TOOL
    )
    with pytest.raises(RuntimeError, match="ghost_tool"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_listed_tool_without_a_tools_py_fails(tmp_path):
    _write_skill(tmp_path, "s", _MIN_FM.format(name="s") + "tools: [a_tool]")
    with pytest.raises(RuntimeError, match="a_tool"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_tool_in_tools_py_but_not_listed_fails(tmp_path):
    _write_skill(tmp_path, "s", _MIN_FM.format(name="s"), tools_py=_ONE_TOOL)
    with pytest.raises(RuntimeError, match="not listed"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_core_tool_name_collision_fails(tmp_path):
    tools_py = _ONE_TOOL.replace("a_tool", "get_debts_tool")
    _write_skill(
        tmp_path, "s", _MIN_FM.format(name="s") + "tools: [get_debts_tool]", tools_py=tools_py
    )
    with pytest.raises(RuntimeError, match="collides with a core tool"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_collision_with_load_skill_tool_fails(tmp_path):
    tools_py = _ONE_TOOL.replace("a_tool", "load_skill_tool")
    _write_skill(
        tmp_path, "s", _MIN_FM.format(name="s") + "tools: [load_skill_tool]", tools_py=tools_py
    )
    with pytest.raises(RuntimeError, match="collides"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_tool_defined_by_two_skills_fails(tmp_path):
    for name in ("s1", "s2"):
        _write_skill(
            tmp_path, name, _MIN_FM.format(name=name) + "tools: [a_tool]", tools_py=_ONE_TOOL
        )
    with pytest.raises(RuntimeError, match="defined by both"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_an_unknown_requires_flag_fails(tmp_path):
    _write_skill(tmp_path, "s", _MIN_FM.format(name="s") + "requires: [teleportation]")
    with pytest.raises(RuntimeError, match="unknown requires"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_uses_entry_that_is_not_a_core_tool_fails(tmp_path):
    _write_skill(tmp_path, "s", _MIN_FM.format(name="s") + "uses: [nonexistent_tool]")
    with pytest.raises(RuntimeError, match="unknown core tools"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_a_skill_using_a_feature_disabled_core_tool_is_unavailable_not_an_error(tmp_path):
    _write_skill(tmp_path, "s", _MIN_FM.format(name="s") + "uses: [future_core_tool]")
    registry = ai_skills.load_all(
        tmp_path, core_tool_names=CORE, disabled_core_tool_names={"future_core_tool"}
    )
    assert registry == {}


@pytest.mark.parametrize(
    "text",
    [
        "no frontmatter at all",
        "---\nname: s\ntitle: T\n",  # not closed
        "---\nname s\n---\nbody",  # unparseable line
        "---\nname: s\nname: t\ntitle: T\ndescription: D\n---\nbody",  # duplicate key
        "---\nname: s\ntitle: T\ndescription: D\nbogus: 1\n---\nbody",  # unknown key
        "---\ntitle: T\ndescription: D\n---\nbody",  # no name
        "---\nname: Not_Kebab\ntitle: T\ndescription: D\n---\nbody",
        "---\nname: s\ntitle: T\ndescription: D\nmax_rounds: lots\n---\nbody",
        "---\nname: s\ntitle: T\ndescription: D\ntools: nope\n---\nbody",
        "---\nname: s\ntitle: T\ndescription: D\n---\n",  # empty body
    ],
)
def test_bad_frontmatter_fails(tmp_path, text):
    d = tmp_path / "s"
    d.mkdir()
    (d / "SKILL.md").write_text(text, encoding="utf-8")
    with pytest.raises(RuntimeError):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


def test_two_skills_sharing_a_command_fail(tmp_path):
    _write_skill(tmp_path, "a", _MIN_FM.format(name="a") + "command: go")
    _write_skill(tmp_path, "b", _MIN_FM.format(name="b") + "command: go")
    with pytest.raises(RuntimeError, match="share command"):
        ai_skills.load_all(tmp_path, core_tool_names=CORE)


# --- registry ---------------------------------------------------------------


def test_requires_flags_filter_availability(fixture_skills, monkeypatch):
    monkeypatch.setattr(settings, "AI_INVESTMENT_TOOLS_ENABLED", True)
    assert [s.name for s in ai_skills.available_skills()] == ["demo-skill", "other-skill"]

    monkeypatch.setattr(settings, "AI_INVESTMENT_TOOLS_ENABLED", False)
    assert [s.name for s in ai_skills.available_skills()] == ["demo-skill"]
    assert ai_skills.get_skill("other-skill") is None
    assert ai_skills.get_skill("demo-skill") is not None
    assert ai_skills.get_skill("nope") is None


def test_by_command(fixture_skills):
    assert ai_skills.by_command("demo").name == "demo-skill"
    assert ai_skills.by_command("/demo").name == "demo-skill"
    assert ai_skills.by_command("nope") is None


def test_load_skill_tool_schema_has_an_enum_and_is_omitted_when_empty(fixture_skills, monkeypatch):
    schema = ai_skills.load_skill_tool_schema()
    assert schema["function"]["name"] == "load_skill_tool"
    assert schema["function"]["parameters"]["properties"]["name"]["enum"] == [
        "demo-skill",
        "other-skill",
    ]
    monkeypatch.setattr(ai_skills, "_REGISTRY", {})
    assert ai_skills.load_skill_tool_schema() is None
    assert ai_skills.skills_prompt_block() == ""


def test_load_skill_result(fixture_skills):
    result = ai_skills.load_skill_result("demo-skill")
    assert result["skill"] == "demo-skill"
    assert result["title"] == "Demo skill"
    assert result["instructions"].startswith("# Demo method")
    assert result["tools_now_available"] == ["demo_lookup_tool", "demo_mail_tool"]
    assert "error" in ai_skills.load_skill_result("nope")


def test_the_system_prompt_lists_skills_only_when_there_are_some(
    db, seed_user, fixture_skills, monkeypatch
):
    prompt = build_system_prompt(db, seed_user)
    assert "SKILLS" in prompt
    assert "load_skill_tool" in prompt
    assert "demo-skill — Use for demo work." in prompt

    monkeypatch.setattr(ai_skills, "_REGISTRY", {})
    assert "SKILLS" not in build_system_prompt(db, seed_user)


def test_the_real_registry_loads_at_import():
    # Whatever skills are shipped must have validated when ai_service was imported.
    assert isinstance(ai_skills.available_skills(), list)


# --- agent loop -------------------------------------------------------------


def test_skill_tools_are_hidden_until_loaded_then_present_next_round(
    client, stub_llm, fixture_skills
):
    fake = stub_llm(
        [
            _tool_round("c1", "load_skill_tool", json.dumps({"name": "demo-skill"})),
            _tool_round("c2", "demo_lookup_tool", json.dumps({"query": "q"})),
            _answer("Done."),
        ]
    )
    events = _events(_chat(client, "go"))

    first, second, third = (_names(c["tools"]) for c in fake.calls)
    assert "load_skill_tool" in first
    assert not first & {"demo_lookup_tool", "demo_mail_tool"}
    assert {"demo_lookup_tool", "demo_mail_tool", "load_skill_tool"} <= second
    assert second == third

    loaded = next(e for e in events if e["type"] == "skill_loaded")
    assert loaded == {
        "type": "skill_loaded",
        "name": "demo-skill",
        "title": "Demo skill",
        "suggested_model": "acme/strong",
    }
    results = [e for e in events if e["type"] == "tool_call_result"]
    assert results[0]["result"]["instructions"].startswith("# Demo method")
    assert results[1]["result"]["query"] == "q"
    done = next(e for e in events if e["type"] == "done")
    assert done["active_skills"] == ["demo-skill"]
    # The body reaches the model through the tool message, not a system injection.
    assert [m["role"] for m in fake.calls[1]["messages"]].count("system") == 1


def test_an_unloaded_skills_tool_cannot_be_called(client, stub_llm, fixture_skills):
    stub_llm([_tool_round("c1", "demo_lookup_tool", "{}"), _answer("ok")])
    events = _events(_chat(client, "go"))
    result = next(e for e in events if e["type"] == "tool_call_result")
    assert result["result"] == {"error": "Unknown tool: demo_lookup_tool"}


def test_loading_an_unknown_skill_is_an_error_result(client, stub_llm, fixture_skills):
    stub_llm([_tool_round("c1", "load_skill_tool", json.dumps({"name": "nope"})), _answer("ok")])
    events = _events(_chat(client, "go"))
    assert "error" in next(e for e in events if e["type"] == "tool_call_result")["result"]
    assert not any(e["type"] == "skill_loaded" for e in events)
    assert next(e for e in events if e["type"] == "done")["active_skills"] == []


def test_a_request_activated_skill_is_injected_with_tools_from_round_one(
    client, stub_llm, fixture_skills
):
    fake = stub_llm([_answer("Hi.")])
    events = _events(_chat(client, "/demo hi", skills=["demo-skill"]))

    call = fake.calls[0]
    assert {"demo_lookup_tool", "demo_mail_tool"} <= _names(call["tools"])
    system = [m for m in call["messages"] if m["role"] == "system"]
    assert len(system) == 2
    assert system[1]["content"].startswith("Active skill: Demo skill\n\n# Demo method")
    assert call["messages"][1] is system[1]  # right after the main system prompt
    assert not any(e["type"] == "skill_loaded" for e in events)
    assert next(e for e in events if e["type"] == "done")["active_skills"] == ["demo-skill"]


def test_unknown_requested_skills_are_dropped(client, stub_llm, fixture_skills):
    fake = stub_llm([_answer("Hi.")])
    events = _events(_chat(client, "hi", skills=["ghost", "demo-skill", "demo-skill"]))
    assert next(e for e in events if e["type"] == "done")["active_skills"] == ["demo-skill"]
    assert [m["role"] for m in fake.calls[0]["messages"]].count("system") == 2


def test_the_skills_request_field_is_bounded(client, stub_llm, fixture_skills):
    stub_llm([_answer("x")])
    assert _chat(client, "hi", skills=["a"] * 11).status_code == 422
    assert _chat(client, "hi", skills=["a" * 65]).status_code == 422


def test_no_load_tool_and_no_prompt_section_without_skills(client, stub_llm, monkeypatch):
    monkeypatch.setattr(ai_skills, "_REGISTRY", {})
    fake = stub_llm([_answer("Hi.")])
    _chat(client)
    assert "load_skill_tool" not in _names(fake.calls[0]["tools"])
    assert "SKILLS" not in fake.calls[0]["messages"][0]["content"]


def test_a_skill_raises_the_round_limit_up_to_the_cap(client, stub_llm, fixture_skills, monkeypatch):
    monkeypatch.setattr(settings, "AI_CHAT_MAX_TOOL_ROUNDS", 2)
    monkeypatch.setattr(settings, "AI_SKILL_MAX_ROUNDS", 6)
    # demo-skill asks for 20, the cap says 6: rounds 1-5 may call tools, round 6 must answer.
    streams = [_tool_round("l", "load_skill_tool", json.dumps({"name": "demo-skill"}))]
    streams += [_tool_round(f"c{i}", "demo_lookup_tool", "{}") for i in range(4)]
    streams += [_answer("Finally.")]
    fake = stub_llm(streams)

    events = _events(_chat(client, "go"))

    assert len(fake.calls) == 6
    assert next(e for e in events if e["type"] == "done")["content"] == "Finally."
    assert "tool_choice" not in fake.calls[4]
    assert fake.calls[5]["tool_choice"] == "none"


def test_the_round_limit_without_skills_is_unchanged(client, stub_llm, fixture_skills, monkeypatch):
    monkeypatch.setattr(settings, "AI_CHAT_MAX_TOOL_ROUNDS", 3)
    fake = stub_llm([_tool_round(f"c{i}", "get_debts_tool", "{}") for i in range(3)])
    events = _events(_chat(client, "go"))
    assert len(fake.calls) == 3
    assert events[-1]["type"] == "error"  # defensive fallback if the model ignores tool_choice
    assert "maximum tool-call rounds" in events[-1]["message"]


def test_a_request_activated_skill_raises_the_limit_from_the_start(
    client, stub_llm, fixture_skills, monkeypatch
):
    monkeypatch.setattr(settings, "AI_CHAT_MAX_TOOL_ROUNDS", 2)
    monkeypatch.setattr(settings, "AI_SKILL_MAX_ROUNDS", 25)
    fake = stub_llm(
        [_tool_round(f"c{i}", "demo_lookup_tool", "{}") for i in range(4)] + [_answer("ok")]
    )
    events = _events(_chat(client, "go", skills=["demo-skill"]))
    assert len(fake.calls) == 5
    assert next(e for e in events if e["type"] == "done")["content"] == "ok"


def test_the_last_allowed_round_uses_tool_choice_none(client, stub_llm, monkeypatch):
    monkeypatch.setattr(settings, "AI_CHAT_MAX_TOOL_ROUNDS", 2)
    fake = stub_llm([_tool_round("c1", "get_debts_tool", "{}"), _answer("Best effort.")])
    events = _events(_chat(client, "go"))

    assert "tool_choice" not in fake.calls[0]
    assert fake.calls[1]["tool_choice"] == "none"
    assert fake.calls[1]["tools"]  # schemas stay so the tool history remains valid
    assert next(e for e in events if e["type"] == "done")["content"] == "Best effort."


def test_tool_choice_reaches_the_request_body():
    sent = {}

    class _Resp:
        def iter_lines(self):
            return iter(["data: [DONE]"])

    class _Ctx:
        def __enter__(self):
            return _Resp()

        def __exit__(self, *a):
            return False

    client = OpenRouterClient(api_key="k")
    client._open_stream = lambda path, body: sent.update(body) or _Ctx()
    list(client.stream_chat("m", [], tools=[{"x": 1}], tool_choice="none"))
    assert sent["tool_choice"] == "none"

    sent.clear()
    list(client.stream_chat("m", [], tools=[{"x": 1}]))
    assert "tool_choice" not in sent


def test_tool_cost_is_added_to_the_turn_and_stripped_everywhere(client, stub_llm, fixture_skills):
    fake = stub_llm(
        [
            _tool_round("l", "load_skill_tool", json.dumps({"name": "demo-skill"})),
            _tool_round("c1", "demo_lookup_tool", "{}"),
            _answer("Done."),
        ]
    )
    response = _chat(client, "go")
    events = _events(response)

    done = next(e for e in events if e["type"] == "done")
    # three model calls at 0.001 + 0.05 from the tool
    assert done["usage"]["cost_usd"] == pytest.approx(0.053)
    assert done["usage"]["cost_estimated"] is False
    result = [e for e in events if e["type"] == "tool_call_result"][1]
    assert "_cost_usd" not in result["result"]
    assert "_cost_usd" not in response.text
    tool_messages = [m for m in fake.calls[2]["messages"] if m["role"] == "tool"]
    assert not any("_cost_usd" in m["content"] for m in tool_messages)


def test_the_tool_cost_counts_toward_the_turn_cap(client, stub_llm, fixture_skills, monkeypatch):
    monkeypatch.setattr(settings, "AI_TURN_COST_CAP_USD", 0.04)
    stub_llm(
        [
            _tool_round("c1", "demo_lookup_tool", "{}"),
            _answer("never"),
        ]
    )
    events = _events(_chat(client, "go", skills=["demo-skill"]))
    assert events[-1] == {"type": "error", "message": "This answer hit the per-turn cost limit."}


def test_needs_user_email_is_injected_for_skill_tools(client, stub_llm, fixture_skills, seed_user):
    stub_llm(
        [
            _tool_round("c1", "demo_mail_tool", json.dumps({"subject": "Hello"})),
            _answer("Sent."),
        ]
    )
    events = _events(_chat(client, "go", skills=["demo-skill"]))
    result = next(e for e in events if e["type"] == "tool_call_result")["result"]
    assert result == {"sent_to": seed_user.email, "subject": "Hello"}


def test_the_model_cannot_supply_the_email_itself(client, stub_llm, fixture_skills):
    stub_llm(
        [
            _tool_round(
                "c1", "demo_mail_tool", json.dumps({"subject": "x", "user_email": "evil@x.y"})
            ),
            _answer("ok"),
        ]
    )
    events = _events(_chat(client, "go", skills=["demo-skill"]))
    result = next(e for e in events if e["type"] == "tool_call_result")["result"]
    assert "error" in result  # duplicate keyword rejected: the injection is not overridable
    assert "evil@x.y" not in json.dumps(result)


def test_skill_tool_errors_are_returned_to_the_model(client, stub_llm, fixture_skills):
    stub_llm([_tool_round("c1", "demo_lookup_tool", json.dumps({"bogus": 1})), _answer("ok")])
    events = _events(_chat(client, "go", skills=["demo-skill"]))
    result = next(e for e in events if e["type"] == "tool_call_result")["result"]
    assert result["error"].startswith("Invalid arguments for demo_lookup_tool")


def test_done_carries_active_skills_even_when_empty(client, stub_llm, fixture_skills):
    stub_llm([_answer("Hi.")])
    done = next(e for e in _events(_chat(client)) if e["type"] == "done")
    assert done["active_skills"] == []


# --- /ai/skills -------------------------------------------------------------


def test_skills_endpoint_lists_available_skills(client, fixture_skills, monkeypatch):
    monkeypatch.setattr(settings, "AI_INVESTMENT_TOOLS_ENABLED", True)
    body = client.get("/api/ai/skills").json()
    assert [s["name"] for s in body["skills"]] == ["demo-skill", "other-skill"]
    demo = body["skills"][0]
    assert demo == {
        "name": "demo-skill",
        "title": "Demo skill",
        "description": "Use for demo work. Second line of the description.",
        "command": "demo",
        "suggested_model": "acme/strong",
    }
    assert body["skills"][1]["command"] is None

    monkeypatch.setattr(settings, "AI_INVESTMENT_TOOLS_ENABLED", False)
    assert [s["name"] for s in client.get("/api/ai/skills").json()["skills"]] == ["demo-skill"]


def test_skills_endpoint_with_no_skills(client, monkeypatch):
    monkeypatch.setattr(ai_skills, "_REGISTRY", {})
    assert client.get("/api/ai/skills").json() == {"skills": []}
