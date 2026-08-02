from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.rule_service import TEXT_FIELDS, validate_regex

FieldName = Literal["description", "amount", "account_id", "type", "counterparty"]
MatchType = Literal["all", "any"]
Operator = Literal[
    "contains",
    "not_contains",
    "equals",
    "starts_with",
    "ends_with",
    "regex",
    "eq",
    "lt",
    "lte",
    "gt",
    "gte",
    "between",
    "not_eq",
]


class ConditionInput(BaseModel):
    field: FieldName
    operator: Operator
    value: Optional[str] = None
    value_to: Optional[str] = None

    @model_validator(mode="after")
    def validate_operator_for_field(self):
        field = self.field
        op = self.operator
        text_ops = {
            "contains",
            "not_contains",
            "equals",
            "starts_with",
            "ends_with",
            "regex",
        }
        amount_ops = {"eq", "lt", "lte", "gt", "gte", "between"}
        if field in TEXT_FIELDS and op not in text_ops:
            raise ValueError(f"Operator {op} is not valid for field {field}")
        if field == "amount" and op not in amount_ops:
            raise ValueError(f"Operator {op} is not valid for field amount")
        if field == "account_id" and op not in {"eq", "not_eq"}:
            raise ValueError(f"Operator {op} is not valid for field account_id")
        if field == "type" and op != "eq":
            raise ValueError("Operator eq is required for field type")
        if op == "between" and (self.value is None or self.value_to is None):
            raise ValueError("between requires value and value_to")
        if op == "regex":
            validate_regex(self.value or "")
        return self


class CategoryRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category_id: int
    match_type: MatchType = "all"
    priority: int = 100
    is_active: bool = True
    stop_on_match: bool = True
    conditions: list[ConditionInput] = Field(..., min_length=1)
    apply_to_existing: bool = False
    include_categorised: bool = False


class CategoryRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category_id: Optional[int] = None
    match_type: Optional[MatchType] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    stop_on_match: Optional[bool] = None
    conditions: Optional[list[ConditionInput]] = Field(None, min_length=1)


class ConditionResponse(BaseModel):
    id: int
    field: str
    operator: str
    value: Optional[str] = None
    value_to: Optional[str] = None

    class Config:
        from_attributes = True


class CategoryRuleResponse(BaseModel):
    id: int
    user_id: int
    name: str
    category_id: int
    category_name: Optional[str] = None
    match_type: str
    priority: int
    is_active: bool
    stop_on_match: bool
    times_applied: int
    last_applied_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    conditions: list[ConditionResponse] = []

    class Config:
        from_attributes = True


class RulePreviewRequest(BaseModel):
    match_type: MatchType = "all"
    conditions: list[ConditionInput] = Field(..., min_length=1)
    include_categorised: bool = False
    sample_size: int = Field(default=5, ge=0, le=50)


class RulePreviewSample(BaseModel):
    id: int
    date: Optional[str] = None
    description: str
    amount: float
    type: str
    category_id: Optional[int] = None
    account_id: int


class RulePreviewResponse(BaseModel):
    match_count: int
    sample: list[RulePreviewSample]


class RuleApplyRequest(BaseModel):
    include_categorised: bool = False


class RuleApplyResponse(BaseModel):
    updated: int


class RuleReorderRequest(BaseModel):
    rule_ids: list[int] = Field(..., min_length=1)

    @field_validator("rule_ids")
    @classmethod
    def unique_ids(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("rule_ids must be unique")
        return value
