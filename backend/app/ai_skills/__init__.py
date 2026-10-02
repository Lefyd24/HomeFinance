"""Advisor skills: on-demand expertise (a method) plus the tools that method needs.

A skill is a directory holding `SKILL.md` (YAML-style frontmatter + a Markdown body)
and optionally `tools.py` (`TOOLS`, `DISPATCH`, `NEEDS_USER_EMAIL`, same shape as the
`services/ai_tools*.py` modules). The model sees only each skill's name and
description until it calls `load_skill_tool`; the method then arrives as the tool
result and the skill's own tool schemas join the `tools` array from the next round.

Everything is validated when the registry is built (app import), so a broken skill
fails startup rather than a conversation.

This module must not import `app.services.ai_service` (which imports it).
"""
import importlib
import importlib.util
import logging
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

from app.config import settings

logger = logging.getLogger("app.ai")

SKILLS_DIR = Path(__file__).resolve().parent
LOAD_SKILL_TOOL_NAME = "load_skill_tool"

KNOWN_REQUIRES = {"investments", "web_search", "email"}
_ALLOWED_KEYS = {
    "name",
    "title",
    "description",
    "command",
    "tools",
    "uses",
    "max_rounds",
    "requires",
    "suggested_model",
}
_NAME_RE = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
_COMMAND_RE = re.compile(r"^[a-z][a-z0-9-]*$")


@dataclass(frozen=True)
class Skill:
    name: str
    title: str
    description: str
    command: Optional[str]
    body: str
    tools: list[dict] = field(default_factory=list)
    dispatch: dict[str, Callable] = field(default_factory=dict)
    needs_user_email: set[str] = field(default_factory=set)
    uses: list[str] = field(default_factory=list)
    max_rounds: Optional[int] = None
    requires: list[str] = field(default_factory=list)
    suggested_model: Optional[str] = None

    @property
    def tool_names(self) -> list[str]:
        return [t["function"]["name"] for t in self.tools]


# --- frontmatter ---------------------------------------------------------------


def _unquote(raw: str) -> str:
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        inner = raw[1:-1]
        if raw[0] == '"':
            inner = inner.replace('\\"', '"').replace("\\\\", "\\")
        return inner
    return raw


def _scalar(raw: str) -> Any:
    raw = raw.strip()
    if raw in ("", "~", "null", "Null", "NULL"):
        return None
    if raw[0] in "\"'":
        if len(raw) < 2 or raw[-1] != raw[0]:
            raise ValueError(f"unterminated quoted string: {raw}")
        return _unquote(raw)
    if raw in ("true", "false"):
        return raw == "true"
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if raw[0] == "[":
        if raw[-1] != "]":
            raise ValueError(f"unterminated list: {raw}")
        inner = raw[1:-1].strip()
        if not inner:
            return []
        return [_unquote(part.strip()) for part in inner.split(",") if part.strip()]
    return raw


def _parse_frontmatter(text: str, source: str) -> tuple[dict[str, Any], str]:
    lines = text.lstrip("﻿").splitlines()
    if not lines or lines[0].strip() != "---":
        raise RuntimeError(f"{source}: SKILL.md must start with a '---' frontmatter block")
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        raise RuntimeError(f"{source}: frontmatter is not closed with '---'") from None

    block = lines[1:end]
    body = "\n".join(lines[end + 1 :]).strip()
    data: dict[str, Any] = {}
    i = 0
    try:
        while i < len(block):
            line = block[i]
            if not line.strip() or line.lstrip().startswith("#"):
                i += 1
                continue
            match = re.match(r"^([A-Za-z_][\w-]*):(?:\s+(.*))?$", line.rstrip())
            if not match:
                raise ValueError(f"cannot parse line: {line!r}")
            key, rest = match.group(1), (match.group(2) or "").strip()
            if key in data:
                raise ValueError(f"duplicate key '{key}'")
            i += 1
            # Continuation lines: everything indented (or a "- item" list) that follows.
            cont: list[str] = []
            while i < len(block) and (
                not block[i].strip() or block[i][0] in " \t" or block[i].startswith("- ")
            ):
                cont.append(block[i])
                i += 1
            while cont and not cont[-1].strip():
                cont.pop()

            if rest in (">", "|", ">-", "|-"):
                parts = [c.strip() for c in cont]
                joiner = " " if rest.startswith(">") else "\n"
                data[key] = joiner.join(p for p in parts if p or joiner == "\n").strip()
            elif rest == "" and cont and all(
                not c.strip() or c.lstrip().startswith("- ") for c in cont
            ):
                data[key] = [_unquote(c.lstrip()[2:].strip()) for c in cont if c.strip()]
            elif rest == "" and cont:
                data[key] = " ".join(c.strip() for c in cont if c.strip())
            else:
                value = _scalar(rest) if rest else None
                if cont and isinstance(value, str):
                    value = " ".join([value, *(c.strip() for c in cont if c.strip())])
                data[key] = value
    except ValueError as exc:
        raise RuntimeError(f"{source}: bad frontmatter ({exc})") from None
    return data, body


