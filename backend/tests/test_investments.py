from datetime import datetime

from app.models import (
    Account,
    InvestmentCredential,
    InvestmentTransaction,
    NotificationRule,
    PortfolioPosition,
    PortfolioSnapshot,
)
from app.services import investment_sync_service
from app.services import position_history_service
from app.services import notification_service as ns
from app.services.investment_providers.base import (
    ProviderBalance,
    ProviderPosition,
    ProviderTransaction,
)


class FakeProvider:
    """Deterministic stand-in for a real broker so tests never hit the network."""

    def __init__(self, public_key, private_key, base_currency="USD"):
        self.public_key = public_key
        self.private_key = private_key
        self.base_currency = base_currency

    def get_balance(self):
        return ProviderBalance(
            total_value=1500.0,
            cash_balance=500.0,
            currency="USD",
            positions_value=1000.0,
            cash_by_currency={"USD": 500.0},
        )

    def get_positions(self):
        return [
            ProviderPosition(
                symbol="AAPL.US",
                name="Apple Inc",
                quantity=5,
                avg_price=150.0,
                current_price=200.0,
                market_value=1000.0,
                currency="USD",
                cost_basis=750.0,
                fx_rate=1.0,
                market_value_base=1000.0,
                cost_basis_base=750.0,
                day_change=1.5,
                day_change_pct=0.75,
                exchange="FIX",
            )
        ]

    def get_transactions(self, since=None):
        return [
            ProviderTransaction(
                external_id="trade-1",
                type="buy",
                symbol="AAPL.US",
                quantity=5,
                price=150.0,
                amount=-750.0,
                currency="USD",
                date=datetime(2026, 1, 5),
                raw_payload={"trade_id": "trade-1"},
            )
        ]

    def get_candles(self, symbol, start, end):
        from datetime import date as date_cls

        from app.services.investment_providers.base import ProviderCandle

        # Enough daily bars that a fresh sync can backfill a chart series.
        day = date_cls(2026, 1, 5)
        candles = []
        price = 150.0
        while day <= date_cls(2026, 1, 20):
            candles.append(
                ProviderCandle(date=day, open=price, high=price + 1, low=price - 1, close=price)
            )
            price += 2.0
            day = date_cls.fromordinal(day.toordinal() + 1)
        return [c for c in candles if start <= c.date <= end]

    def get_earn_positions(self):
        # Mirrors the real Freedom24Provider: no earn/staking product exists,
        # so the base class's NotImplementedError is what a real broker call
        # would surface too.
        raise NotImplementedError(f"{type(self).__name__} does not support earn positions")


class FakeEarnProvider(FakeProvider):
    """Stands in for Binance, which does support Simple Earn positions."""

    def get_earn_positions(self):
        from app.services.investment_providers.base import ProviderEarnPosition

        return [
            ProviderEarnPosition(
                asset="USDT",
                amount=100.0,
                kind="flexible",
                apr=0.025,
                accrued_yield=1.5,
            ),
            ProviderEarnPosition(
                asset="BNB",
                amount=10.0,
                kind="locked",
                apr=0.08,
                lock_end_time=datetime(2026, 6, 1),
            ),
        ]


class FakeMultiCurrencyProvider(FakeProvider):
    """A USD account holding one EUR instrument, already converted by the provider."""

    def get_balance(self):
        return ProviderBalance(
            total_value=1200.0,
            cash_balance=100.0,
            currency="USD",
            positions_value=1100.0,
            cash_by_currency={"USD": 0.0, "EUR": 87.0},
        )

    def get_positions(self):
        return [
            ProviderPosition(
                symbol="BYLOT.GR",
                name="Bally's Intralot",
                quantity=100,
                avg_price=8.0,
                current_price=10.0,
                market_value=1000.0,
                currency="EUR",
                cost_basis=800.0,
                fx_rate=1.1,
                market_value_base=1100.0,
                cost_basis_base=880.0,
            )
        ]


