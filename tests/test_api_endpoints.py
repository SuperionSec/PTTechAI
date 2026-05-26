"""
PTTechAI v3 - API Endpoint Tests

Tests the FastAPI application can be created, all routers are registered,
and key endpoints respond correctly after the brand rename.
"""
import sys
import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture
def app():
    from backend.main import app as fastapi_app
    return fastapi_app


class TestFastAPIAppCreation:
    """Test that the FastAPI app can be created."""

    def test_app_exists(self, app):
        assert app is not None

    def test_app_title_contains_pttechai(self, app):
        assert "PTTechAI" in app.title, f"App title should contain 'PTTechAI', got: {app.title}"

    def test_app_version(self, app):
        assert app.version == "3.0.0", f"App version should be '3.0.0', got: {app.version}"


class TestRouterRegistration:
    """Test that all API routers are registered."""

    EXPECTED_ROUTES = [
        "/api/v1/auth",
        "/api/v1/users",
        "/api/v1/scans",
        "/api/v1/targets",
        "/api/v1/prompts",
        "/api/v1/reports",
        "/api/v1/dashboard",
        "/api/v1/vulnerabilities",
        "/api/v1/settings",
        "/api/v1/agent",
        "/api/v1/agent-tasks",
        "/api/v1/scheduler",
        "/api/v1/vuln-lab",
        "/api/v1/terminal",
        "/api/v1/sandbox",
        "/api/v1/knowledge",
        "/api/v1/mcp",
        "/api/v1/providers",
        "/api/v1/full-ia",
        "/api/v1/permissions",
        "/api/v1/rbac",
    ]

    def test_all_routers_registered(self, app):
        registered_paths = set()
        for route in app.routes:
            if hasattr(route, "path"):
                registered_paths.add(route.path)

        missing = []
        for expected in self.EXPECTED_ROUTES:
            found = any(expected in path for path in registered_paths)
            if not found:
                missing.append(expected)

        assert len(missing) == 0, f"Missing API routes: {missing}"

    def test_health_endpoint_exists(self, app):
        registered_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/api/health" in registered_paths, "Health endpoint not found"

    def test_websocket_endpoint_exists(self, app):
        registered_paths = [r.path for r in app.routes if hasattr(r, "path")]
        ws_found = any("/ws/scan/" in p for p in registered_paths)
        assert ws_found, "WebSocket endpoint not found"

    def test_api_docs_endpoints(self, app):
        registered_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/api/docs" in registered_paths, "Swagger docs endpoint not found"
        assert "/api/redoc" in registered_paths, "ReDoc endpoint not found"
        assert "/api/openapi.json" in registered_paths, "OpenAPI schema endpoint not found"


class TestHealthEndpoint:
    """Test the health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_check(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "PTTechAI" in data["app"] or "pttechai" in data["app"].lower(), \
                f"Health response app name should reference PTTechAI, got: {data['app']}"
            assert data["version"] == "3.0.0"


class TestAuthEndpoints:
    """Test authentication API endpoints."""

    @pytest.mark.asyncio
    async def test_login_endpoint_exists(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/auth/login", json={
                "email": "nonexistent@test.com",
                "password": "wrong"
            })
            assert response.status_code in (401, 422, 400), \
                f"Login with bad creds should return 4xx, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_register_endpoint_exists(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/auth/register", json={
                "email": "test@example.com",
                "password": "TestPass123!",
                "full_name": "Test User"
            })
            assert response.status_code in (200, 201, 400, 401, 403, 409, 422), \
                f"Register endpoint should respond, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_me_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/auth/me")
            assert response.status_code in (401, 403), \
                f"/auth/me should require auth, got {response.status_code}"


class TestScanEndpoints:
    """Test scan API endpoints."""

    @pytest.mark.asyncio
    async def test_list_scans_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/scans")
            assert response.status_code in (401, 403), \
                f"List scans should require auth, got {response.status_code}"


class TestDashboardEndpoints:
    """Test dashboard API endpoints."""

    @pytest.mark.asyncio
    async def test_dashboard_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/dashboard/stats")
            assert response.status_code in (401, 403), \
                f"Dashboard should require auth, got {response.status_code}"


class TestRbacEndpoints:
    """Test RBAC API endpoints."""

    @pytest.mark.asyncio
    async def test_rbac_me_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/rbac/me")
            assert response.status_code in (401, 403), \
                f"RBAC profile should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_rbac_roles_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/rbac/roles")
            assert response.status_code in (401, 403), \
                f"RBAC roles should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_rbac_permissions_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/rbac/permissions")
            assert response.status_code in (401, 403), \
                f"RBAC permissions should require auth, got {response.status_code}"


class TestVulnLabEndpoints:
    """Test vulnerability lab endpoints."""

    @pytest.mark.asyncio
    async def test_vuln_types_endpoint(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/vuln-lab/types")
            assert response.status_code in (200, 401, 403), \
                f"Vuln lab types should respond, got {response.status_code}"