def _str_list(data: dict, key: str, source: str) -> list[str]:
    value = data.get(key)
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) and v for v in value):
        raise RuntimeError(f"{source}: '{key}' must be a list of names")
    if len(set(value)) != len(value):
        raise RuntimeError(f"{source}: '{key}' has duplicate entries")
    return value


# --- loading -------------------------------------------------------------------


def _import_tools_module(skill_dir: Path, default_dir: bool) -> Any:
    if default_dir:
        return importlib.import_module(f"{__name__}.{skill_dir.name}.tools")
    mod_name = f"_ai_skill_ext_{abs(hash(str(skill_dir.resolve())))}_{skill_dir.name}_tools"
    spec = importlib.util.spec_from_file_location(mod_name, skill_dir / "tools.py")
    if spec is None or spec.loader is None:
        raise RuntimeError(f"{skill_dir}: cannot import tools.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(mod_name, None)
        raise
    return module


def _load_one(skill_dir: Path, default_dir: bool) -> Skill:
    source = f"skill '{skill_dir.name}'"
    try:
        text = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"{source}: cannot read SKILL.md ({exc})") from None
    data, body = _parse_frontmatter(text, source)

    unknown = set(data) - _ALLOWED_KEYS
    if unknown:
        raise RuntimeError(f"{source}: unknown frontmatter keys {sorted(unknown)}")

    for key in ("name", "title", "description"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            raise RuntimeError(f"{source}: frontmatter '{key}' is required (non-empty string)")
    name = data["name"].strip()
    if not _NAME_RE.match(name):
        raise RuntimeError(f"{source}: name '{name}' must be kebab-case")
    source = f"skill '{name}'"
    if not body:
        raise RuntimeError(f"{source}: SKILL.md has an empty body")

    command = data.get("command")
    if command is not None and (not isinstance(command, str) or not _COMMAND_RE.match(command)):
        raise RuntimeError(f"{source}: command must be a lowercase word without '/'")

    max_rounds = data.get("max_rounds")
    if max_rounds is not None and (
        isinstance(max_rounds, bool) or not isinstance(max_rounds, int) or max_rounds < 1
    ):
        raise RuntimeError(f"{source}: max_rounds must be a positive integer or null")

    suggested = data.get("suggested_model")
    if suggested is not None and not isinstance(suggested, str):
        raise RuntimeError(f"{source}: suggested_model must be a string or null")

    declared_tools = _str_list(data, "tools", source)
    uses = _str_list(data, "uses", source)
    requires = _str_list(data, "requires", source)
    bad_flags = set(requires) - KNOWN_REQUIRES
    if bad_flags:
        raise RuntimeError(f"{source}: unknown requires flags {sorted(bad_flags)}")

    tools: list[dict] = []
    dispatch: dict[str, Callable] = {}
    needs_email: set[str] = set()
    if (skill_dir / "tools.py").exists():
        try:
            module = _import_tools_module(skill_dir, default_dir)
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(f"{source}: tools.py failed to import ({exc})") from exc
        tools = list(getattr(module, "TOOLS", []))
        dispatch = dict(getattr(module, "DISPATCH", {}))
        needs_email = set(getattr(module, "NEEDS_USER_EMAIL", set()))

    try:
        schema_names = [t["function"]["name"] for t in tools]
    except (KeyError, TypeError):
        raise RuntimeError(f"{source}: a tools.py schema has no function.name") from None
    if len(set(schema_names)) != len(schema_names):
        raise RuntimeError(f"{source}: tools.py declares a tool twice")
    for tool_name in schema_names:
        if not tool_name.endswith("_tool"):
            raise RuntimeError(f"{source}: tool '{tool_name}' must end in '_tool'")

    missing = [t for t in declared_tools if t not in schema_names or t not in dispatch]
    if missing:
        raise RuntimeError(f"{source}: tools {missing} listed in SKILL.md but missing from tools.py")
    unlisted = [t for t in schema_names if t not in declared_tools]
    if unlisted:
        raise RuntimeError(f"{source}: tools.py defines {unlisted} not listed in SKILL.md")
    stray = [t for t in dispatch if t not in schema_names]
    if stray:
        raise RuntimeError(f"{source}: DISPATCH has {stray} with no schema in TOOLS")
    if not needs_email <= set(schema_names):
        raise RuntimeError(
            f"{source}: NEEDS_USER_EMAIL names unknown tools {sorted(needs_email - set(schema_names))}"
        )

    return Skill(
        name=name,
        title=data["title"].strip(),
        description=data["description"].strip(),
        command=command,
        body=body,
        tools=tools,
        dispatch=dispatch,
        needs_user_email=needs_email,
        uses=uses,
        max_rounds=max_rounds,
        requires=requires,
        suggested_model=suggested,
    )


def load_all(
    skills_dir: Optional[Path] = None,
    core_tool_names: Optional[Iterable[str]] = None,
    disabled_core_tool_names: Iterable[str] = (),
) -> dict[str, Skill]:
    """Discover and validate every skill under `skills_dir` (default: this package).

    `core_tool_names` are the core tools actually registered; `disabled_core_tool_names`
    are core tools that exist but are switched off by a feature flag. A skill whose
    `uses` names a disabled core tool is left out (unavailable), not an error; a `uses`
    entry naming no core tool at all raises. Raises RuntimeError on any other problem.
    The result is returned, not installed: see `install`.
    """
    default_dir = skills_dir is None
    root = Path(skills_dir) if skills_dir is not None else SKILLS_DIR
    core = set(core_tool_names or ())
    disabled = set(disabled_core_tool_names or ())
    reserved = core | disabled | {LOAD_SKILL_TOOL_NAME}

    found: list[Skill] = []
    if root.is_dir():
        for child in sorted(root.iterdir()):
            if not child.is_dir() or child.name.startswith(("_", ".")):
                continue
            if not (child / "SKILL.md").exists():
                continue
            found.append(_load_one(child, default_dir))

    registry: dict[str, Skill] = {}
    commands: dict[str, str] = {}
    tool_owner: dict[str, str] = {}
    for skill in found:
        if skill.name in registry:
            raise RuntimeError(f"Duplicate skill name '{skill.name}'")
        if skill.command:
            if skill.command in commands:
                raise RuntimeError(
                    f"Skills '{commands[skill.command]}' and '{skill.name}' share command "
                    f"'/{skill.command}'"
                )
            commands[skill.command] = skill.name
        for tool_name in skill.tool_names:
            if tool_name in reserved:
                raise RuntimeError(
                    f"Skill '{skill.name}' tool '{tool_name}' collides with a core tool"
                )
            if tool_name in tool_owner:
                raise RuntimeError(
                    f"Tool '{tool_name}' is defined by both '{tool_owner[tool_name]}' and "
                    f"'{skill.name}'"
                )
            tool_owner[tool_name] = skill.name
        registry[skill.name] = skill

    usable: dict[str, Skill] = {}
    for name, skill in registry.items():
        unknown = [u for u in skill.uses if u not in core and u not in disabled]
        if unknown:
            raise RuntimeError(f"Skill '{name}' uses unknown core tools {unknown}")
        if any(u in disabled and u not in core for u in skill.uses):
            logger.info("Skill '%s' unavailable: a core tool it uses is disabled", name)
            continue
        usable[name] = skill
    return usable


# --- registry ------------------------------------------------------------------

_REGISTRY: dict[str, Skill] = {}


def install(registry: dict[str, Skill]) -> None:
    """Make `registry` (from `load_all`) the process-wide registry."""
    global _REGISTRY
    _REGISTRY = dict(registry)


def _requirements_met(skill: Skill) -> bool:
    for flag in skill.requires:
        if flag == "investments" and not settings.AI_INVESTMENT_TOOLS_ENABLED:
            return False
        if flag == "web_search" and not settings.AI_WEB_SEARCH_ENABLED:
            return False
        # "email": always true here; per-user SMTP is checked when sending.
    return True


def available_skills() -> list[Skill]:
    """Skills whose `requires` flags are met, sorted by name."""
    return sorted((s for s in _REGISTRY.values() if _requirements_met(s)), key=lambda s: s.name)


def get_skill(name: Any) -> Optional[Skill]:
    """The skill called `name`, or None if unknown or currently unavailable."""
    if not isinstance(name, str):
        return None
    skill = _REGISTRY.get(name)
    return skill if skill is not None and _requirements_met(skill) else None


def by_command(command: Optional[str]) -> Optional[Skill]:
    if not command:
        return None
    command = command.lstrip("/")
    for skill in available_skills():
        if skill.command == command:
            return skill
    return None


# --- load_skill_tool -----------------------------------------------------------


def load_skill_tool_schema() -> Optional[dict]:
    """Schema for `load_skill_tool`, with an enum of the available skill names; None when
    no skill is available (the tool is then omitted entirely)."""
    skills = available_skills()
    if not skills:
        return None
    return {
        "type": "function",
        "function": {
            "name": LOAD_SKILL_TOOL_NAME,
            "description": (
                "Load a skill: expert instructions for a kind of task, plus any extra tools "
                "it needs (available from your next step). Call it before starting work that "
                "a listed skill covers."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "enum": [s.name for s in skills],
                        "description": "The skill to load.",
                    }
                },
                "required": ["name"],
            },
        },
    }


def load_skill_result(name: Any) -> dict:
    """The result of `load_skill_tool(name)`."""
    skill = get_skill(name)
    if skill is None:
        return {
            "error": f"Unknown skill: {name!r}. Available: {[s.name for s in available_skills()]}"
        }
    return {
        "skill": skill.name,
        "title": skill.title,
        "instructions": skill.body,
        "tools_now_available": skill.tool_names,
    }


def skills_prompt_block() -> str:
    """The short SKILLS section of the system prompt; empty when no skill is available."""
    skills = available_skills()
    if not skills:
        return ""
    listing = "\n".join(f"- {s.name} — {s.description}" for s in skills)
    return (
        "SKILLS\n"
        "You can load expert skills with `load_skill_tool`. Before doing work that a skill "
        "covers, call it first and follow the method it returns; loading it also unlocks "
        "its extra tools. Skip it for simple questions. Available skills:\n"
        f"{listing}"
    )
