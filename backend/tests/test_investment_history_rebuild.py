"""History reconstruction for brokers whose trade tape has no deposits.

The scenario mirrors the live Freedom24 account that exposed the bugs: shares
bought with money the tape never shows arriving, an FX round trip booked as two
legs, and a small overdraft left by commissions.
"""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.models import Account, InvestmentCredential, PortfolioSnapshot
from app.services import investment_sync_service
from app.services.investment_sync_service import (
    _minimal_flow_cash_path,
    _reconstruct_daily_values,
)
from app.services.investment_providers.base import ProviderPosition

from tests.test_investments import FakeProvider, _patch_provider


def _txn(day, type_, amount, currency="EUR", symbol=None, quantity=None, price=None):
    return SimpleNamespace(
        date=datetime.combine(day, datetime.min.time()),
        type=type_,
        amount=amount,
        currency=currency,
        symbol=symbol,
        quantity=quantity,
        price=price,
    )


def _position(symbol, quantity, price):
    return ProviderPosition(
        symbol=symbol, name=None, quantity=quantity, avg_price=price,
        current_price=price, market_value=quantity * price, currency="EUR",
    )


def test_cash_never_goes_negative_before_an_unseen_deposit():
    d0, d1, d2 = date(2026, 8, 10), date(2026, 8, 11), date(2026, 8, 12)
    txns = [
        _txn(d0, "buy", -100.0, symbol="MOH.GR", quantity=2, price=50.0),
        _txn(d0, "fee", -2.0),
    ]
    points = _reconstruct_daily_values(
        txns=txns,
        positions=[_position("MOH.GR", 2, 55.0)],
        closes_by_symbol={"MOH.GR": {d0: 50.0, d1: 52.0, d2: 55.0}},
        start=d0, end=d2,
        live_total=110.0, live_cash=0.0, live_positions=110.0,
        base_currency="EUR",
    )
    by_day = {p["date"]: p for p in points}
    # The 102 EUR the buy needed is assumed deposited that day, so the account
    # is worth what it holds — not -102 cash against 100 of shares.
    assert by_day[d0]["cash_balance"] == 0.0
    assert by_day[d0]["total_value"] == 100.0
    assert by_day[d1]["total_value"] == 104.0
    assert all(p["cash_balance"] >= 0 for p in points)


def test_fx_round_trip_does_not_create_money():
    d0, d1 = date(2026, 11, 11), date(2026, 11, 12)
    txns = [
        _txn(d0, "buy", -50.0, symbol="X.EU", quantity=1, price=50.0),
        _txn(d1, "sell", 50.0, symbol="X.EU", quantity=1, price=50.0),
        # EUR -> USD -> EUR, each conversion with both legs.
        _txn(d1, "fx", 55.0, currency="USD"),
        _txn(d1, "fx", -50.0, currency="EUR"),
        _txn(d1, "fx", 50.0, currency="EUR"),
        _txn(d1, "fx", -55.0, currency="USD"),
    ]
    points = _reconstruct_daily_values(
        txns=txns, positions=[],
        closes_by_symbol={"X.EU": {d0: 50.0, d1: 50.0}},
        start=d0, end=d1,
        live_total=50.0, live_cash=50.0, live_positions=0.0,
        fx_rates={"EUR": 1.0, "USD": 1 / 1.1}, base_currency="EUR",
    )
    assert [p["total_value"] for p in points] == [50.0, 50.0]


def test_foreign_currency_amounts_and_marks_are_converted():
    d0 = date(2026, 7, 30)
    txns = [_txn(d0, "buy", -110.0, currency="USD", symbol="INUV.US", quantity=1, price=110.0)]
    points = _reconstruct_daily_values(
        txns=txns, positions=[],
        closes_by_symbol={"INUV.US": {d0: 110.0}},
        start=d0, end=d0 + timedelta(days=1),
        live_total=100.0, live_cash=0.0, live_positions=100.0,
        fx_rates={"USD": 1 / 1.1}, base_currency="EUR",
    )
    assert points[0]["positions_value"] == pytest.approx(100.0)
    assert points[0]["cash_balance"] == 0.0


def test_trades_before_the_window_set_the_opening_holdings():
    before, d0 = date(2020, 1, 1), date(2026, 1, 1)
    txns = [_txn(before, "buy", -10.0, symbol="A", quantity=1, price=10.0)]
    points = _reconstruct_daily_values(
        txns=txns, positions=[_position("A", 1, 12.0)],
        closes_by_symbol={"A": {d0: 12.0}},
        start=d0, end=d0,
        live_total=12.0, live_cash=0.0, live_positions=12.0,
        base_currency="EUR",
    )
    assert points[0]["positions_value"] == 12.0


def test_minimal_flow_path_withdraws_surplus_where_it_was_idle():
    # Sold for 100 on day 1, bought for 60 on day 3; 10 left today.
    path = _minimal_flow_cash_path([0.0, 100.0, 0.0, -60.0, 0.0], live_cash=10.0)
    # The 30 nobody spent is withdrawn as soon as it was free (day 1).
    assert path == [0.0, 70.0, 70.0, 10.0, 10.0]
    # A slightly overdrawn live balance is a valid floor, not a reason to inject.
    assert _minimal_flow_cash_path([0.0, -1.07], live_cash=-1.07) == [0.0, -1.07]
    # More cash now than trades explain: an early idle deposit.
    assert _minimal_flow_cash_path([0.0, 0.0], live_cash=5.0) == [5.0, 5.0]


def test_outdated_history_is_rebuilt_once(client, db, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider)
    resp = client.post(
        "/api/investments/accounts",
        json={"name": "F24", "provider": "freedom24", "currency": "USD",
              "public_key": "p", "private_key": "q"},
    )
    account_id = resp.json()["id"]
    credential = db.query(InvestmentCredential).filter_by(account_id=account_id).one()
    assert credential.history_version == investment_sync_service.HISTORY_VERSIONS["freedom24"]

    # Simulate a curve left by the old reconstruction.
    credential.history_version = 0
    db.query(PortfolioSnapshot).filter_by(account_id=account_id).filter(
        PortfolioSnapshot.date < date.today()
    ).update({"cash_balance": -93.8, "total_value": -1.0})
    db.commit()

    account = db.get(Account, account_id)
    investment_sync_service.sync_account(db, account)
    db.refresh(credential)
    assert credential.sync_status == "ok"
    assert credential.history_version == investment_sync_service.HISTORY_VERSIONS["freedom24"]
    snaps = db.query(PortfolioSnapshot).filter_by(account_id=account_id).all()
    assert len(snaps) >= 2
    assert all(s.cash_balance >= 0 for s in snaps)
