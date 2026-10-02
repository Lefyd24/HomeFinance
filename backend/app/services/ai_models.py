"""Which models the AI advisor may use, how large their context is, and what they cost.

Prices and context windows come from OpenRouter's public catalogue, cached in memory for a
day (a user can force a refresh). Every model in it that supports tools can be chosen for a
turn. When the catalogue cannot be reached the last copy keeps being served, and the default
model still works: costs then fall back to what OpenRouter reports per call, or to the
configured fallback prices.
"""
import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException

from app.config import Settings, settings
from app.llm.openrouter import OpenRouterClient, Usage

log = logging.getLogger("app.ai")

CACHE_SECONDS = 24 * 3600
RETRY_SECONDS = 60
DEFAULT_CONTEXT_TOKENS = 128_000
# Share of the window kept free for tokenizer drift: our pre-call counts are estimates.
CONTEXT_SAFETY_MARGIN = 0.05


@dataclass(frozen=True)
class ModelInfo:
    id: str
    name: str
    context_length: int
    # USD per million tokens; None when the catalogue did not list the model.
    prompt_per_m: float | None
    completion_per_m: float | None
    cache_read_per_m: float | None
    supports_tools: bool
    known: bool  # False when the catalogue was unreachable or does not list this id

    def history_budget(self, cfg: Settings) -> int:
        """Tokens a request to this model may carry: its context window minus a safety
        margin and room for the answer."""
        usable = int(self.context_length * (1 - CONTEXT_SAFETY_MARGIN))
        return max(usable - cfg.AI_MAX_OUTPUT_TOKENS, 4_000)

    def cost_usd(self, usage: Usage, cfg: Settings) -> tuple[float, bool]:
        """(cost, estimated). OpenRouter's reported cost wins; otherwise the catalogue price,
        otherwise the configured fallback price. Cached prompt tokens are billed at the cache
        read price when the model has one."""
        if usage.cost_usd is not None:
            return usage.cost_usd, False
        prompt_price = self.prompt_per_m
        if prompt_price is None:
            prompt_price = cfg.AI_FALLBACK_PRICE_IN_PER_M
        completion_price = self.completion_per_m
        if completion_price is None:
            completion_price = cfg.AI_FALLBACK_PRICE_OUT_PER_M
        cache_price = self.cache_read_per_m if self.cache_read_per_m is not None else prompt_price
        fresh = max(usage.prompt_tokens - usage.cached_tokens, 0)
        cost = (
            fresh * prompt_price
            + usage.cached_tokens * cache_price
            + usage.completion_tokens * completion_price
        ) / 1_000_000
        return cost, True


def _per_million(pricing: dict[str, Any], key: str) -> float | None:
    value = pricing.get(key)
    try:
        return float(value) * 1_000_000 if value is not None else None
    except (TypeError, ValueError):
        return None


def _parse(entry: dict[str, Any]) -> ModelInfo:
    pricing: dict[str, Any] = entry.get("pricing") or {}
    supported: list[str] = entry.get("supported_parameters") or []
    return ModelInfo(
        id=str(entry["id"]),
        name=str(entry.get("name") or entry["id"]),
        context_length=int(entry.get("context_length") or DEFAULT_CONTEXT_TOKENS),
        prompt_per_m=_per_million(pricing, "prompt"),
        completion_per_m=_per_million(pricing, "completion"),
        cache_read_per_m=_per_million(pricing, "input_cache_read"),
        supports_tools="tools" in supported,
        known=True,
    )


class ModelCatalog:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._models: dict[str, ModelInfo] = {}
        self._fetched_at = 0.0  # monotonic; decides when the cache is stale
        self._fetched_on: datetime | None = None  # wall clock; shown to the user

    def reset(self) -> None:
        with self._lock:
            self._models = {}
            self._fetched_at = 0.0
            self._fetched_on = None

    @property
    def fetched_at(self) -> datetime | None:
        """When the catalogue was last downloaded, None if it never was."""
        return self._fetched_on

    def _refresh(self, client: OpenRouterClient, *, force: bool = False) -> None:
        with self._lock:
            fresh = time.monotonic() - self._fetched_at < CACHE_SECONDS
            if self._models and fresh and not force:
                return
            try:
                entries = client.list_models()
            except (httpx.HTTPError, ValueError) as error:
                log.warning("OpenRouter model catalogue unavailable: %s", error)
                # keep serving the last copy and try again soon
                self._fetched_at = time.monotonic() - CACHE_SECONDS + RETRY_SECONDS
                return
            self._models = {info.id: info for info in (_parse(e) for e in entries if e.get("id"))}
            self._fetched_at = time.monotonic()
            self._fetched_on = datetime.now(timezone.utc)

    def get(self, model_id: str, client: OpenRouterClient | None) -> ModelInfo:
        if client is not None:
            self._refresh(client)
        return self._models.get(model_id) or ModelInfo(
            id=model_id,
            name=model_id,
            context_length=DEFAULT_CONTEXT_TOKENS,
            prompt_per_m=None,
            completion_per_m=None,
            cache_read_per_m=None,
            supports_tools=True,
            known=False,
        )

    def all_models(
        self, client: OpenRouterClient | None, *, force: bool = False
    ) -> list[ModelInfo]:
        """Every catalogue model the agent can drive (it needs function tools), by name."""
        if client is not None:
            self._refresh(client, force=force)
        usable = (m for m in self._models.values() if m.supports_tools)
        return sorted(usable, key=lambda m: (m.name.lower(), m.id))

    def is_selectable(self, model_id: str, client: OpenRouterClient | None) -> bool:
        """True when the catalogue lists the model and it supports tools."""
        if client is not None:
            self._refresh(client)
        info = self._models.get(model_id)
        return info is not None and info.supports_tools


catalog = ModelCatalog()


def make_client() -> OpenRouterClient | None:
    """A client from the current settings, or None when no API key is configured."""
    if not settings.OPENROUTER_API_KEY:
        return None
    return OpenRouterClient()


def resolve_model(requested: str | None, client: OpenRouterClient | None) -> ModelInfo:
    """The model for this turn. The configured default always passes (so a catalogue outage
    never strands the chat); anything else must be catalogue-listed with tool support."""
    default = settings.AI_DEFAULT_MODEL
    if not requested or requested == default:
        return catalog.get(default, client)
    if not catalog.is_selectable(requested, client):
        raise HTTPException(
            status_code=422,
            detail=f"Model '{requested}' is not available for the AI advisor.",
        )
    return catalog.get(requested, client)
