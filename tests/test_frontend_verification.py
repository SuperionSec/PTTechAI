"""
PTTechAI v3 - Frontend Build Verification Tests

Verifies that the frontend source code is consistent and buildable
after the brand rename.
"""
import json
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_SRC = FRONTEND_DIR / "src"


class TestFrontendStructure:
    """Test frontend directory structure."""

    def test_index_html_exists(self):
        assert (FRONTEND_DIR / "index.html").exists(), "index.html should exist"

    def test_main_tsx_exists(self):
        assert (FRONTEND_SRC / "main.tsx").exists(), "main.tsx should exist"

    def test_app_tsx_exists(self):
        assert (FRONTEND_SRC / "App.tsx").exists(), "App.tsx should exist"

    def test_vite_config_exists(self):
        assert (FRONTEND_DIR / "vite.config.ts").exists(), "vite.config.ts should exist"

    def test_tsconfig_exists(self):
        assert (FRONTEND_DIR / "tsconfig.json").exists(), "tsconfig.json should exist"

    def test_tailwind_config_exists(self):
        assert (FRONTEND_DIR / "tailwind.config.js").exists(), "tailwind.config.js should exist"


class TestFrontendPages:
    """Test that all page components exist."""

    EXPECTED_PAGES = [
        "HomePage.tsx",
        "LoginPage.tsx",
        "NewScanPage.tsx",
        "ScanDetailsPage.tsx",
        "AgentStatusPage.tsx",
        "ReportsPage.tsx",
        "SettingsPage.tsx",
        "SchedulerPage.tsx",
        "AutoPentestPage.tsx",
        "VulnLabPage.tsx",
        "TerminalAgentPage.tsx",
        "SandboxDashboardPage.tsx",
        "KnowledgePage.tsx",
        "MCPManagementPage.tsx",
        "ProvidersPage.tsx",
        "FullIATestingPage.tsx",
        "UserManagementPage.tsx",
        "UserProfilePage.tsx",
        "RoleManagementPage.tsx",
    ]

    @pytest.mark.parametrize("page_file", EXPECTED_PAGES)
    def test_page_exists(self, page_file):
        page_path = FRONTEND_SRC / "pages" / page_file
        assert page_path.exists(), f"Page component {page_file} should exist"


class TestFrontendServices:
    """Test frontend service layer."""

    def test_api_service_exists(self):
        assert (FRONTEND_SRC / "services" / "api.ts").exists(), "api.ts should exist"

    def test_websocket_service_exists(self):
        assert (FRONTEND_SRC / "services" / "websocket.ts").exists(), "websocket.ts should exist"


class TestFrontendI18n:
    """Test internationalization files."""

    def test_en_locale_exists(self):
        assert (FRONTEND_SRC / "locales" / "en-US.json").exists(), "en-US.json should exist"

    def test_zh_locale_exists(self):
        assert (FRONTEND_SRC / "locales" / "zh-CN.json").exists(), "zh-CN.json should exist"

    def test_locale_index_exists(self):
        assert (FRONTEND_SRC / "locales" / "index.ts").exists(), "locales/index.ts should exist"

    def test_en_locale_is_valid_json(self):
        with open(FRONTEND_SRC / "locales" / "en-US.json", encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, dict), "en-US.json should be a valid JSON object"
        assert len(data) > 0, "en-US.json should not be empty"

    def test_zh_locale_is_valid_json(self):
        with open(FRONTEND_SRC / "locales" / "zh-CN.json", encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, dict), "zh-CN.json should be a valid JSON object"
        assert len(data) > 0, "zh-CN.json should not be empty"


class TestFrontendNoStaleBrand:
    """Test that frontend files don't contain stale brand references."""

    def _check_ts_files(self, directory: Path):
        stale = []
        for ts_file in directory.rglob("*.tsx"):
            try:
                content = ts_file.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if "NeuroSploit" in content or "neurosploit" in content:
                if "neurosploit.db" not in content:
                    stale.append(str(ts_file.relative_to(PROJECT_ROOT)))
        for ts_file in directory.rglob("*.ts"):
            try:
                content = ts_file.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if "NeuroSploit" in content or "neurosploit" in content:
                if "neurosploit.db" not in content and "pttechai-" not in content:
                    stale.append(str(ts_file.relative_to(PROJECT_ROOT)))
        return stale

    def test_no_stale_brand_in_pages(self):
        stale = self._check_ts_files(FRONTEND_SRC / "pages")
        assert len(stale) == 0, f"Stale 'NeuroSploit' references in pages: {stale}"

    def test_no_stale_brand_in_components(self):
        stale = self._check_ts_files(FRONTEND_SRC / "components")
        assert len(stale) == 0, f"Stale 'NeuroSploit' references in components: {stale}"

    def test_no_stale_brand_in_services(self):
        stale = self._check_ts_files(FRONTEND_SRC / "services")
        assert len(stale) == 0, f"Stale 'NeuroSploit' references in services: {stale}"


class TestFrontendTypeDefinitions:
    """Test TypeScript type definitions."""

    def test_types_file_exists(self):
        assert (FRONTEND_SRC / "types" / "index.ts").exists(), "types/index.ts should exist"

    def test_types_not_empty(self):
        content = (FRONTEND_SRC / "types" / "index.ts").read_text(encoding="utf-8")
        assert len(content.strip()) > 0, "types/index.ts should not be empty"
        assert "interface" in content or "type" in content, "types/index.ts should define types"


class TestAppRoutes:
    """Test that App.tsx has all expected routes."""

    EXPECTED_ROUTES = [
        "/",
        "/login",
        "/auto",
        "/vuln-lab",
        "/terminal",
        "/scan/new",
        "/sandboxes",
        "/scheduler",
        "/reports",
        "/settings",
        "/users",
        "/profile",
        "/roles",
        "/knowledge",
        "/mcp",
        "/providers",
        "/full-ia",
    ]

    def test_all_routes_present(self):
        app_content = (FRONTEND_SRC / "App.tsx").read_text(encoding="utf-8")
        route_config = FRONTEND_SRC / "routes" / "routeConfig.tsx"
        content = app_content
        if route_config.exists():
            content += route_config.read_text(encoding="utf-8")
        missing = [r for r in self.EXPECTED_ROUTES if f"path: '{r}'" not in content and f'path: "{r}"' not in content and f'path="{r}"' not in content and f"path='{r}'" not in content]
        assert len(missing) == 0, f"Missing routes in App.tsx or routeConfig.tsx: {missing}"
