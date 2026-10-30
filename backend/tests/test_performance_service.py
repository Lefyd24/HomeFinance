from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pandas as pd
import pytest

from app.models import User
from app.services import performance_service as ps
from tests.factories import make_investment_account, make_snapshot

D0 = date(2026, 1, 1)


def days(n):
    return [D0 + timedelta(days=i) for i in range(n)]


def txn(type, amount, day, currency="USD", symbol=None, quantity=None):
    return SimpleNamespace(
        type=type, amount=amount, currency=currency, symbol=symbol, quantity=quantity,
        date=datetime(day.year, day.month, day.day),
    )


def ident(amount, currency, day):
    return amount


def test_deposit_mid_period_is_not_counted_as_return():
    built = ps.build_series(days(3), [1000, 1000, 2100], [0, 0, 0], [0, 0, 1000])
    # day 2: (2100 - 1000 - 1000) / (1000 + 1000) = 0.05
    assert built["points"][-1]["twr"] == pytest.approx(0.05)
    assert built["points"][-1]["net_invested"] == pytest.approx(2000)


def test_series_starts_on_first_funded_day():
    d = days(4)
    built = ps.build_series(d, [0, 0, 1000, 1100], [0] * 4, [0, 0, 1000, 0])
    assert built["points"][0]["date"] == d[2]
    assert built["points"][0]["daily_return"] == pytest.approx(0.0)
    assert built["points"][-1]["twr"] == pytest.approx(0.1)
    summary = ps.summarize(d, [0, 0, 1000, 1100], [0, 0, 1000, 0], built)
    assert summary.start_value == 0 and summary.net_flows == 1000 and summary.gain == pytest.approx(100)


def test_never_funded_series_is_none():
    assert ps.build_series(days(3), [0, 0, 0], [0, 0, 0], [0, 0, 0]) is None


def test_inferred_flow_from_cash_change():
    d = days(3)
    snaps = [(d[0], 1000, 1000), (d[1], 1500, 750), (d[2], 1500, 750)]
    # day 1: cash -250, buy -750 => deposit 500
    buy = txn("buy", -750, d[1], symbol="AAPL", quantity=5)
    flows, source, net = ps.account_flows(snaps, [buy], ident)
    assert flows == pytest.approx([0, 500, 0])
    assert source == "inferred"
    assert net == pytest.approx(1500)  # opening value + deposit


def test_inferred_noise_below_threshold_is_zero():
    d = days(2)
    flows, _, _ = ps.account_flows([(d[0], 10000, 100), (d[1], 10000, 130)], [], ident)
    assert flows == [0, 0]  # 30 < 0.5% of 10000


def test_reported_usdt_deposit():
    d = days(3)
    snaps = [(d[0], 1000, 1000), (d[1], 1500, 1500), (d[2], 1500, 1500)]
    deposit = txn("deposit", 500, d[1], currency="USDT")
    convert = lambda a, c, day: ps.convert_amount(a, c, "USD", day, lambda *x: None, lambda *x: None)
    flows, source, net = ps.account_flows(snaps, [deposit], convert)
    assert flows == pytest.approx([0, 500, 0])
    assert source == "reported"
    assert net == pytest.approx(500)


def test_reported_usdt_converted_to_eur_and_coin_priced():
    fx = lambda f, t, day: 0.9 if (f, t) == ("USD", "EUR") else None
    coin = lambda c, day: 20000.0 if c == "BTC" else None
    assert ps.convert_amount(500, "USDT", "EUR", D0, fx, coin) == pytest.approx(450)
    assert ps.convert_amount(0.1, "BTC", "EUR", D0, fx, coin) == pytest.approx(1800)
    assert ps.convert_amount(1, "ETH", "EUR", D0, fx, coin) is None


def test_unpriced_coin_deposit_falls_back_to_inference():
    d = days(2)
    snaps = [(d[0], 1000, 1000), (d[1], 1600, 1600)]
    deposit = txn("deposit", 0.01, d[1], currency="ETH")
    flows, source, _ = ps.account_flows(snaps, [deposit], lambda a, c, day: None)
    assert flows == pytest.approx([0, 600])
    assert source == "mixed"


