"""Cross-user access: user A (the `client`'s seed_user) must not read, change, delete
or list anything that belongs to user B, through any /api route that takes an id.

Layout
* `world` builds one object of every kind for B (names/amounts carry LEAK markers).
* CASES  : (method, path template over world ids, body builder, expected status).
           Each is called as A and must be refused; the whole DB (and B's document
           folder) must be byte-for-byte unchanged afterwards.
* EXEMPT : id-taking routes that are deliberately not per-user, with the reason.
* a guard test fails when a /api route with a {param} is in neither table.
* LEAK_URLS: collection/aggregate GETs; B has data, A has none, B's markers must
           not show up in A's response.
"""
import json
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import select

import main
from app.config import settings
from app.database import Base
from app.models import (
    Account, ApiKey, Category, BankConnection, BudgetCategory, CategoryRule, CategoryRuleCondition, DebtPayment,
    FinancialGoal, GoalTransaction, ImportBatch, InvestmentCredential, InviteCode,
    InvestorProfile, InvestorProfileRevision, NotificationRule, PositionSymbolMap,
    RecurringExpensePayment, SavedComparison, SavedReport, SavedWatch, Scenario, Tracker,
    TrackerTransaction, TransactionReimbursement, User,
)
from app.routers import bank_sync as bank_sync_router, documents as documents_router
from tests.factories import (
    make_account, make_budget, make_category, make_debt, make_investment_account,
    make_position, make_recurring, make_transaction,
)

MARK = "BSECRET"      # appears in every name/description B owns
AMOUNT = 987654.32    # distinctive amount; "98765" must never reach A


def _add(db, obj):
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@pytest.fixture()
def victim(db):
    return _add(db, User(email="b@example.com", hashed_password="x", full_name=MARK,
                         is_active=True))


@pytest.fixture()
def docs_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "DOCUMENTS_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture()
def world(db, victim, docs_dir):
    """Everything B owns. Ids are exposed as attributes for the path templates."""
    u = victim
    w = SimpleNamespace(user=u)
    w.acct = make_account(db, u, name=f"{MARK} acct", balance=AMOUNT).id
    w.cat = make_category(db, u, name=f"{MARK} cat").id
    tx = make_transaction(db, u, _acct(db, w.acct), amount=AMOUNT, description=f"{MARK} tx",
                          category=_cat(db, w.cat))
    w.tx = tx.id
    income = make_transaction(db, u, _acct(db, w.acct), amount=AMOUNT, type="income",
                              description=f"{MARK} income", category=_cat(db, w.cat))
    w.income = income.id
    budget = make_budget(db, u, name=f"{MARK} budget", amount=AMOUNT)
    w.budget = budget.id
    _add(db, BudgetCategory(budget_id=budget.id, category_id=w.cat))
    debt = make_debt(db, u, name=f"{MARK} debt", type="other", current_balance=AMOUNT, original_balance=AMOUNT)
    w.debt = debt.id
    w.debt_pay = _add(db, DebtPayment(debt_id=debt.id, user_id=u.id, amount=AMOUNT,
                                      payment_date=date.today())).id
    goal = _add(db, FinancialGoal(user_id=u.id, name=f"{MARK} goal", target_amount=AMOUNT))
    w.goal = goal.id
    _add(db, GoalTransaction(goal_id=goal.id, user_id=u.id, amount=AMOUNT, type="deposit",
                             date=date.today()))
    rec = make_recurring(db, u, _acct(db, w.acct), name=f"{MARK} rec", amount=AMOUNT)
    w.rec = rec.id
    w.rec_pay = _add(db, RecurringExpensePayment(recurring_expense_id=rec.id, user_id=u.id,
                                                 amount=AMOUNT, payment_date=date.today())).id
    tracker = _add(db, Tracker(user_id=u.id, name=f"{MARK} tracker"))
    w.tracker = tracker.id
    _add(db, TrackerTransaction(tracker_id=tracker.id, transaction_id=tx.id, user_id=u.id))
    rule = _add(db, CategoryRule(user_id=u.id, name=f"{MARK} rule", category_id=w.cat))
    w.rule = rule.id
    _add(db, CategoryRuleCondition(rule_id=rule.id, field="description", operator="contains",
                                   value=MARK))
    w.reimb = _add(db, TransactionReimbursement(user_id=u.id, expense_id=tx.id,
                                                income_id=income.id, amount=1.0)).id
    w.scenario = _add(db, Scenario(user_id=u.id, name=f"{MARK} scenario", kind="backtest",
                                   symbol="AAPL.US", start_date=date(2024, 1, 1),
                                   initial_amount=AMOUNT)).id
    w.report = _add(db, SavedReport(user_id=u.id, name=f"{MARK} report",
                                    report_type="spending",
                                    configuration="{}")).id
    w.batch = _add(db, ImportBatch(user_id=u.id, filename=f"{MARK}.csv", file_type="csv",
                                   parsed_data=[])).id
    w.notif = _add(db, NotificationRule(user_id=u.id, type="budget_threshold",
                                        name=f"{MARK} notif")).id
    conn = _add(db, BankConnection(user_id=u.id, aspsp_name=f"{MARK} bank", aspsp_country="GR"))
    w.conn = conn.id
    linked = make_account(db, u, name=f"{MARK} linked", is_linked=True)
    linked.bank_connection_id = conn.id
    db.commit()
    w.linked = linked.id
    inv = make_investment_account(db, u, name=f"{MARK} broker", balance=AMOUNT)
    w.inv = inv.id
    make_position(db, inv, symbol="BSECRET.US", name=f"{MARK} stock")
    w.sym = "BSECRET.US"
    _add(db, InvestmentCredential(account_id=inv.id, provider="freedom24",
                                  encrypted_public_key="enc-pub", encrypted_private_key="enc-priv"))
    _add(db, PositionSymbolMap(account_id=inv.id, broker_symbol=w.sym, yahoo_symbol="AAPL"))
    w.watch = _add(db, SavedWatch(user_id=u.id, symbol="BSECRET")).id
    w.comparison = _add(db, SavedComparison(user_id=u.id, name=f"{MARK} cmp",
                                            symbols=json.dumps(["AAPL"]))).id
    profile = _add(db, InvestorProfile(user_id=u.id))
    w.revision = _add(db, InvestorProfileRevision(profile_id=profile.id, field="goal")).id
    w.apikey = _add(db, ApiKey(user_id=u.id, name=f"{MARK} key", key_hash="h" * 64,
                               key_prefix="pf_bsecret", last_four="1234")).id
    w.invite = _add(db, InviteCode(code_hash="i" * 64, created_by_user_id=u.id)).id
    # documents live on disk, not in the DB
    ddir = docs_dir / str(u.id)
    ddir.mkdir()
    (ddir / "bdoc.txt").write_text("B private contents")
    w.doc = "b-doc-id"
    w.folder = f"{MARK}-folder"
    (ddir / "_index.json").write_text(json.dumps({
        "version": 2, "folders": [w.folder],
        "documents": [{"id": w.doc, "title": f"{MARK} doc", "filename": "bdoc.txt",
                       "stored_name": "bdoc.txt", "mime_type": "text/plain",
                       "folder": w.folder, "description": ""}],
    }))
    return w


