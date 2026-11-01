import importlib.util
from pathlib import Path

import pytest

from app.models import BankConnection, InvestmentCredential, NotificationSettings
from app.utils import crypto

_spec = importlib.util.spec_from_file_location(
    "rotate_encryption_key",
    Path(__file__).resolve().parent.parent / "scripts" / "rotate_encryption_key.py",
)
script = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(script)


@pytest.fixture()
def seeded(db, monkeypatch):
    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY", "k-old")
    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY_PREVIOUS", None)
    db.add(BankConnection(user_id=1, aspsp_name="B", aspsp_country="GR", status="active",
                          session_id_encrypted=crypto.encrypt("sess")))
    db.add(InvestmentCredential(account_id=1, provider="p",
                                encrypted_public_key=crypto.encrypt("pub"),
                                encrypted_private_key=crypto.encrypt("priv")))
    db.add(NotificationSettings(user_id=1, smtp_password_encrypted=crypto.encrypt("smtp")))
    db.commit()
    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY", "k-new")
    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY_PREVIOUS", "k-old")
    return db


def _values(db):
    return [
        db.query(BankConnection).one().session_id_encrypted,
        db.query(InvestmentCredential).one().encrypted_public_key,
        db.query(InvestmentCredential).one().encrypted_private_key,
        db.query(NotificationSettings).one().smtp_password_encrypted,
    ]


def test_rotates_all_four_columns(seeded, monkeypatch):
    counts = script.rotate_all(seeded)
    assert sorted(counts.values()) == [1, 1, 1, 1]
    monkeypatch.setattr(crypto.settings, "NOTIFICATION_ENCRYPTION_KEY_PREVIOUS", None)
    assert [crypto.decrypt(v) for v in _values(seeded)] == ["sess", "pub", "priv", "smtp"]


def test_dry_run_changes_nothing(seeded):
    before = _values(seeded)
    counts = script.rotate_all(seeded, dry_run=True)
    assert sorted(counts.values()) == [1, 1, 1, 1]
    seeded.expire_all()
    assert _values(seeded) == before


def test_failure_midway_rolls_back(seeded):
    before = _values(seeded)
    seeded.query(NotificationSettings).one().smtp_password_encrypted = "garbage"
    seeded.commit()
    with pytest.raises(crypto.DecryptionError):
        script.rotate_all(seeded)
    seeded.expire_all()
    assert _values(seeded)[:3] == before[:3]
