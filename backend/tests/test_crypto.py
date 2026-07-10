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
