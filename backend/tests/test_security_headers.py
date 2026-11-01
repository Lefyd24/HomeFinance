from app.config import settings
from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.testclient import TestClient
import main

HEADERS = (
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "strict-transport-security",
)


def test_headers_on_api_and_spa():
    with TestClient(main.app) as c:
        responses = [c.get("/health"), c.get("/api/legal")]
        if main._frontend_dir.is_dir():
            responses.append(c.get("/"))
    for r in responses:
        for h in HEADERS:
            assert h in r.headers, (r.url, h)


def test_existing_route_csp_is_kept():
    mini = FastAPI()
    mini.middleware("http")(main.security_headers)
    sandbox = "sandbox; default-src 'none'"

    @mini.get("/p")
    def p():
        return Response("x", headers={"Content-Security-Policy": sandbox})

    r = TestClient(mini).get("/p")
    assert r.headers["content-security-policy"] == sandbox
    assert r.headers["x-frame-options"] == "DENY"


def test_docs_disabled_outside_debug():
    assert not settings.DEBUG
    with TestClient(main.app) as c:
        assert c.get("/openapi.json").status_code == 404
        # With a built SPA, /docs falls through to index.html, never Swagger UI.
        r = c.get("/docs")
        assert r.status_code == 404 or "swagger-ui" not in r.text