def _patch_provider(monkeypatch, provider_cls=FakeProvider):
    monkeypatch.setattr(
        investment_sync_service,
        "get_provider",
        lambda provider, public, private, base_currency="USD": provider_cls(
            public, private, base_currency
        ),
    )


def test_create_investment_account_encrypts_keys_and_never_returns_them(client, db, monkeypatch):
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "public_key" not in body
    assert "private_key" not in body
    assert body["sync_status"] == "ok"
    assert body["balance"] == 1500.0

    account = db.query(Account).filter(Account.id == body["id"]).first()
    credential = db.query(InvestmentCredential).filter(InvestmentCredential.account_id == account.id).first()
    assert credential.encrypted_public_key != "pub-123"
    assert credential.encrypted_private_key != "priv-456"


def test_sync_account_upserts_idempotently(client, db, monkeypatch):
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    account = db.query(Account).filter(Account.id == account_id).first()
    # Force past the manual-sync cooldown so the second call isn't rate-limited.
    account.last_synced_at = datetime(2000, 1, 1)
    db.commit()

    resync = client.post(f"/api/investments/accounts/{account_id}/sync")
    assert resync.status_code == 200, resync.text

    positions = db.query(PortfolioPosition).filter(PortfolioPosition.account_id == account_id).all()
    assert len(positions) == 1

    transactions = db.query(InvestmentTransaction).filter(InvestmentTransaction.account_id == account_id).all()
    assert len(transactions) == 1

    snapshots = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.account_id == account_id).all()
    assert len(snapshots) >= 2
    today_snap = max(snapshots, key=lambda s: s.date)
    assert today_snap.total_value == 1500.0


def test_sync_heals_previously_misparsed_transactions(client, db, monkeypatch):
    """A first buggy sync stored fee/0 rows; the next sync must rewrite them."""
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    row = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.account_id == account_id, InvestmentTransaction.external_id == "trade-1")
        .one()
    )
    row.type = "fee"
    row.amount = 0.0
    account = db.query(Account).filter(Account.id == account_id).first()
    account.last_synced_at = datetime(2000, 1, 1)
    db.commit()

    resync = client.post(f"/api/investments/accounts/{account_id}/sync")
    assert resync.status_code == 200, resync.text

    healed = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.account_id == account_id, InvestmentTransaction.external_id == "trade-1")
        .one()
    )
    assert healed.type == "buy"
    assert healed.amount == -750.0


def test_manual_balance_edit_rejected_for_provider_account(client, db, monkeypatch):
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    update = client.put(f"/api/accounts/{account_id}", json={"balance": 99999})
    assert update.status_code == 400

    rename = client.put(f"/api/accounts/{account_id}", json={"name": "Renamed"})
    assert rename.status_code == 200
    assert rename.json()["name"] == "Renamed"


def test_delete_account_cascades_investment_tables(client, db, monkeypatch):
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    delete_resp = client.delete(f"/api/accounts/{account_id}")
    assert delete_resp.status_code == 200

    assert db.query(InvestmentCredential).filter(InvestmentCredential.account_id == account_id).count() == 0
    assert db.query(PortfolioPosition).filter(PortfolioPosition.account_id == account_id).count() == 0
    assert db.query(InvestmentTransaction).filter(InvestmentTransaction.account_id == account_id).count() == 0


def test_positions_endpoint_reports_return_pct(client, db, monkeypatch):
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    # FakeProvider reports 5 shares @ avg 150, current 200 -> cost basis 750, mkt value 1000.
    positions_resp = client.get(f"/api/investments/accounts/{account_id}/positions")
    assert positions_resp.status_code == 200
    position = positions_resp.json()[0]
    assert position["cost_basis"] == 750.0
    assert position["unrealized_pnl"] == 250.0
    assert round(position["unrealized_return_pct"], 2) == round(250 / 750 * 100, 2)

    assert position["weight_pct"] == 100.0
    assert position["day_change_pct"] == 0.75

    account_resp = client.get("/api/investments/accounts")
    account = next(a for a in account_resp.json() if a["id"] == account_id)
    assert account["total_cost_basis"] == 750.0
    assert account["total_market_value"] == 1000.0
    assert account["total_unrealized_pnl"] == 250.0
    assert account["cash_balance"] == 500.0
    assert account["position_count"] == 1