def test_xirr_known_case():
    r = ps.xirr([(D0, -1000), (D0 + timedelta(days=365), 1100)])
    assert r == pytest.approx(0.10, abs=1e-4)


def test_xirr_no_sign_change():
    assert ps.xirr([(D0, -1000), (D0 + timedelta(days=365), -5)]) is None


def test_breakdown_sums_to_total_gain():
    d = days(3)
    txns = [
        txn("buy", -1000, d[0], symbol="A", quantity=10),
        txn("sell", 700, d[1], symbol="A", quantity=5),  # avg 100 => realized 200
        txn("dividend", 20, d[1]),
        txn("tax", -3, d[1]),
        txn("fee", -2, d[1]),
    ]
    positions = [SimpleNamespace(market_value_base=600, cost_basis_base=500)]
    parts = ps.account_breakdown(txns, positions, d, [0, 0, 0], ident, None)
    assert parts["realized"] == pytest.approx(200)
    assert parts["unrealized"] == pytest.approx(100)
    b = ps.build_breakdown([parts], v_now=1300, net_invested=1000)
    assert b.total_gain == pytest.approx(300)
    assert b.fx_and_other == pytest.approx(300 - (100 + 200 + 20 - 3 - 2))
    comps = b.unrealized + b.realized + b.dividends + b.taxes + b.fees + b.fx_and_other
    assert comps == pytest.approx(b.total_gain)


def test_estimated_commission_only_without_fee_row():
    d = days(2)
    settings = SimpleNamespace(
        commission_fixed=1.0, commission_pct=0.5, deposit_fee_fixed=None, deposit_fee_pct=None,
        withdrawal_fee_fixed=None, withdrawal_fee_pct=None,
    )
    txns = [
        txn("buy", -1000, d[0], symbol="A", quantity=10),
        txn("fee", -1.5, d[0], symbol="A"),  # A on d0 already has a reported fee
        txn("buy", -2000, d[1], symbol="B", quantity=10),
    ]
    parts = ps.account_breakdown(txns, [], d, [0, 0], ident, settings)
    assert parts["fees_estimated"] == pytest.approx(-(1 + 0.005 * 2000))
    assert parts["fees"] == pytest.approx(-1.5 - 11)


def test_deposit_fee_applied_to_flows():
    settings = SimpleNamespace(
        commission_fixed=None, commission_pct=None, deposit_fee_fixed=1.0, deposit_fee_pct=1.0,
        withdrawal_fee_fixed=2.0, withdrawal_fee_pct=None,
    )
    parts = ps.account_breakdown([], [], days(3), [0, 500, -100], ident, settings)
    assert parts["fees_estimated"] == pytest.approx(-(1 + 5) - 2)


def test_sell_without_prior_buys_is_not_realized_gain():
    d = days(2)
    parts = ps.account_breakdown([txn("sell", 5000, d[0], symbol="X", quantity=10)], [], d, [0, 0], ident, None)
    assert parts["realized"] == 0 and parts["partial_history"] is True
    assert ps.build_breakdown([parts], 0, 0).partial_history is True


def test_partial_sell_realizes_only_covered_part():
    d = days(2)
    txns = [txn("buy", -100, d[0], symbol="X", quantity=5), txn("sell", 400, d[1], symbol="X", quantity=10)]
    parts = ps.account_breakdown(txns, [], d, [0, 0], ident, None)
    assert parts["realized"] == pytest.approx(200 - 100) and parts["partial_history"] is True


def test_sell_of_renamed_successor_uses_predecessor_buys():
    d = days(2)
    txns = [txn("buy", -100, d[0], symbol="OLD", quantity=10), txn("sell", 150, d[1], symbol="NEW", quantity=10)]
    parts = ps.account_breakdown(txns, [], d, [0, 0], ident, None, {"OLD": "NEW"})
    assert parts["realized"] == pytest.approx(50) and parts["partial_history"] is False


