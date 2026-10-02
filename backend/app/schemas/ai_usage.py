from pydantic import BaseModel


class AiUsageByModel(BaseModel):
    model: str
    turns: int
    cost_usd: float
    prompt_tokens: int
    completion_tokens: int


class AiUsageOut(BaseModel):
    month: str
    cost_usd: float
    turns: int
    prompt_tokens: int
    completion_tokens: int
    household_cost_usd: float
    cap_usd: float | None
    by_model: list[AiUsageByModel]