def _cat(db, cat_id):
    return db.get(Category, cat_id)


def _acct(db, acct_id):
    return db.get(Account, acct_id)


@pytest.fixture()
def mine(db, seed_user):
    """A's own objects, so a 404 can only come from the foreign id in the path."""
    a = make_account(db, seed_user, name="A acct")
    return SimpleNamespace(
        acct=a.id,
        tx=make_transaction(db, seed_user, a, description="A tx").id,
        income=make_transaction(db, seed_user, a, type="income", description="A inc").id,
    )


@pytest.fixture()
def as_file_user(seed_user):
    """preview/download authenticate via a Bearer header; swap in A without touching tokens."""
    main.app.dependency_overrides[documents_router.get_user_for_file] = lambda: seed_user


def _dump(db, docs_dir, owner_id):
    """Every row of every table plus every file in B's document folder."""
    db.expire_all()
    rows = {t.name: sorted(map(repr, db.execute(select(t)).all()))
            for t in Base.metadata.sorted_tables}
    files = {str(p.relative_to(docs_dir)): p.read_bytes()
             for p in (docs_dir / str(owner_id)).rglob("*") if p.is_file()}
    return rows, files


# --------------------------------------------------------------------------- CASES
# (method, path template, body builder (w=B's world, m=A's own objects) or None, status)
def _c(method, path, body=None, status=404):
    return (method, path, body, status)