def test_account_totals_use_base_currency_for_foreign_positions(client, db, monkeypatch):
    """A EUR holding in a USD account must total in USD, not add unlike currencies."""
    _patch_provider(monkeypatch, FakeMultiCurrencyProvider)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    # Converted figures (1100 / 880 USD), not the native EUR ones (1000 / 800).
    assert body["total_market_value"] == 1100.0
    assert body["total_cost_basis"] == 880.0
    assert body["total_unrealized_pnl"] == 220.0
    assert round(body["total_return_pct"], 2) == 25.0

    account_id = body["id"]
    position = client.get(f"/api/investments/accounts/{account_id}/positions").json()[0]
    # The row keeps its own currency for display, and carries the conversion too.
    assert position["currency"] == "EUR"
    assert position["market_value"] == 1000.0
    assert position["market_value_base"] == 1100.0
    assert position["unrealized_pnl"] == 200.0
    assert position["unrealized_pnl_base"] == 220.0
    assert position["fx_rate"] == 1.1


def test_transaction_amounts_keep_provider_sign(client, db, monkeypatch):
    """A buy takes cash out, so it must stay negative through to the API."""
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    txns = client.get(f"/api/investments/accounts/{account_id}/transactions").json()
    assert len(txns) == 1
    assert txns[0]["type"] == "buy"
    assert txns[0]["amount"] == -750.0


def test_investment_return_below_rule_triggers_when_return_drops(client, db, monkeypatch):
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]
    seed_user = db.query(Account).filter(Account.id == account_id).first().user

    rule = NotificationRule(
        user_id=seed_user.id,
        type="investment_return_below",
        name="Portfolio dropped",
        target_id=account_id,
        threshold=50.0,  # FakeProvider's return is (1000-750)/750*100 ≈ 33.3%, below 50%
        is_active=True,
    )
    db.add(rule)
    db.commit()

    out = ns.investment_return_breaches(db, seed_user)
    assert len(out) == 1
    assert out[0].type == "investment_return_below"

    # Raising the bar above the actual return should stop it firing.
    rule.threshold = 10.0
    db.commit()
    out2 = ns.investment_return_breaches(db, seed_user)
    assert out2 == []


def test_investment_scheduled_rule_fires_once_per_period(client, db, monkeypatch):
    _patch_provider(monkeypatch)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]
    seed_user = db.query(Account).filter(Account.id == account_id).first().user

    rule = NotificationRule(
        user_id=seed_user.id,
        type="investment_scheduled",
        name="Weekly summary",
        target_id=account_id,
        schedule_kind="every_n_days",
        schedule_value=7,
        is_active=True,
    )
    db.add(rule)
    db.commit()

    now = datetime.utcnow()
    notif = ns.investment_scheduled_due(db, seed_user, rule, now)
    assert notif is not None
    assert notif.type == "investment_scheduled"

    rule.last_fired_at = now
    db.commit()
    assert ns.investment_scheduled_due(db, seed_user, rule, now) is None


