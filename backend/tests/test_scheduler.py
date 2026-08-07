from datetime import date, timedelta

from tests.factories import make_account, make_recurring
from app.models.notification import NotificationSettings, NotificationLog


class _FakeApp:
    NOTIFICATIONS_ENABLED = True
    SMTP_HOST = None
    VAPID_PRIVATE_KEY = None
    # Bank sync off by default here; test_bank_sync.py covers the sync path.
    BANK_SYNC_ENABLED = False
    EB_CONSENT_WARN_DAYS = 7


def test_run_tick_creates_log(db, seed_user, monkeypatch):
    from app.services import scheduler
    import app.services.notification_service as ns

    acc = make_account(db, seed_user)
    make_recurring(
        db,
        seed_user,
        account=acc,
        name="Spotify",
        amount=10,
        next_due_date=date.today() + timedelta(days=1),
        notify=True,
        days_before=3,
    )
    db.add(NotificationSettings(user_id=seed_user.id, email_enabled=True))
    db.commit()
    monkeypatch.setattr(ns, "_send_email", lambda *a, **k: True)
    scheduler.run_tick(lambda: db, app_settings=_FakeApp())
    assert db.query(NotificationLog).count() >= 1


class _SchedulerFakeApp:
    NOTIFICATIONS_ENABLED = False
    INVESTMENT_SYNC_ENABLED = False
    BANK_SYNC_ENABLED = False
    SCENARIO_TRACKING_ENABLED = True
    SCENARIO_VALUATION_HOUR_UTC = 22


def test_scenario_valuation_tick_registered_when_enabled():
    from app.services import scheduler

    scheduler.start_scheduler(_SchedulerFakeApp(), lambda: None)
    try:
        job_ids = [j.id for j in scheduler._scheduler.get_jobs()]
        assert "scenario_valuation_tick" in job_ids
    finally:
        scheduler.shutdown_scheduler()


def test_scenario_valuation_tick_absent_when_disabled():
    from app.services import scheduler

    class _Disabled(_SchedulerFakeApp):
        SCENARIO_TRACKING_ENABLED = False
        # start_scheduler no-ops entirely when nothing is enabled; flip one job on
        # so the scheduler actually starts and we can assert the other is absent.
        NOTIFICATIONS_ENABLED = True
        SMTP_HOST = None
        VAPID_PRIVATE_KEY = None

    scheduler.start_scheduler(_Disabled(), lambda: None)
    try:
        job_ids = [j.id for j in scheduler._scheduler.get_jobs()]
        assert "scenario_valuation_tick" not in job_ids
    finally:
        scheduler.shutdown_scheduler()


def test_scenario_valuation_tick_idempotent_and_backfills(db, seed_user, monkeypatch):
    import pandas as pd

    from app.services import scenario_service, scheduler
    from app.models.scenario import Scenario, ScenarioValuation

    class _Meta:
        currency = "EUR"
        quote_type = "equity"

    def fake_price_history(symbols, start, end, *, db, refresh=False):
        idx = pd.bdate_range(start, end)
        return {sym: pd.DataFrame({"close": [100.0] * len(idx)}, index=idx) for sym in symbols}

    def fake_symbol_meta(db, symbol, *, refresh=False):
        return _Meta()

    def fake_risk_free(db, start, end, *, override_annual=None):
        idx = pd.date_range(start, end, freq="D")
        return pd.Series(0.02, index=idx), "fallback_constant"

    def fake_to_currency(frame, from_ccy, to_ccy, db):
        return frame, False

    monkeypatch.setattr(scenario_service, "get_price_history", fake_price_history)
    monkeypatch.setattr(scenario_service, "get_symbol_meta", fake_symbol_meta)
    monkeypatch.setattr(scenario_service, "get_risk_free_rate", fake_risk_free)
    monkeypatch.setattr(scenario_service, "to_currency", fake_to_currency)

    start = date.today() - timedelta(days=40)
    row = Scenario(
        user_id=seed_user.id, name="Test fwd", kind="forward", symbol="TST",
        start_date=start, initial_amount=1000.0, currency="EUR",
        contribution_amount=0.0, contribution_freq="none", benchmark=None,
        cost_bps=0.0, cost_flat=0.0, dividend_treatment="reinvest",
        dividend_withholding_pct=0.0, status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    scenario_id = row.id

    scheduler.run_scenario_valuation_tick(lambda: db)
    count_first = (
        db.query(ScenarioValuation).filter(ScenarioValuation.scenario_id == scenario_id).count()
    )
    assert count_first > 0

    scheduler.run_scenario_valuation_tick(lambda: db)
    count_second = (
        db.query(ScenarioValuation).filter(ScenarioValuation.scenario_id == scenario_id).count()
    )
    assert count_second == count_first

    rows = (
        db.query(ScenarioValuation)
        .filter(ScenarioValuation.scenario_id == scenario_id)
        .order_by(ScenarioValuation.date)
        .all()
    )
    to_delete = rows[-14:] if len(rows) >= 14 else rows
    deleted_dates = {r.date for r in to_delete}
    for r in to_delete:
        db.delete(r)
    db.commit()

    scheduler.run_scenario_valuation_tick(lambda: db)
    remaining = db.query(ScenarioValuation).filter(ScenarioValuation.scenario_id == scenario_id).all()
    remaining_dates = {r.date for r in remaining}
    assert deleted_dates.issubset(remaining_dates)
    assert len(remaining) == count_first