CASES = [
    # accounts
    _c("GET", "/api/accounts/{acct}"),
    _c("PUT", "/api/accounts/{acct}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/accounts/{acct}"),
    _c("GET", "/api/accounts/{acct}/balance"),
    _c("GET", "/api/accounts/{acct}/transactions"),
    # transactions
    _c("GET", "/api/transactions/{tx}"),
    _c("PUT", "/api/transactions/{tx}", lambda w, m: {"description": "HACKED"}),
    _c("DELETE", "/api/transactions/{tx}"),
    _c("POST", "/api/transactions/{tx}/pair-transfer",
       lambda w, m: {"paired_transaction_id": m.tx}),
    _c("GET", "/api/transactions/{tx}/reimbursement-candidates"),
    _c("POST", "/api/transactions/{tx}/reimbursements",
       lambda w, m: {"counterpart_id": m.income}),
    _c("DELETE", "/api/transactions/reimbursements/{reimb}"),
    _c("POST", "/api/transactions/{tx}/retag-transfer",
       lambda w, m: {"destination_account_id": m.acct}),
    _c("POST", "/api/transactions/{tx}/split",
       lambda w, m: {"parts": [{"amount": 1, "description": "x"}, {"amount": 2, "description": "y"}]}),
    _c("PUT", "/api/transactions/{tx}/trackers", lambda w, m: {"tracker_ids": [w.tracker]}),
    _c("POST", "/api/transactions/{tx}/unmark-transfer"),
    # categories
    _c("GET", "/api/categories/{cat}"),
    _c("PUT", "/api/categories/{cat}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/categories/{cat}"),
    # rules
    _c("PUT", "/api/rules/{rule}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/rules/{rule}"),
    _c("POST", "/api/rules/{rule}/apply", lambda w, m: {}),
    # budgets
    _c("GET", "/api/budgets/{budget}"),
    _c("PUT", "/api/budgets/{budget}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/budgets/{budget}"),
    _c("POST", "/api/budgets/{budget}/categories?category_id={cat}"),
    _c("DELETE", "/api/budgets/{budget}/categories/{cat}"),
    _c("GET", "/api/budgets/{budget}/progress"),
    _c("GET", "/api/budgets/{budget}/report"),
    _c("GET", "/api/budgets/{budget}/summary"),
    _c("GET", "/api/budgets/{budget}/transactions"),
    # debts
    _c("GET", "/api/debts/{debt}"),
    _c("PUT", "/api/debts/{debt}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/debts/{debt}"),
    _c("POST", "/api/debts/{debt}/payments",
       lambda w, m: {"amount": 5, "payment_date": "2026-01-01"}),
    _c("GET", "/api/debts/{debt}/payments"),
    _c("PUT", "/api/debts/{debt}/payments/{debt_pay}", lambda w, m: {"amount": 1}),
    _c("DELETE", "/api/debts/{debt}/payments/{debt_pay}"),
    # goals
    _c("GET", "/api/goals/{goal}"),
    _c("PUT", "/api/goals/{goal}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/goals/{goal}"),
    _c("GET", "/api/goals/{goal}/progress"),
    _c("POST", "/api/goals/{goal}/transactions",
       lambda w, m: {"amount": 5, "type": "contribution", "date": "2026-01-01"}),
    _c("GET", "/api/goals/{goal}/transactions"),
    # recurring expenses
    _c("PUT", "/api/recurring-expenses/{rec}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/recurring-expenses/{rec}"),
    _c("POST", "/api/recurring-expenses/{rec}/payments",
       lambda w, m: {"amount": 5, "payment_date": "2026-01-01"}),
    _c("PUT", "/api/recurring-expenses/{rec}/payments/{rec_pay}", lambda w, m: {"amount": 1}),
    _c("DELETE", "/api/recurring-expenses/{rec}/payments/{rec_pay}"),
    _c("GET", "/api/recurring-expenses/{rec}/transactions"),
    # trackers
    _c("GET", "/api/trackers/{tracker}"),
    _c("PUT", "/api/trackers/{tracker}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/trackers/{tracker}"),
    _c("GET", "/api/trackers/{tracker}/transactions"),
    _c("POST", "/api/trackers/{tracker}/transactions",
       lambda w, m: {"account_id": m.acct, "amount": 5, "description": "x", "date": "2026-01-01"}),
    _c("POST", "/api/trackers/{tracker}/transactions/link",
       lambda w, m: {"transaction_id": m.tx}),
    _c("DELETE", "/api/trackers/{tracker}/transactions/{tx}"),
    # scenarios
    _c("GET", "/api/scenarios/{scenario}"),
    _c("PATCH", "/api/scenarios/{scenario}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/scenarios/{scenario}"),
    _c("POST", "/api/scenarios/{scenario}/rebuild"),
    # saved reports
    _c("GET", "/api/reports/saved/{report}"),
    _c("DELETE", "/api/reports/saved/{report}"),
    # import wizard
    _c("GET", "/api/import/batches/{batch}"),
    _c("GET", "/api/import/preview/{batch}"),
    _c("POST", "/api/import/preview/{batch}/categorize"),
    # documents (folders are per-user names: A deleting "B's" folder name is a no-op on A's index)
    _c("PUT", "/api/documents/{doc}", lambda w, m: {"title": "HACKED"}),
    _c("DELETE", "/api/documents/{doc}"),
    _c("GET", "/api/documents/{doc}/download"),
    _c("GET", "/api/documents/{doc}/preview"),
    _c("DELETE", "/api/documents/folders/{folder}", status=200),
    # bank sync
    _c("DELETE", "/api/bank-sync/accounts/{linked}"),
    _c("DELETE", "/api/bank-sync/connections/{conn}"),
    _c("POST", "/api/bank-sync/connections/{conn}/sync"),
    # investments / performance
    _c("PUT", "/api/investments/accounts/{inv}", lambda w, m: {"name": "HACKED"}),
    _c("PUT", "/api/investments/accounts/{inv}/credentials",
       lambda w, m: {"public_key": "evil", "private_key": "evil"}),
    _c("GET", "/api/investments/accounts/{inv}/earn"),
    _c("GET", "/api/investments/accounts/{inv}/history"),
    _c("GET", "/api/investments/accounts/{inv}/positions"),
    _c("GET", "/api/investments/accounts/{inv}/positions/{sym}/history"),
    _c("PUT", "/api/investments/accounts/{inv}/positions/{sym}/mapping",
       lambda w, m: {"yahoo_symbol": "EVIL"}),
    _c("DELETE", "/api/investments/accounts/{inv}/positions/{sym}/mapping"),
    _c("POST", "/api/investments/accounts/{inv}/sync"),
    _c("GET", "/api/investments/accounts/{inv}/transactions"),
    _c("DELETE", "/api/investments/compare/saved/{comparison}"),
    _c("PUT", "/api/investments/watchlist/{watch}", lambda w, m: {"symbol": "EVIL"}),
    _c("DELETE", "/api/investments/watchlist/{watch}"),
    # investor profile
    _c("POST", "/api/investor-profile/revisions/{revision}/undo"),
    # notifications
    _c("PUT", "/api/notifications/rules/{notif}", lambda w, m: {"name": "HACKED"}),
    _c("DELETE", "/api/notifications/rules/{notif}"),
    # api keys
    _c("DELETE", "/api/auth/api-keys/{apikey}"),
    # admin (require_admin -> 403 for non-admin A); 403 is by design here
    _c("DELETE", "/api/admin/invites/{invite}", status=403),
    _c("POST", "/api/admin/invites/{invite}/revoke", status=403),
    _c("PATCH", "/api/admin/users/{user_id}/active", lambda w, m: {"is_active": False}, 403),
    _c("GET", "/api/admin/invites", status=403),
    _c("POST", "/api/admin/invites", lambda w, m: {}, 403),
    _c("GET", "/api/admin/users", status=403),
]

