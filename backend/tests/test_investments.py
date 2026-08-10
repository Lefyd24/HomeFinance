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