def test_commission_not_estimated_when_fee_row_under_predecessor():
    d = days(2)
    settings = SimpleNamespace(
        commission_fixed=1.0, commission_pct=None, deposit_fee_fixed=None, deposit_fee_pct=None,
        withdrawal_fee_fixed=None, withdrawal_fee_pct=None,
    )
    txns = [txn("buy", -100, d[0], symbol="NEW", quantity=1), txn("fee", -1, d[0], symbol="OLD")]
    parts = ps.account_breakdown(txns, [], d, [0, 0], ident, settings, {"OLD": "NEW"})
    assert parts["fees_estimated"] == 0


def test_historical_fx_beats_current_position_rate():
    d = days(3)
    market = SimpleNamespace(close=lambda sym, day: 1.10 if sym == "EURUSD=X" else None)
    pos = SimpleNamespace(currency="EUR", fx_rate=1.20)
    convert = ps._make_convert("USD", [pos], market)
    snaps = [(d[0], 10000, 5000), (d[1], 10000, 3900), (d[2], 10000, 3900)]
    flows, _, _ = ps.account_flows(snaps, [txn("buy", -1000, d[1], currency="EUR", symbol="E", quantity=1)], convert)
    assert flows == pytest.approx([0, 0, 0])
    # no history -> current position rate
    no_hist = ps._make_convert("USD", [pos], SimpleNamespace(close=lambda s, day: None))
    assert no_hist(100, "EUR", d[0]) == pytest.approx(120)


def test_range_includes_start_day_return(client, db, seed_user, monkeypatch):
    monkeypatch.setattr(ps, "get_price_history", _prices({}))
    acct = make_investment_account(db, seed_user, currency="USD")
    for i, v in enumerate([100, 110, 121, 133.1]):
        make_snapshot(db, acct, D0 + timedelta(days=i), v, cash_balance=0, currency="USD")
    body = client.get(f"/api/investments/performance?account_ids={acct.id}&start_date={D0 + timedelta(days=1)}").json()
    assert body["series"][0]["date"] == str(D0 + timedelta(days=1))
    assert body["series"][-1]["twr"] == pytest.approx(0.331)


def test_deposit_fees_charged_per_reported_row():
    d = days(3)
    settings = SimpleNamespace(
        commission_fixed=None, commission_pct=None, deposit_fee_fixed=2.0, deposit_fee_pct=None,
        withdrawal_fee_fixed=None, withdrawal_fee_pct=None,
    )
    before = [D0 - timedelta(days=k) for k in (3, 2, 1)]
    txns = [txn("deposit", 1000, x) for x in before]
    parts = ps.account_breakdown(txns, [], d, [3000, 0, 0], ident, settings)
    assert parts["fees_estimated"] == pytest.approx(-6)


def test_unconvertible_day0_deposit_keeps_raw_amount():
    d = days(2)
    snaps = [(d[0], 1000, 1000), (d[1], 1000, 1000)]
    flows, _, net = ps.account_flows(snaps, [txn("deposit", 500, d[0], currency="ETH")], lambda a, c, day: None)
    assert flows[0] == 500 and net == 500


def test_summary_risk_stats_null_with_few_returns():
    d = days(5)
    values = [100, 101, 102, 103, 104]
    built = ps.build_series(d, values, [0] * 5, [0] * 5)
    s = ps.summarize(d, values, [0] * 5, built)
    assert s.volatility is None and s.max_drawdown is None and s.sharpe is None
    assert s.mwr is None and s.twr_annualized is None
    assert s.best_day.date == d[1]  # 100 -> 101 is the largest daily gain


# ---- API


def _prices(symbol_to_closes):
    def fake(symbols, start, end, *, db, refresh=False):
        out = {}
        for s in symbols:
            if s not in symbol_to_closes:
                raise RuntimeError("no network in tests")
            idx = pd.date_range(D0 - timedelta(days=7), periods=60)
            out[s] = pd.DataFrame({"close": symbol_to_closes[s](len(idx))}, index=idx)
        return out
    return fake


