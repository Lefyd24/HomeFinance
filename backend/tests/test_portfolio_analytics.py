"""Portfolio-level aggregates the AI advisor states as fact.

The model is not allowed to derive any of these numbers itself, so they have to
be right here. Every expected value below is hand-computed in the test, not
copied from the implementation.
"""
from datetime import date, datetime, timedelta

import pandas as pd
import pytest

from app.models import MarketSymbolMeta
from app.services import portfolio_analytics_service as pas
from tests.factories import (
    make_investment_account,
    make_investment_transaction,
    make_position,
    make_snapshot,
)


# --- overview --------------------------------------------------------------


def test_overview_with_no_accounts(db, seed_user):
    result = pas.portfolio_overview(db, seed_user.id)
    assert result["has_investments"] is False


def test_overview_totals_and_return(db, seed_user):
    account = make_investment_account(db, seed_user, balance=2500.0, currency="EUR")
    # 10 @ 100 -> 150 = 1500 value, 1000 cost
    make_position(db, account, symbol="A", quantity=10, avg_price=100, current_price=150)
    # 5 @ 200 -> 180 = 900 value, 1000 cost
    make_position(db, account, symbol="B", quantity=5, avg_price=200, current_price=180)

    result = pas.portfolio_overview(db, seed_user.id)
    block = result["accounts"][0]

    assert block["positions_value"] == 2400.0
    assert block["cost_basis"] == 2000.0
    assert block["unrealized_pnl"] == 400.0
    assert block["return_pct"] == 20.0
    assert block["position_count"] == 2
    assert result["combined"]["currency"] == "EUR"


def test_overview_day_change_is_size_weighted(db, seed_user):
    """A tiny holding must not outvote the portfolio."""
    account = make_investment_account(db, seed_user, balance=10100.0)
    # 10000 now, was 10000/1.0 -> +0% ... use a big flat holding and a tiny spiker
    make_position(db, account, symbol="BIG", quantity=100, avg_price=90,
                  current_price=100, day_change_pct=0.0)          # value 10000, prev 10000
    make_position(db, account, symbol="TINY", quantity=1, avg_price=50,
                  current_price=100, day_change_pct=100.0)        # value 100, prev 50

    block = pas.portfolio_overview(db, seed_user.id)["accounts"][0]

    # Money moved: 0 + 50 = 50, over a covered base of 10000 + 50 = 10050.
    assert block["day_change"] == 50.0
    assert block["day_change_pct"] == pytest.approx(0.5, abs=0.01)


def test_combined_pnl_refuses_when_an_account_has_no_cost_basis(db, seed_user):
    """Otherwise that account's whole holding is counted as profit."""
    with_cost = make_investment_account(db, seed_user, name="Broker", currency="EUR", balance=1500)
    make_position(db, with_cost, symbol="A", quantity=10, avg_price=100, current_price=150)

    # Binance-style: value known, cost basis never reported.
    without_cost = make_investment_account(db, seed_user, name="Crypto", currency="EUR", balance=500)
    position = make_position(db, without_cost, symbol="BTC", quantity=1, avg_price=0, current_price=500)
    position.avg_price = None
    position.cost_basis = None
    position.cost_basis_base = None
    db.commit()

    combined = pas.portfolio_overview(db, seed_user.id)["combined"]

    assert combined["total_value"] == 2000.0
    assert combined["unrealized_pnl"] is None
    assert combined["return_pct"] is None
    assert "Crypto" in combined["pnl_unavailable_because"]


def test_combined_pnl_is_reported_when_every_account_has_a_cost(db, seed_user):
    first = make_investment_account(db, seed_user, name="A", currency="EUR", balance=1500)
    second = make_investment_account(db, seed_user, name="B", currency="EUR", balance=600)
    make_position(db, first, symbol="X", quantity=10, avg_price=100, current_price=150)
    make_position(db, second, symbol="Y", quantity=10, avg_price=50, current_price=60)

    combined = pas.portfolio_overview(db, seed_user.id)["combined"]

    # Value 1500 + 600 = 2100, cost 1000 + 500 = 1500.
    assert combined["cost_basis"] == 1500.0
    assert combined["unrealized_pnl"] == 600.0
    assert combined["return_pct"] == 40.0