EXEMPT = {
    ("GET", "/api/investments/company/{symbol}"): "public market data keyed by ticker, no user data",
    ("GET", "/api/investments/company/{symbol}/history"): "public market data keyed by ticker",
    ("GET", "/api/investments/news/{story_id}"): "public news story lookup, no user data",
    ("GET", "/api/investments/simulate/{symbol}"): "public price-based simulation of a ticker",
    ("GET", "/api/investments/technical/{symbol}"): "public technical analysis of a ticker",
    ("PUT", "/api/investments/provider-settings/{provider}"):
        "path is a provider name; the row is looked up by (current_user, provider)",
}


def _api_routes():
    """(METHOD, full path) of every APIRoute under /api, flattening include_router nesting
    (newer FastAPI wraps included routers in _IncludedRouter, so app.routes alone is shallow)."""
    out = []

    def walk(routes, prefix):
        for r in routes:
            if isinstance(r, APIRoute):
                out.extend((m, prefix + r.path) for m in r.methods - {"HEAD", "OPTIONS"})
            elif hasattr(r, "original_router"):
                walk(r.original_router.routes, prefix + r.include_context.prefix)
            elif hasattr(r, "routes"):
                walk(r.routes, prefix)

    walk(main.app.routes, "")
    return {(m, p) for m, p in out if p.startswith("/api")}


def _template(path):
    # "?query" part is not part of the route path
    return path.split("?")[0]


def _norm(path):
    """/api/x/{tx} and /api/x/{transaction_id} are the same route: compare by shape."""
    import re
    return re.sub(r"\{[^}]+\}", "{}", _template(path))


