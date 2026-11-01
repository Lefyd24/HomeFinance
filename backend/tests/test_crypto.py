def test_encrypt_roundtrip(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_ENCRYPTION_KEY", "test-key-please-change-1234567890")
    from importlib import reload
    from app import config as cfg
    reload(cfg)
    from app.utils import crypto
    from importlib import reload as r2
    r2(crypto)
    token = crypto.encrypt("hunter2")
    assert token != "hunter2"
    assert crypto.decrypt(token) == "hunter2"


def _legacy_token(raw: str, plaintext: str) -> str:
    import base64, hashlib
    from cryptography.fernet import Fernet

    key = base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())
    return Fernet(key).encrypt(plaintext.encode()).decode()


def test_legacy_ciphertext_still_decrypts_with_unchanged_settings(monkeypatch):
    from app.utils import crypto

    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY", "k-current")
    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY_PREVIOUS", None)
    assert crypto.decrypt(_legacy_token("k-current", "pw")) == "pw"

    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY", None)
    assert crypto.decrypt(_legacy_token(crypto.settings.SECRET_KEY, "pw2")) == "pw2"


def test_previous_key_decrypts_and_rotate_moves_to_new_key(monkeypatch):
    import pytest
    from app.utils import crypto

    old = _legacy_token("k-old", "secret")
    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY", "k-new")
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(old)

    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY_PREVIOUS", "k-x, k-old")
    assert crypto.decrypt(old) == "secret"
    rotated = crypto.rotate(old)

    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY_PREVIOUS", None)
    assert crypto.decrypt(rotated) == "secret"
    with pytest.raises(crypto.DecryptionError):
        crypto.rotate(old)
