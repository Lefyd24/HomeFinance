from datetime import date
from tests.factories import make_account, make_category, make_transaction, make_budget, make_debt


def test_top_merchants(client, db, seed_user):
    acc = make_account(db, seed_user)
    make_transaction(db, seed_user, acc, amount=30, type="expense", description="Lidl", tx_date=date.today())
    make_transaction(db, seed_user, acc, amount=70, type="expense", description="Lidl", tx_date=date.today())
    make_transaction(db, seed_user, acc, amount=20, type="expense", description="Cafe", tx_date=date.today())
    r = client.get("/api/reports/top-merchants?limit=5")
    assert r.status_code == 200
    body = r.json()
    assert body["labels"][0] == "Lidl"
    assert body["data"][0] == 100.0


def test_savings_rate(client, db, seed_user):
    acc = make_account(db, seed_user)
    make_transaction(db, seed_user, acc, amount=1000, type="income", tx_date=date.today())
    make_transaction(db, seed_user, acc, amount=400, type="expense", tx_date=date.today())
    r = client.get("/api/reports/savings-rate")
    assert r.status_code == 200
    body = r.json()
    assert body["rate"][-1] == 60.0


def test_weekday_heatmap_shape(client, db, seed_user):
    acc = make_account(db, seed_user)
    make_transaction(db, seed_user, acc, amount=10, type="expense", tx_date=date.today())
    r = client.get("/api/reports/weekday-heatmap")
    assert r.status_code == 200
    body = r.json()
    assert body["weekdays"] == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    assert len(body["data"]) == 7


def test_spending_mom_shape(client, db, seed_user):
    acc = make_account(db, seed_user)
    make_transaction(db, seed_user, acc, amount=50, type="expense", tx_date=date.today())
    r = client.get("/api/reports/spending-mom")
    assert r.status_code == 200
    body = r.json()
    assert set(["labels", "data", "changes"]) <= set(body.keys())
    assert len(body["data"]) == len(body["labels"]) == len(body["changes"])
    assert body["changes"][0] == 0.0


def test_net_worth_shape(client, db, seed_user):
    acc = make_account(db, seed_user)
    make_transaction(db, seed_user, acc, amount=500, type="income", tx_date=date.today())
    r = client.get("/api/reports/net-worth")
    assert r.status_code == 200
    body = r.json()
    assert set(["labels", "data"]) <= set(body.keys())
    assert len(body["data"]) == len(body["labels"])


def test_budget_performance_uses_real_spend(client, db, seed_user):
    cat = make_category(db, seed_user, name="Groceries", type="expense")
    acc = make_account(db, seed_user)
    budget = make_budget(db, seed_user, name="Groceries Budget", amount=200.0, period="monthly")
    # attach the category to the budget so spend is scoped to it
    from app.models import BudgetCategory
    db.add(BudgetCategory(budget_id=budget.id, category_id=cat.id))
    db.commit()
    make_transaction(db, seed_user, acc, category=cat, amount=50, type="expense", tx_date=date.today())
    r = client.get("/api/reports/budget-performance")
    assert r.status_code == 200
    body = r.json()
    assert "budgets" in body
    entry = next(b for b in body["budgets"] if b["name"] == "Groceries Budget")
    assert entry["spent"] == 50.0
    assert entry["limit"] == 200.0
    assert entry["pct"] == 25.0


def test_debt_insights_shape(client, db, seed_user):
    make_debt(db, seed_user, name="Car Loan", original_balance=10000.0, current_balance=8000.0, interest_rate=0.05)
    r = client.get("/api/reports/debt-insights")
    assert r.status_code == 200
    body = r.json()
    assert set(["debts", "total_current", "total_interest_paid"]) <= set(body.keys())
    entry = body["debts"][0]
    assert entry["name"] == "Car Loan"
    assert entry["paid_pct"] == 20.0
    assert body["total_current"] == 8000.0
