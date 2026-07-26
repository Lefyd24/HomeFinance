import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class DecryptionError(Exception):
    """Raised when a stored secret cannot be decrypted with the current key.

    This happens when NOTIFICATION_ENCRYPTION_KEY (or the SECRET_KEY it derives
    from, if unset) has changed since the value was encrypted — e.g. after a
    SECRET_KEY rotation. Callers should catch this and prompt the user to
    re-enter the secret rather than surfacing a raw 500 error.
    """


def _fernet() -> Fernet:
    raw = settings.NOTIFICATION_ENCRYPTION_KEY or settings.SECRET_KEY
    digest = hashlib.sha256(raw.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise DecryptionError(
            "Stored value could not be decrypted — the encryption key has changed "
            "since it was saved. It needs to be re-entered."
        ) from exc