def test_overview_refuses_to_combine_unlike_currencies(db, seed_user):
    make_investment_account(db, seed_user, name="EUR broker", currency="EUR", balance=1000)
    make_investment_account(db, seed_user, name="USD broker", currency="USD", balance=1000)

    result = pas.portfolio_overview(db, seed_user.id)

    assert result["combined"] is None
    assert "different currencies" in result["note"]
    assert len(result["accounts"]) == 2


def test_overview_uses_base_columns_for_a_multi_currency_account(db, seed_user):
    """A USD holding in a EUR account is counted at its EUR value, not its USD one."""
    account = make_investment_account(db, seed_user, currency="EUR", balance=1900.0)
    make_position(db, account, symbol="US", quantity=10, avg_price=100,
                  current_price=200, currency="USD", fx_rate=0.9)  # 2000 USD -> 1800 EUR

    block = pas.portfolio_overview(db, seed_user.id)["accounts"][0]
    assert block["positions_value"] == 1800.0
    assert block["cost_basis"] == 900.0


# --- positions -------------------------------------------------------------


def test_positions_are_weighted_and_sorted(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    make_position(db, account, symbol="SMALL", quantity=1, avg_price=100, current_price=250)
    make_position(db, account, symbol="LARGE", quantity=10, avg_price=50, current_price=75)

    result = pas.portfolio_positions(db, seed_user.id)
    rows = result["positions"]

    assert [r["symbol"] for r in rows] == ["LARGE", "SMALL"]
    assert rows[0]["market_value"] == 750.0
    assert rows[0]["weight_pct"] == 75.0
    assert rows[1]["weight_pct"] == 25.0
    assert rows[0]["unrealized_pnl"] == 250.0
    assert rows[0]["unrealized_return_pct"] == 50.0


def test_positions_min_weight_filter(db, seed_user):
    account = make_investment_account(db, seed_user)
    make_position(db, account, symbol="BIG", quantity=10, avg_price=50, current_price=90)
    make_position(db, account, symbol="SMALL", quantity=1, avg_price=5, current_price=10)

    result = pas.portfolio_positions(db, seed_user.id, min_weight_pct=50)
    assert [r["symbol"] for r in result["positions"]] == ["BIG"]


def test_positions_weight_within_account_when_currencies_differ(db, seed_user):
    eur = make_investment_account(db, seed_user, name="EUR", currency="EUR")
    usd = make_investment_account(db, seed_user, name="USD", currency="USD")
    make_position(db, eur, symbol="E1", quantity=1, avg_price=10, current_price=100)
    make_position(db, usd, symbol="U1", quantity=1, avg_price=10, current_price=400)

    result = pas.portfolio_positions(db, seed_user.id)

    assert result["currency"] is None
    assert result["weights_are_relative_to"] == "each position's own account"
    # Each is the whole of its own account, so both are 100%.
    assert {r["weight_pct"] for r in result["positions"]} == {100.0}


def test_positions_for_unknown_account_errors(db, seed_user):
    make_investment_account(db, seed_user)
    assert "error" in pas.portfolio_positions(db, seed_user.id, account_id=99999)


# --- allocation ------------------------------------------------------------


def test_allocation_concentration_and_hhi(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    make_position(db, account, symbol="A", quantity=1, avg_price=1, current_price=600)
    make_position(db, account, symbol="B", quantity=1, avg_price=1, current_price=300)
    make_position(db, account, symbol="C", quantity=1, avg_price=1, current_price=100)

    result = pas.portfolio_allocation(db, seed_user.id)
    concentration = result["concentration"]

    assert result["total_value"] == 1000.0
    assert concentration["largest_position"]["symbol"] == "A"
    assert concentration["largest_position"]["weight_pct"] == 60.0
    # 60^2 + 30^2 + 10^2 = 3600 + 900 + 100
    assert concentration["hhi"] == 4600.0
    assert concentration["effective_holdings"] == pytest.approx(2.2, abs=0.05)
    assert concentration["holding_count"] == 3


def test_allocation_counts_cash_and_reports_drag(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    make_position(db, account, symbol="A", quantity=1, avg_price=1, current_price=750)
    make_snapshot(db, account, date.today(), total_value=1000.0, cash_balance=250.0)

    result = pas.portfolio_allocation(db, seed_user.id)

    assert result["total_value"] == 1000.0
    assert result["cash"]["amount"] == 250.0
    assert result["cash"]["weight_pct"] == 25.0
    assert result["asset_class"]["cash"] == 25.0


def test_allocation_same_ticker_across_accounts_is_one_holding(db, seed_user):
    first = make_investment_account(db, seed_user, name="One", currency="EUR")
    second = make_investment_account(db, seed_user, name="Two", currency="EUR")
    make_position(db, first, symbol="AAPL", quantity=1, avg_price=1, current_price=400)
    make_position(db, second, symbol="AAPL", quantity=1, avg_price=1, current_price=600)

    concentration = pas.portfolio_allocation(db, seed_user.id)["concentration"]

    assert concentration["holding_count"] == 1
    assert concentration["largest_position"]["weight_pct"] == 100.0


def test_allocation_asset_class_from_cached_metadata_only(db, seed_user):
    """No network calls: an uncached symbol is 'unknown', not a guess."""
    account = make_investment_account(db, seed_user, currency="EUR", provider="freedom24")
    make_position(db, account, symbol="AAPL.US", quantity=1, avg_price=1, current_price=500)
    make_position(db, account, symbol="MYSTERY.XX", quantity=1, avg_price=1, current_price=500)

    db.add(MarketSymbolMeta(symbol="AAPL", name="Apple Inc", quote_type="stock", currency="USD"))
    db.commit()

    result = pas.portfolio_allocation(db, seed_user.id)

    assert result["asset_class"]["equity"] == 50.0
    assert result["asset_class"]["unknown"] == 50.0
    assert result["asset_class_coverage_pct"] == 50.0


def test_allocation_detects_a_bond_fund_by_name(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR", provider="freedom24")
    make_position(db, account, symbol="AGG", name="iShares Core US Aggregate Bond ETF",
                  quantity=1, avg_price=1, current_price=1000)
    db.add(MarketSymbolMeta(symbol="AGG", name="iShares Core US Aggregate Bond ETF",
                            quote_type="etf", currency="USD"))
    db.commit()

    result = pas.portfolio_allocation(db, seed_user.id)
    assert result["asset_class"]["bond"] == 100.0


def test_allocation_currency_exposure(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    make_position(db, account, symbol="E", quantity=1, avg_price=1,
                  current_price=600, currency="EUR", fx_rate=1.0)
    make_position(db, account, symbol="U", quantity=1, avg_price=1,
                  current_price=400, currency="USD", fx_rate=1.0)

    exposure = pas.portfolio_allocation(db, seed_user.id)["currency_exposure"]
    assert exposure["EUR"] == 60.0
    assert exposure["USD"] == 40.0


def test_allocation_refuses_mixed_currency_accounts(db, seed_user):
    eur = make_investment_account(db, seed_user, name="EUR", currency="EUR")
    usd = make_investment_account(db, seed_user, name="USD", currency="USD")
    make_position(db, eur, symbol="E", quantity=1, avg_price=1, current_price=100)
    make_position(db, usd, symbol="U", quantity=1, avg_price=1, current_price=100)

    result = pas.portfolio_allocation(db, seed_user.id)
    assert "error" in result
    assert "meaningless" in result["error"]


# --- return series ---------------------------------------------------------


def _seed_snapshots(db, account, values, start=None, cash=None):
    """`values` are total values; `cash` (optional) the cash half of each."""
    start = start or date.today() - timedelta(days=len(values))
    for offset, value in enumerate(values):
        make_snapshot(
            db,
            account,
            start + timedelta(days=offset),
            total_value=value,
            cash_balance=cash[offset] if cash else 0.0,
        )
    return start


def test_a_deposit_is_not_a_return(db, seed_user):
    """The whole point of the cash-flow reconstruction.

    Neither broker reports deposits, so the flow has to be inferred: cash rose
    by 1000 with no trade to explain it, therefore 1000 came from outside.
    """
    account = make_investment_account(db, seed_user, currency="EUR")
    start = _seed_snapshots(
        db, account, [1000.0, 1000.0, 2000.0], cash=[0.0, 0.0, 1000.0]
    )

    series, meta = pas._daily_returns_from_snapshots(db, [account], start)

    assert meta["cash_flow_adjusted"] is True
    assert meta["net_external_flow"] == 1000.0
    assert len(series) == 2
    # Both steps are flat once the deposit is removed.
    assert series.iloc[0] == pytest.approx(0.0)
    assert series.iloc[1] == pytest.approx(0.0)


def test_a_buy_is_not_a_deposit(db, seed_user):
    """Cash falling because it was spent on shares is internal, not a withdrawal."""
    account = make_investment_account(db, seed_user, currency="EUR")
    # Value flat at 1000; 400 of cash converts into 400 of positions.
    start = _seed_snapshots(db, account, [1000.0, 1000.0], cash=[500.0, 100.0])
    make_investment_transaction(
        db, account, type="buy", symbol="X", amount=-400.0,
        txn_date=datetime.combine(start + timedelta(days=1), datetime.min.time()),
    )

    series, meta = pas._daily_returns_from_snapshots(db, [account], start)

    assert meta["net_external_flow"] == 0.0
    assert series.iloc[0] == pytest.approx(0.0)


def test_a_withdrawal_is_not_a_loss(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    start = _seed_snapshots(db, account, [1000.0, 700.0], cash=[300.0, 0.0])

    series, meta = pas._daily_returns_from_snapshots(db, [account], start)

    assert meta["net_external_flow"] == -300.0
    assert series.iloc[0] == pytest.approx(0.0)


def test_returns_use_simple_dietz_when_a_flow_lands_mid_step(db, seed_user):
    """A flow is weighted at half the period, not assumed to arrive at an end."""
    account = make_investment_account(db, seed_user, currency="EUR")
    # 1000 -> deposit 100 -> ends at 1122: 22 of that is genuine growth.
    start = _seed_snapshots(db, account, [1000.0, 1122.0], cash=[0.0, 100.0])

    series, _ = pas._daily_returns_from_snapshots(db, [account], start)

    # (1122 - 1000 - 100) / (1000 + 50) = 22 / 1050
    assert series.iloc[0] == pytest.approx(22 / 1050)


def test_returns_without_flows_are_plain_percentage_changes(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    start = _seed_snapshots(db, account, [1000.0, 1100.0, 1045.0])

    series, _ = pas._daily_returns_from_snapshots(db, [account], start)

    assert series.iloc[0] == pytest.approx(0.10)
    assert series.iloc[1] == pytest.approx(-0.05)


def test_an_unexplained_jump_is_dropped_not_counted_as_return(db, seed_user):
    """The backstop for a transfer the cash reconstruction could not see."""
    account = make_investment_account(db, seed_user, currency="EUR")
    # Value triples with no cash trace at all — a transfer of securities in.
    start = _seed_snapshots(db, account, [100.0, 100.0, 300.0], cash=[0.0, 0.0, 0.0])

    series, meta = pas._daily_returns_from_snapshots(db, [account], start)

    assert meta["steps_dropped_as_unexplained"] == 1
    assert len(series) == 1
    assert series.iloc[0] == pytest.approx(0.0)
    # Dropped and declared, never quietly shrunk to fit.
    assert "unrecorded transfer" in meta["dropped_note"]


def test_returns_skip_long_gaps(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    start = date.today() - timedelta(days=60)
    make_snapshot(db, account, start, total_value=1000.0)
    make_snapshot(db, account, start + timedelta(days=1), total_value=1010.0)
    # A month-long hole: not a return, a missed sync.
    make_snapshot(db, account, start + timedelta(days=31), total_value=1500.0)
    make_snapshot(db, account, start + timedelta(days=32), total_value=1515.0)

    series, meta = pas._daily_returns_from_snapshots(db, [account], start)

    assert meta["gaps_skipped"] == 1
    assert len(series) == 2
    assert max(abs(series)) < 0.05  # the fake +48% step was dropped


def test_returns_need_every_account_to_have_reported(db, seed_user):
    """Otherwise the total dips by a whole account and reads as a crash."""
    first = make_investment_account(db, seed_user, name="One", currency="EUR")
    second = make_investment_account(db, seed_user, name="Two", currency="EUR")
    start = date.today() - timedelta(days=3)

    for offset in range(3):
        make_snapshot(db, first, start + timedelta(days=offset), total_value=1000.0)
    # `second` missed the middle day.
    make_snapshot(db, second, start, total_value=500.0)
    make_snapshot(db, second, start + timedelta(days=2), total_value=500.0)

    series, meta = pas._daily_returns_from_snapshots(db, [first, second], start)

    # Only day 0 and day 2 are complete, and they are 2 days apart, so one step.
    assert len(series) == 1
    assert series.iloc[0] == pytest.approx(0.0)


def test_returns_report_why_they_are_unavailable(db, seed_user):
    account = make_investment_account(db, seed_user, currency="EUR")
    series, meta = pas._daily_returns_from_snapshots(db, [account], date.today() - timedelta(days=30))

    assert series is None
    assert "snapshots" in meta["reason"].lower()


# --- risk ------------------------------------------------------------------


def test_risk_rejects_an_unknown_period(db, seed_user):
    make_investment_account(db, seed_user)
    assert "error" in pas.portfolio_risk(db, seed_user.id, period="17y")


def test_risk_without_holdings(db, seed_user):
    make_investment_account(db, seed_user)
    result = pas.portfolio_risk(db, seed_user.id)
    assert result["has_investments"] is False


def test_risk_refuses_mixed_currencies(db, seed_user):
    eur = make_investment_account(db, seed_user, name="EUR", currency="EUR")
    usd = make_investment_account(db, seed_user, name="USD", currency="USD")
    make_position(db, eur, symbol="E", quantity=1, avg_price=1, current_price=100)
    make_position(db, usd, symbol="U", quantity=1, avg_price=1, current_price=100)

    assert "error" in pas.portfolio_risk(db, seed_user.id)


def test_risk_from_snapshots_without_network(db, seed_user, monkeypatch):
    """Enough snapshot history that no price fetch is needed at all."""
    account = make_investment_account(db, seed_user, currency="EUR")
    make_position(db, account, symbol="A", quantity=1, avg_price=1, current_price=1000)

    start = date.today() - timedelta(days=200)
    value = 1000.0
    for offset in range(200):
        # A gentle, alternating drift — deterministic, so the assertions are stable.
        value *= 1.002 if offset % 2 == 0 else 0.999
        make_snapshot(db, account, start + timedelta(days=offset), total_value=value)

    def _no_network(*args, **kwargs):
        raise AssertionError("portfolio_risk must not fetch prices when snapshots suffice")

    monkeypatch.setattr(pas, "_daily_returns_synthetic", _no_network)
    # The benchmark fetch is a separate, non-fatal concern; stub it out.
    monkeypatch.setattr(pas, "get_price_history", lambda *a, **k: {})
    monkeypatch.setattr(
        pas, "get_risk_free_rate",
        lambda db, start, end: (pd.Series(0.02, index=pd.date_range(start, end, freq="D")), "test"),
    )

    result = pas.portfolio_risk(db, seed_user.id, period="1y")

    assert result["series"]["method"] == "snapshots"
    assert result["series"]["observations"] >= pas.MIN_RISK_OBSERVATIONS
    assert result["performance"]["cumulative_return_pct"] > 0
    assert result["risk"]["annualized_volatility_pct"] is not None
    assert result["risk_adjusted"]["sharpe"] is not None


def test_risk_falls_back_to_synthetic_and_says_so(db, seed_user, monkeypatch):
    account = make_investment_account(db, seed_user, currency="EUR")
    make_position(db, account, symbol="A", quantity=1, avg_price=1, current_price=1000)
    # Only a handful of snapshot days — far below MIN_RISK_OBSERVATIONS.
    _seed_snapshots(db, account, [1000.0, 1010.0, 1005.0])

    fake = pd.Series(
        [0.001] * 120,
        index=pd.date_range(date.today() - timedelta(days=120), periods=120, freq="D"),
    )
    monkeypatch.setattr(
        pas, "_daily_returns_synthetic",
        lambda *a, **k: (fake, {"method": "synthetic", "observations": len(fake),
                                "cash_flow_adjusted": False}),
    )
    monkeypatch.setattr(pas, "get_price_history", lambda *a, **k: {})
    monkeypatch.setattr(
        pas, "get_risk_free_rate",
        lambda db, start, end: (pd.Series(0.02, index=pd.date_range(start, end, freq="D")), "test"),
    )

    result = pas.portfolio_risk(db, seed_user.id, period="1y")

    assert result["series"]["method"] == "synthetic"
    # The caller must be told the numbers rest on an approximation.
    assert "fell_back_because" in result["series"]
