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
        "/api/v1/system",
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

    def test_v1_router_registry_keeps_system_and_pentest_boundaries(self):
        from backend.routes import PENTEST_ROUTERS, SYSTEM_ROUTERS

        system_prefixes = {spec.prefix for spec in SYSTEM_ROUTERS}
        pentest_prefixes = {spec.prefix for spec in PENTEST_ROUTERS}

        assert system_prefixes == {"/api/v1/system", "/api/v1/menus", "/api/v1/audit", "/api/v1/monitor"}
        assert "/api/v1/settings" in pentest_prefixes
        assert "/api/v1/scheduler" in pentest_prefixes
        assert "/api/v1/knowledge" in pentest_prefixes
        assert "/api/v1/terminal" in pentest_prefixes
        assert "/api/v1/mcp" in pentest_prefixes
        assert "/api/v1/providers" in pentest_prefixes
        assert any(spec.prefix is None and spec.tags == ["CLI Agent"] for spec in PENTEST_ROUTERS)

    def test_health_endpoint_exists(self, app):
        registered_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/api/health" in registered_paths, "Health endpoint not found"

    def test_websocket_endpoint_exists(self, app):
        registered_paths = [r.path for r in app.routes if hasattr(r, "path")]
        ws_found = any("/ws/scan/" in p for p in registered_paths)
        assert ws_found, "WebSocket endpoint not found"

    def test_cli_agent_router_keeps_own_prefix(self, app):
        registered_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/api/v1/cli-agent/providers" in registered_paths
        assert "/api/v1/cli-agent/methodologies" in registered_paths

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
            assert data["status"] in ("ok", "healthy")
            assert "app" in data or data["status"] == "ok"