def test_earn_positions_returns_501_when_provider_unsupported(client, db, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    resp = client.get(f"/api/investments/accounts/{account_id}/earn")
    assert resp.status_code == 501, resp.text


def test_earn_positions_returns_positions_for_supporting_provider(client, db, monkeypatch):
    _patch_provider(monkeypatch, FakeEarnProvider)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Binance",
            "provider": "binance",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    resp = client.get(f"/api/investments/accounts/{account_id}/earn")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2

    flexible = next(p for p in body if p["kind"] == "flexible")
    assert flexible["asset"] == "USDT"
    assert flexible["amount"] == 100.0
    assert flexible["apr"] == 0.025
    assert flexible["accrued_yield"] == 1.5

    locked = next(p for p in body if p["kind"] == "locked")
    assert locked["asset"] == "BNB"
    assert locked["lock_end_time"] is not None


class FakeFeeProvider(FakeProvider):
    """A broker that bills its commission in the account's currency, as they do.

    The trade is in USD on a USD account here; `FakeForeignFeeProvider` below
    covers the case that actually needs converting.
    """

    def get_transactions(self, since=None):
        return FakeProvider.get_transactions(self, since) + [
            ProviderTransaction(
                external_id="trade-1-fee",
                type="fee",
                symbol="AAPL.US",
                quantity=None,
                price=None,
                amount=-2.5,
                currency="USD",
                date=datetime(2026, 1, 5),
                raw_payload={"trade_id": "trade-1"},
            ),
            ProviderTransaction(
                external_id="trade-2-fee",
                type="fee",
                symbol="AAPL.US",
                quantity=None,
                price=None,
                amount=-1.5,
                currency="USD",
                date=datetime(2026, 1, 12),
                raw_payload={"trade_id": "trade-2"},
            ),
            # A fee against a ticker that is no longer held must not land on
            # any open position's total.
            ProviderTransaction(
                external_id="trade-3-fee",
                type="fee",
                symbol="SOLD.US",
                quantity=None,
                price=None,
                amount=-9.0,
                currency="USD",
                date=datetime(2026, 1, 12),
                raw_payload={"trade_id": "trade-3"},
            ),
        ]


class FakeForeignFeeProvider(FakeMultiCurrencyProvider):
    """A EUR instrument in a USD account, with the commission billed in EUR."""

    def get_transactions(self, since=None):
        return [
            ProviderTransaction(
                external_id="trade-1",
                type="buy",
                symbol="BYLOT.GR",
                quantity=100,
                price=8.0,
                amount=-800.0,
                currency="EUR",
                date=datetime(2026, 1, 5),
                raw_payload={},
            ),
            ProviderTransaction(
                external_id="trade-1-fee",
                type="fee",
                symbol="BYLOT.GR",
                quantity=None,
                price=None,
                amount=-10.0,
                currency="EUR",
                date=datetime(2026, 1, 5),
                raw_payload={},
            ),
        ]


def _no_yahoo_match(*args, **kwargs):
    """Stand in for a ticker Yahoo has no confirmed listing for.

    Also keeps the suite off the network: resolving for real would download
    prices and symbol metadata from Yahoo.
    """
    from app.services.market_data import CandidateCheck, YahooListing

    return YahooListing(symbol=None, currency=None, checked=[CandidateCheck("NOPE", "no-data")])


def _connect(client, provider="freedom24", currency="USD"):
    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Broker",
            "provider": provider,
            "currency": currency,
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_position_reports_commission_actually_charged_for_that_ticker(client, db, monkeypatch):
    _patch_provider(monkeypatch, FakeFeeProvider)
    account_id = _connect(client)

    position = client.get(f"/api/investments/accounts/{account_id}/positions").json()[0]
    assert position["symbol"] == "AAPL.US"
    # Both AAPL charges, and neither the SOLD.US one nor the trade itself.
    assert position["fees_paid_base"] == 4.0
    assert position["fee_count"] == 2


def test_foreign_currency_fee_is_converted_into_the_account_currency(client, db, monkeypatch):
    _patch_provider(monkeypatch, FakeForeignFeeProvider)
    account_id = _connect(client)

    position = client.get(f"/api/investments/accounts/{account_id}/positions").json()[0]
    # EUR 10 at the position's own 1.1 rate, because the account reports in USD.
    assert position["fees_paid_base"] == 11.0
    assert position["fee_count"] == 1


class FakeMovingForeignProvider(FakeMultiCurrencyProvider):
    """The EUR-in-a-USD-account position, with today's move attached."""

    def get_positions(self):
        positions = FakeMultiCurrencyProvider.get_positions(self)
        positions[0].day_change = 1.5
        positions[0].day_change_pct = 0.15
        return positions


def test_position_day_change_is_restated_in_the_account_currency(client, db, monkeypatch):
    _patch_provider(monkeypatch, FakeMovingForeignProvider)
    account_id = _connect(client)

    position = client.get(f"/api/investments/accounts/{account_id}/positions").json()[0]
    # FakeProvider's day_change of 1.5 is EUR; the account reports USD.
    assert position["day_change"] == 1.5
    assert position["day_change_base"] == 1.65


def test_position_history_tracks_value_against_invested_capital(client, db, monkeypatch):
    """The broker-candle fallback: this ticker resolves to nothing on Yahoo."""
    _patch_provider(monkeypatch, FakeFeeProvider)
    monkeypatch.setattr(position_history_service, "resolve_yahoo_listing", _no_yahoo_match)
    account_id = _connect(client)

    resp = client.get(f"/api/investments/accounts/{account_id}/positions/AAPL.US/history")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["currency"] == "USD"
    assert body["basis"] == "reconstructed"
    # The first buy, not an arbitrary window start.
    assert body["opened_on"] == "2026-01-05"
    assert body["buy_dates"] == ["2026-01-05"]
    assert body["cost_basis"] == 750.0
    assert body["fees_paid"] == 4.0

    series = body["series"]
    assert len(series) > 1
    opening = next(p for p in series if p["date"] == "2026-01-05")
    # 5 shares were bought that day at 150, so both lines start together.
    assert opening["quantity"] == 5
    assert opening["invested"] == 750.0
    assert opening["value"] == 750.0
    # Later bars mark the same 5 shares to the broker's own closes.
    later = next(p for p in series if p["date"] == "2026-01-08")
    assert later["invested"] == 750.0
    assert later["value"] == 5 * 156.0
    # The series ends on the live synced valuation, not on a stale close.
    assert series[-1]["value"] == 1000.0


def test_position_history_404s_for_a_symbol_never_traded(client, db, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider)
    monkeypatch.setattr(position_history_service, "resolve_yahoo_listing", _no_yahoo_match)
    account_id = _connect(client)

    resp = client.get(f"/api/investments/accounts/{account_id}/positions/NOPE.US/history")
    assert resp.status_code == 404


def test_position_history_prices_from_yahoo_when_the_ticker_maps(client, db, monkeypatch):
    """The normal path: a mapped Yahoo series, not the broker's own candles."""
    import pandas as pd

    _patch_provider(monkeypatch, FakeFeeProvider)
    from app.services.market_data import CandidateCheck, YahooListing

    monkeypatch.setattr(
        position_history_service,
        "resolve_yahoo_listing",
        lambda *a, **k: YahooListing(
            symbol="AAPL", currency="USD", checked=[CandidateCheck("AAPL", "matched", "USD")]
        ),
    )

    frame = pd.DataFrame(
        {"close": [150.0, 170.0, 190.0]},
        index=pd.to_datetime(["2026-01-05", "2026-01-06", "2026-01-07"]),
    )
    monkeypatch.setattr(
        position_history_service, "get_price_history", lambda *a, **k: {"AAPL": frame}
    )

    account_id = _connect(client)
    body = client.get(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/history"
    ).json()

    assert body["price_source"] == "yahoo:AAPL"
    # Yahoo's closes, not the fake broker's (which prints 154 on the 6th).
    marked = next(p for p in body["series"] if p["date"] == "2026-01-06")
    assert marked["value"] == 5 * 170.0


def _patch_yahoo(monkeypatch, frame):
    from app.services.market_data import CandidateCheck, YahooListing

    monkeypatch.setattr(
        position_history_service,
        "resolve_yahoo_listing",
        lambda *a, **k: YahooListing(
            symbol="AAPL",
            currency="USD",
            checked=[
                CandidateCheck("AAPL.US", "no-data"),
                CandidateCheck("AAPL", "matched", "USD"),
            ],
        ),
    )
    monkeypatch.setattr(
        position_history_service, "get_price_history", lambda *a, **k: {"AAPL": frame}
    )


def test_position_history_shows_the_price_before_the_position_existed(client, db, monkeypatch):
    """The window opens before the first buy, and those days have a price but no holding."""
    import pandas as pd

    _patch_provider(monkeypatch, FakeFeeProvider)
    _patch_yahoo(
        monkeypatch,
        pd.DataFrame(
            {"close": [100.0, 120.0, 150.0, 170.0]},
            index=pd.to_datetime(["2026-01-02", "2026-01-03", "2026-01-05", "2026-01-06"]),
        ),
    )

    account_id = _connect(client)
    body = client.get(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/history"
    ).json()

    assert body["range"] == "entry"
    # A month of lead-in before the 5 Jan purchase, so the entry is not the
    # left edge of the chart.
    assert body["start"] < body["opened_on"]

    before = next(p for p in body["series"] if p["date"] == "2026-01-03")
    assert before["price"] == 120.0
    # Not zero: there was no position, which is a gap, not a worthless holding.
    assert before["value"] is None
    assert before["invested"] is None

    after = next(p for p in body["series"] if p["date"] == "2026-01-06")
    assert after["value"] == 5 * 170.0
    assert after["invested"] == 750.0


def test_short_range_carries_the_quantity_bought_before_the_window(client, db, monkeypatch):
    """A one-month view of an older holding must not replay from zero units."""
    import pandas as pd

    _patch_provider(monkeypatch, FakeFeeProvider)
    _patch_yahoo(
        monkeypatch,
        pd.DataFrame({"close": [150.0]}, index=pd.to_datetime(["2026-01-05"])),
    )

    account_id = _connect(client)
    body = client.get(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/history?range=1m"
    ).json()

    assert body["range"] == "1m"
    # The January buy is long outside this window, but its 5 units are not.
    assert body["series"][-1]["quantity"] == 5
    assert body["series"][-1]["value"] == 1000.0


def test_position_history_reports_the_tickers_it_tried(client, db, monkeypatch):
    """The mapping is a heuristic, so the page gets to show its working."""
    import pandas as pd

    _patch_provider(monkeypatch, FakeFeeProvider)
    _patch_yahoo(
        monkeypatch,
        pd.DataFrame({"close": [150.0]}, index=pd.to_datetime(["2026-01-05"])),
    )

    account_id = _connect(client)
    body = client.get(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/history"
    ).json()

    assert body["mapped_symbol"] == "AAPL"
    assert body["mapped_currency"] == "USD"
    assert body["native_currency"] == "USD"
    assert body["mapping_checked"] == [
        ["AAPL.US", "no-data", None],
        ["AAPL", "matched", "USD"],
    ]


def test_pinned_ticker_overrides_the_heuristic_and_survives_a_reset(client, db, monkeypatch):
    """The escape hatch for a wrong guess: choose the listing, and it sticks."""
    import pandas as pd
    from app.routers import investments as investments_router
    from app.services.market_data import CandidateCheck, YahooListing

    _patch_provider(monkeypatch, FakeFeeProvider)
    # The endpoint verifies the choice against Yahoo before storing it; the
    # verification itself is the one thing that would hit the network.
    monkeypatch.setattr(
        investments_router,
        "check_yahoo_symbol",
        lambda *a, **k: CandidateCheck("VIO.AT", "matched", "EUR"),
    )

    seen: dict = {}

    def _listing(db_, symbol, provider, *, currency=None, start=None, end=None, override=None):
        seen["override"] = override
        if override:
            return YahooListing(
                symbol=override,
                currency="EUR",
                checked=[CandidateCheck(override, "matched", "EUR")],
                source="manual",
            )
        return YahooListing(
            symbol="AAPL", currency="USD", checked=[CandidateCheck("AAPL", "matched", "USD")]
        )

    monkeypatch.setattr(position_history_service, "resolve_yahoo_listing", _listing)
    monkeypatch.setattr(
        position_history_service,
        "get_price_history",
        lambda symbols, *a, **k: {
            symbols[0]: pd.DataFrame(
                {"close": [150.0]}, index=pd.to_datetime(["2026-01-05"])
            )
        },
    )

    account_id = _connect(client)
    resp = client.put(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/mapping",
        json={"yahoo_symbol": "vio.at"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["yahoo_symbol"] == "VIO.AT"

    body = client.get(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/history"
    ).json()
    assert seen["override"] == "VIO.AT"
    assert body["mapped_symbol"] == "VIO.AT"
    # "You told us" is a different claim from "we guessed", and the page says which.
    assert body["mapping_source"] == "manual"

    assert (
        client.delete(
            f"/api/investments/accounts/{account_id}/positions/AAPL.US/mapping"
        ).json()["yahoo_symbol"]
        is None
    )
    body = client.get(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/history"
    ).json()
    assert seen["override"] is None
    assert body["mapped_symbol"] == "AAPL"


def test_a_ticker_yahoo_cannot_price_is_refused_rather_than_stored(client, db, monkeypatch):
    """A typo must fail loudly here, not quietly blank the chart later."""
    from app.routers import investments as investments_router
    from app.services.market_data import CandidateCheck

    _patch_provider(monkeypatch, FakeFeeProvider)
    monkeypatch.setattr(
        investments_router,
        "check_yahoo_symbol",
        lambda *a, **k: CandidateCheck("NOPE", "no-data"),
    )

    account_id = _connect(client)
    resp = client.put(
        f"/api/investments/accounts/{account_id}/positions/AAPL.US/mapping",
        json={"yahoo_symbol": "NOPE"},
    )

    assert resp.status_code == 400
    assert position_history_service.get_symbol_override(db, account_id, "AAPL.US") is None


def test_a_pinned_ticker_is_not_second_guessed_on_currency(db, monkeypatch):
    """The currency check exists to stop a *guess* pricing the wrong company.

    Someone who has looked at both listings and chosen one is better informed
    than the suffix table, so their choice is reported, not overruled.
    """
    import pandas as pd
    from types import SimpleNamespace
    from app.services.market_data import broker_symbols

    monkeypatch.setattr(
        broker_symbols,
        "get_price_history",
        lambda symbols, *a, **k: {symbols[0]: pd.DataFrame({"close": [1.0]})},
    )
    monkeypatch.setattr(
        broker_symbols, "get_symbol_meta", lambda db_, symbol: SimpleNamespace(currency="USD")
    )

    listing = broker_symbols.resolve_yahoo_listing(
        db, "VIO.GR", "freedom24", currency="EUR", override="VIO"
    )

    assert listing.symbol == "VIO"
    assert listing.source == "manual"
    assert listing.currency == "USD"


def test_sync_fetches_candles_before_opening_a_write_transaction(client, db, monkeypatch):
    """Network I/O (candle fetches) must never happen inside an open write
    transaction: it would hold SQLite's write lock for the duration of the calls."""
    seen = []

    class WatchingProvider(FakeProvider):
        def get_candles(self, symbol, start, end):
            seen.append(
                {"in_transaction": db.in_transaction(), "pending": bool(db.new or db.dirty or db.deleted)}
            )
            return super().get_candles(symbol, start, end)

    _patch_provider(monkeypatch, WatchingProvider)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    assert seen, "expected the backfill to fetch candles"
    assert all(not s["in_transaction"] and not s["pending"] for s in seen)
    # And the backfill still produced a series from those candles.
    assert db.query(PortfolioSnapshot).filter_by(account_id=account_id).count() >= 2


def test_sync_isolates_a_failing_candle_fetch(client, db, monkeypatch):
    class FlakyProvider(FakeProvider):
        def get_candles(self, symbol, start, end):
            raise RuntimeError("getHloc down")

    _patch_provider(monkeypatch, FlakyProvider)

    resp = client.post(
        "/api/investments/accounts",
        json={
            "name": "Freedom24 Brokerage",
            "provider": "freedom24",
            "currency": "USD",
            "public_key": "pub-123",
            "private_key": "priv-456",
        },
    )
    account_id = resp.json()["id"]

    credential = db.query(InvestmentCredential).filter_by(account_id=account_id).one()
    assert credential.sync_status == "ok"
    assert db.query(PortfolioPosition).filter_by(account_id=account_id).count() == 1