def _seed(db, user, **kw):
    acct = make_investment_account(db, user, currency="USD", **kw)
    for i, (v, c) in enumerate([(1000, 0), (1100, 0), (1155, 0)]):
        make_snapshot(db, acct, D0 + timedelta(days=i), v, cash_balance=c, currency="USD")
    return acct


def test_performance_endpoint_shape(client, db, seed_user, monkeypatch):
    monkeypatch.setattr(ps, "get_price_history", _prices({"^GSPC": lambda n: [100.0 + i for i in range(n)]}))
    acct = _seed(db, seed_user)
    r = client.get(f"/api/investments/performance?account_ids={acct.id}")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"currency", "start_date", "end_date", "flows_source", "series", "summary", "breakdown", "benchmark"}
    assert body["currency"] == "USD" and len(body["series"]) == 2
    assert body["series"][-1]["twr"] == pytest.approx(0.155)
    assert body["series"][-1]["benchmark"] is not None
    assert body["benchmark"]["symbol"] == "^GSPC"
    assert body["summary"]["best_day"]["return"] == pytest.approx(0.1)
    b = body["breakdown"]
    assert b["unrealized"] + b["realized"] + b["dividends"] + b["taxes"] + b["fees"] + b["fx_and_other"] == pytest.approx(b["total_gain"])


def test_performance_benchmark_failure_degrades_to_null(client, db, seed_user, monkeypatch):
    monkeypatch.setattr(ps, "get_price_history", _prices({}))
    _seed(db, seed_user)
    r = client.get("/api/investments/performance")
    assert r.status_code == 200
    assert r.json()["benchmark"] is None and r.json()["series"][0]["benchmark"] is None


def test_performance_other_users_account_is_404(client, db, seed_user, monkeypatch):
    monkeypatch.setattr(ps, "get_price_history", _prices({}))
    other = User(email="o@example.com", hashed_password="x", full_name="O", is_active=True)
    db.add(other)
    db.commit()
    acct = _seed(db, other)
    assert client.get(f"/api/investments/performance?account_ids={acct.id}").status_code == 404


def test_performance_mixed_currencies_is_422(client, db, seed_user):
    a = make_investment_account(db, seed_user, name="A", currency="USD")
    b = make_investment_account(db, seed_user, name="B", currency="EUR")
    r = client.get(f"/api/investments/performance?account_ids={a.id},{b.id}")
    assert r.status_code == 422


def test_provider_settings_round_trip(client):
    assert client.get("/api/investments/provider-settings").json() == []
    r = client.put("/api/investments/provider-settings/freedom24", json={"commission_fixed": 1.5, "commission_pct": 0.1})
    assert r.status_code == 200
    r = client.put("/api/investments/provider-settings/freedom24", json={"commission_fixed": 2.0})
    assert r.status_code == 200
    rows = client.get("/api/investments/provider-settings").json()
    assert len(rows) == 1
    assert rows[0]["provider"] == "freedom24" and rows[0]["commission_fixed"] == 2.0
    assert rows[0]["commission_pct"] is None


def test_provider_settings_validation(client):
    assert client.put("/api/investments/provider-settings/kraken", json={}).status_code == 422
    assert client.put("/api/investments/provider-settings/binance", json={"commission_pct": 101}).status_code == 422
    assert client.put("/api/investments/provider-settings/binance", json={"deposit_fee_fixed": -1}).status_code == 422
    assert client.put("/api/investments/provider-settings/binance", json={"deposit_fee_fixed": 1e7}).status_code == 422
    r = client.put(
        "/api/investments/provider-settings/binance",
        content='{"commission_fixed": Infinity}',
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 422


def test_performance_rejects_bad_benchmark(client):
    assert client.get("/api/investments/performance?benchmark=a/b%20c").status_code == 422
    assert client.get("/api/investments/performance?benchmark=" + "A" * 21).status_code == 422