class TestAuthEndpoints:
    """Test authentication API endpoints."""

    @pytest.mark.asyncio
    async def test_login_endpoint_exists(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/system/profile/login", json={
                "email": "nonexistent@test.com",
                "password": "wrong"
            })
            assert response.status_code in (401, 422, 400), \
                f"Login with bad creds should return 4xx, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_register_endpoint_exists(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/system/profile/register", json={
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
            response = await client.get("/api/v1/system/profile/me")
            assert response.status_code in (401, 403), \
                f"/system/profile/me should require auth, got {response.status_code}"


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
    async def test_system_me_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/system/me")
            assert response.status_code in (401, 403), \
                f"System profile should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_system_roles_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/system/roles")
            assert response.status_code in (401, 403), \
                f"System roles should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_system_permissions_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/system/permissions")
            assert response.status_code in (401, 403), \
                f"System permissions should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_system_users_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/system/users")
            assert response.status_code in (401, 403), \
                f"System users should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_system_profile_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/system/profile/me")
            assert response.status_code in (401, 403), \
                f"System profile should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_system_api_keys_requires_auth(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/system/api-keys")
            assert response.status_code in (401, 403), \
                f"System API keys should require auth, got {response.status_code}"

    @pytest.mark.asyncio
    async def test_legacy_auth_and_users_routes_are_removed(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "wrong"})).status_code == 404
            assert (await client.get("/api/v1/users")).status_code == 404

    def test_rbac_me_response_model_has_frontend_contract_fields(self):
        from backend.common.schemas.rbac import MenuItemOut, RbacMeOut

        assert set(RbacMeOut.model_fields) == {"role", "permissions", "frontend_pages", "backend_apis", "access", "menus"}
        assert set(MenuItemOut.model_fields) == {"path", "name", "menu_type", "permission", "icon", "locale", "access", "children"}


    def test_default_backend_resource_mappings_cover_registered_apis(self, app):
        from backend.common.infra.rbac.matcher import match_api_resource
        from backend.scripts.init_permissions import PERMISSION_BACKEND_APIS
        from backend.system.rbac.service import PUBLIC_API_RESOURCES, discover_api_routes

        registered = discover_api_routes(app) - PUBLIC_API_RESOURCES
        patterns = {pattern for api_patterns in PERMISSION_BACKEND_APIS.values() for pattern in api_patterns}
        unmapped = [resource for resource in sorted(registered) if not any(match_api_resource(pattern, resource) for pattern in patterns)]

        assert unmapped == []

    def test_default_frontend_resource_mappings_cover_protected_routes(self):
        from backend.scripts.init_permissions import PERMISSION_FRONTEND_PAGES

        def match_frontend_resource(pattern: str, path: str) -> bool:
            if pattern == path:
                return True
            pattern_parts = pattern.strip("/").split("/")
            path_parts = path.strip("/").split("/")
            return len(pattern_parts) == len(path_parts) and all(pattern_part.startswith(":") or pattern_part == path_part for pattern_part, path_part in zip(pattern_parts, path_parts))

        route_config = (PROJECT_ROOT / "frontend" / "src" / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        protected_routes = []
        for line in route_config.splitlines():
            if "path: '" in line and "access: 'canAccessPage'" in line:
                protected_routes.append(line.split("path: '")[1].split("'")[0])

        mapped_patterns = {pattern for page_patterns in PERMISSION_FRONTEND_PAGES.values() for pattern in page_patterns}
        unmapped = [route for route in protected_routes if not any(match_frontend_resource(pattern, route) for pattern in mapped_patterns)]

        assert unmapped == []

    def test_agent_run_and_status_use_permission_dependencies(self, app):
        routes = {route.path: route for route in app.routes if hasattr(route, "path") and route.path.startswith("/api/v1/agent")}

        run_dependencies = [dependency.call for dependency in routes["/api/v1/agent/run"].dependant.dependencies]
        status_dependencies = [dependency.call for dependency in routes["/api/v1/agent/status/{agent_id}"].dependant.dependencies]

        assert all(getattr(dependency, "__name__", "") != "require_service_or_user_role" for dependency in run_dependencies)
        assert all(getattr(dependency, "__name__", "") != "require_service_or_user_role" for dependency in status_dependencies)
        assert any(getattr(dependency, "__name__", "") == "_check_permission" for dependency in run_dependencies)
        assert any(getattr(dependency, "__name__", "") == "_check_permission" for dependency in status_dependencies)

    def test_default_prompt_and_provider_mappings_use_feature_permissions(self):
        from backend.scripts.init_permissions import PERMISSION_BACKEND_APIS

        assert "GET /api/v1/prompts" in PERMISSION_BACKEND_APIS["agent:read"]
        assert "POST /api/v1/prompts" in PERMISSION_BACKEND_APIS["agent:execute"]
        assert "GET /api/v1/prompts" not in PERMISSION_BACKEND_APIS["settings:manage"]
        assert "POST /api/v1/providers/detect-all" in PERMISSION_BACKEND_APIS["provider:update"]
        assert "POST /api/v1/providers/test/*" in PERMISSION_BACKEND_APIS["provider:update"]

    def test_learning_stats_uses_vulnerability_read_permission(self, app):
        from backend.scripts.init_permissions import PERMISSION_BACKEND_APIS

        route = next(route for route in app.routes if getattr(route, "path", "") == "/api/v1/scans/vulnerabilities/learning/stats")
        dependencies = [dependency.call for dependency in route.dependant.dependencies]

        assert "GET /api/v1/scans/vulnerabilities/learning/stats" in PERMISSION_BACKEND_APIS["vulnerability:read"]
        assert any(getattr(dependency, "__name__", "") == "_check_permission" for dependency in dependencies)

    def test_prompts_are_not_hard_coded_to_settings_manage(self):
        resource_guard = (PROJECT_ROOT / "backend" / "common" / "infra" / "resource_guard.py").read_text(encoding="utf-8")

        assert 'path.startswith("/api/v1/prompts")' not in resource_guard


class TestVulnLabEndpoints:
    """Test vulnerability lab endpoints."""

    @pytest.mark.asyncio
    async def test_vuln_types_endpoint(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/vuln-lab/types")
            assert response.status_code in (200, 401, 403), \
                f"Vuln lab types should respond, got {response.status_code}"
