"""Public operator identity for the Privacy Policy and Terms pages."""
from app.config import settings
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/legal", tags=["Legal"])


class LegalConfigOut(BaseModel):
    operator: str | None
    contact_email: str | None
    jurisdiction: str | None
    configured: bool


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@router.get("", response_model=LegalConfigOut)
def get_legal_config():
    """Unauthenticated on purpose.

    Enable Banking, the banks' consent screens and the data-sharing portal link
    to /privacy and /terms for people with no account here, so the page that
    renders them must be able to load this without a token. It only exposes
    what the operator chose to publish on those pages anyway.
    """
    operator = _clean(settings.LEGAL_OPERATOR_NAME)
    contact_email = _clean(settings.LEGAL_CONTACT_EMAIL)
    return LegalConfigOut(
        operator=operator,
        contact_email=contact_email,
        jurisdiction=_clean(settings.LEGAL_JURISDICTION),
        configured=bool(operator and contact_email),
    )
