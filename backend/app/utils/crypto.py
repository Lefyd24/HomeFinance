import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.config import settings


class DecryptionError(Exception):
    """Raised when a stored secret cannot be decrypted with the current key.

    This happens when NOTIFICATION_ENCRYPTION_KEY (or the SECRET_KEY it derives
    from, if unset) has changed since the value was encrypted — e.g. after a
    SECRET_KEY rotation. Callers should catch this and prompt the user to
    re-enter the secret rather than surfacing a raw 500 error.
    """


def _derive(raw: str) -> Fernet:
    digest = hashlib.sha256(raw.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _fernet() -> MultiFernet:
    # Current key first (used to encrypt); previous keys only decrypt/rotate.
    current = settings.NOTIFICATION_ENCRYPTION_KEY or settings.SECRET_KEY
    previous = [
        k.strip()
        for k in (settings.NOTIFICATION_ENCRYPTION_KEY_PREVIOUS or "").split(",")
        if k.strip()
    ]
    return MultiFernet([_derive(k) for k in [current, *previous]])


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def rotate(token: str) -> str:
    """Re-encrypt a token under the current key."""
    try:
        return _fernet().rotate(token.encode()).decode()
    except InvalidToken as exc:
        raise DecryptionError("Stored value could not be decrypted with any configured key.") from exc


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise DecryptionError(
            "Stored value could not be decrypted — the encryption key has changed "
            "since it was saved. It needs to be re-entered."
        ) from exc