def test_every_id_route_is_covered():
    param_routes = {(m, p) for m, p in _api_routes() if "{" in p}
    assert param_routes, "route discovery found nothing - the guard would be vacuous"
    covered = {(m, _norm(p)) for m, p, _, _ in CASES} | {(m, _norm(p)) for m, p in EXEMPT}
    missing = sorted(r for r in param_routes if (r[0], _norm(r[1])) not in covered)
    assert not missing, f"id-taking routes with no cross-user case or exemption: {missing}"


def test_cases_and_exemptions_point_at_real_routes():
    real = {(m, _norm(p)) for m, p in _api_routes()}
    stale = [(m, p) for m, p, _, _ in CASES if (m, _norm(p)) not in real]
    stale += [k for k in EXEMPT if (k[0], _norm(k[1])) not in real]
    assert not stale, f"stale entries: {stale}"
    assert all(EXEMPT.values())


@pytest.mark.parametrize("method,path,body,status", CASES,
                         ids=[f"{m} {p}" for m, p, _, _ in CASES])
def test_user_a_cannot_touch_user_b(client, db, docs_dir, world, mine, as_file_user, monkeypatch,
                                    method, path, body, status):
    # bank-sync routes 503 before any ownership check when the integration is off
    monkeypatch.setattr(bank_sync_router.eb, "is_configured", lambda: True)
    ids = {**vars(world), "user_id": world.user.id}
    url = path.format(**ids)
    before = _dump(db, docs_dir, world.user.id)

    kwargs = {"json": body(world, mine)} if body else {}
    r = client.request(method, url, **kwargs)

    assert r.status_code == status, f"{method} {url} -> {r.status_code}: {r.text[:300]}"
    assert MARK not in r.text and "98765" not in r.text and "B private" not in r.text
    assert _dump(db, docs_dir, world.user.id) == before, "B's data was modified"


# --------------------------------------------------------------------------- LEAKS
LEAK_URLS = [
    "/api/accounts/", "/api/accounts/?include_inactive=true",
    "/api/transactions/", "/api/transactions/income-vs-spending",
    "/api/categories/", 
    "/api/rules", "/api/budgets/", "/api/debts/", "/api/debts/summary",
    "/api/debts/upcoming-payments",
    "/api/goals/", "/api/goals/summary",
    "/api/recurring-expenses/", "/api/recurring-expenses/upcoming",
    "/api/trackers/", "/api/scenarios/track-record",
    "/api/reports/saved", "/api/reports/spending", "/api/reports/income",
    "/api/reports/cashflow", "/api/reports/net-worth", "/api/reports/balance-history",
    "/api/reports/category-breakdown", "/api/reports/budget-performance",
    "/api/reports/debt-insights", "/api/reports/savings-rate", "/api/reports/spending-mom",
    "/api/reports/top-merchants", "/api/reports/trend", "/api/reports/weekday-heatmap",
    "/api/reports/export?report=spending",
    "/api/advisor/net-worth", "/api/advisor/net-worth/history",
    "/api/import/batches", "/api/documents", "/api/documents/folders",
    "/api/bank-sync/connections",
    "/api/investments/accounts", "/api/investments/performance",
    "/api/investments/watchlist", "/api/investments/compare/saved",
    "/api/investments/provider-settings",
    "/api/investor-profile", "/api/investor-profile/revisions",
    "/api/notifications/rules", "/api/notifications/log", "/api/notifications/settings",
    "/api/notifications/push/status", "/api/ai/usage",
    "/api/auth/api-keys", "/api/auth/me",
]


@pytest.mark.parametrize("url", LEAK_URLS)
def test_user_a_listings_do_not_leak_user_b(client, world, as_file_user, url):
    r = client.get(url)
    assert r.status_code == 200, f"{url} -> {r.status_code}: {r.text[:300]}"
    assert MARK not in r.text and "98765" not in r.text and "b@example.com" not in r.text


def test_user_a_search_does_not_find_user_b(client, world):
    for url in (f"/api/transactions/?search={MARK}", f"/api/transactions/?q={MARK}"):
        r = client.get(url)
        assert r.status_code == 200, r.text[:300]
        assert MARK not in r.text


def test_leak_check_would_notice_a_leak(client, db, seed_user, docs_dir):
    """Sanity: the same GET as the real owner does show the marker, so the markers are not inert."""
    make_account(db, seed_user, name=f"{MARK} acct")
    assert MARK in client.get("/api/accounts/").text
