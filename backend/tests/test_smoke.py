def test_client_boots(client):
    resp = client.get("/health")
    assert resp.status_code == 200
