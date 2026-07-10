def test_send_push_mocked(monkeypatch):
    import app.services.push_service as p
    calls = {}
    monkeypatch.setattr(p, "webpush", lambda **k: calls.update(k))
    class Sub: endpoint="https://x"; p256dh="a"; auth="b"
    class App: VAPID_PRIVATE_KEY="k"; VAPID_PUBLIC_KEY="pub"; VAPID_SUBJECT="mailto:a@b"
    ok = p.send_push(Sub(), {"title": "Hi"}, App())
    assert ok and "subscription_info" in calls
