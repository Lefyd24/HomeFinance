"""Unit tests for the company history service.

Price fetching is monkeypatched — these tests exercise the windowing, SMA,
horizon-table and histogram logic, never the network.
"""
import numpy as np
import pandas as pd
import pytest

from app.services import company_history_service as svc


def _frame(n: int, seed: int = 0, start: str = "2020-01-01") -> pd.DataFrame:
    """A deterministic ascending daily OHLCV frame."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(start=start, periods=n)
    close = pd.Series(100 * np.exp(np.cumsum(rng.normal(0.0004, 0.01, n))), index=idx)
    return pd.DataFrame(
        {
            "open": close * 0.99,
            "high": close * 1.01,
            "low": close * 0.98,
            "close": close,
            "volume": pd.Series(rng.integers(1_000, 10_000, n), index=idx).astype(float),
        },
        index=idx,
    )


@pytest.fixture
def patched(monkeypatch):
    """Patch the market-data layer so the service never hits Yahoo."""
    asset = _frame(1600, seed=1)
    bench = _frame(1600, seed=2)

    def fake_history(symbols, start, end, *, db, refresh=False):
        out = {}
        for s in symbols:
            frame = bench if s == "^GSPC" else asset
            out[s] = frame.loc[str(start) : str(end)]
        return out

    class _Meta:
        quote_type = "stock"
        currency = "USD"
        periods_per_year = 252

    monkeypatch.setattr(svc, "get_price_history", fake_history)
    monkeypatch.setattr(svc, "get_price_history_raw", fake_history)
    monkeypatch.setattr(svc, "get_symbol_meta", lambda db, symbol, refresh=False: _Meta())
    monkeypatch.setattr(
        svc,
        "get_risk_free_rate",
        lambda db, start, end, override_annual=None: (
            pd.Series(0.04, index=pd.date_range(start, end, freq="D")),
            "test",
        ),
    )
    return asset


def test_bars_are_ascending_and_carry_sma(patched, db):
    result = svc.build_company_history(db, "AAPL", period="1y")
    dates = [b.date for b in result.bars]
    assert dates == sorted(dates)
    assert result.period == "1y"
    assert result.symbol == "AAPL"
    # 1y of business days is ~260 bars, so SMA200 is defined by the end.
    assert result.bars[-1].sma50 is not None
    assert result.bars[-1].sma200 is not None


def test_sma_uses_prior_history_so_the_first_bar_is_populated(patched, db):
    """SMA is computed on a lookback-extended window then sliced, so the
    left edge of a short range is not blank."""
    result = svc.build_company_history(db, "AAPL", period="1m")
    assert result.bars[0].sma50 is not None
    assert result.bars[0].sma200 is not None


def test_horizon_table_covers_1y_3y_5y(patched, db):
    result = svc.build_company_history(db, "AAPL", period="1y")
    assert [h.horizon for h in result.horizons] == ["1y", "3y", "5y"]
    one_year = result.horizons[0]
    assert one_year.annualized_return is not None
    assert one_year.volatility is not None
    assert one_year.max_drawdown is not None and one_year.max_drawdown <= 0
    assert one_year.sharpe is not None
    assert one_year.beta is not None


def test_horizons_are_independent_of_the_selected_period(patched, db):
    """Switching the chart range must not move the horizon numbers."""
    a = svc.build_company_history(db, "AAPL", period="1m")
    b = svc.build_company_history(db, "AAPL", period="5y")
    assert [h.annualized_return for h in a.horizons] == [
        h.annualized_return for h in b.horizons
    ]


def test_rolling_series_are_returned_for_the_selected_window(patched, db):
    result = svc.build_company_history(db, "AAPL", period="1y")
    assert len(result.rolling_volatility) > 0
    assert len(result.rolling_beta) > 0
    assert len(result.rolling_sharpe) > 0
    last_bar_date = result.bars[-1].date
    assert result.rolling_volatility[-1].date <= last_bar_date


def test_return_histogram_bins_sum_to_the_observation_count(patched, db):
    result = svc.build_company_history(db, "AAPL", period="1y")
    assert len(result.return_histogram) == svc.HISTOGRAM_BINS
    total = sum(b.count for b in result.return_histogram)
    assert total == result.return_observations
    assert result.return_observations > 200


def test_unknown_period_is_rejected(patched, db):
    with pytest.raises(ValueError, match="period"):
        svc.build_company_history(db, "AAPL", period="42y")


def test_short_history_yields_nulls_not_errors(monkeypatch, db):
    """A ticker with 30 bars: metrics that need 60+ observations return None."""
    tiny = _frame(30, seed=3)

    def fake_history(symbols, start, end, *, db, refresh=False):
        return {s: tiny for s in symbols}

    class _Meta:
        quote_type = "stock"
        currency = "USD"
        periods_per_year = 252

    monkeypatch.setattr(svc, "get_price_history", fake_history)
    monkeypatch.setattr(svc, "get_price_history_raw", fake_history)
    monkeypatch.setattr(svc, "get_symbol_meta", lambda db, symbol, refresh=False: _Meta())
    monkeypatch.setattr(
        svc,
        "get_risk_free_rate",
        lambda db, start, end, override_annual=None: (
            pd.Series(0.04, index=pd.date_range(start, end, freq="D")),
            "test",
        ),
    )

    result = svc.build_company_history(db, "TINY", period="1y")
    assert result.horizons[0].sharpe is None
    assert result.horizons[0].beta is None
    assert len(result.bars) == 30
