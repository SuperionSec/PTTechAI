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

    PENTEST_PAGES = [
        "HomePage.tsx",
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
    ]

    SYSTEM_PAGES = [
        "LanguagesPage.tsx",
        "UserManagementPage.tsx",
        "UserProfilePage.tsx",
        "RoleManagementPage.tsx",
        "UnmappedResourcesPage.tsx",
        "APIKeysPage.tsx",
    ]

    @pytest.mark.parametrize("page_file", PENTEST_PAGES)
    def test_pentest_page_exists_in_pages_root(self, page_file):
        page_path = FRONTEND_SRC / "pages" / page_file
        assert page_path.exists(), f"Pentest page component {page_file} should exist in pages root"

    @pytest.mark.parametrize("page_file", SYSTEM_PAGES)
    def test_system_page_exists_in_system_directory(self, page_file):
        page_path = FRONTEND_SRC / "pages" / "system" / page_file
        assert page_path.exists(), f"System page component {page_file} should exist in pages/system"

    def test_route_config_imports_system_pages_from_system_module(self):
        content = (FRONTEND_SRC / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        assert "from '../pages/system'" in content
        for page in ["LanguagesPage", "UserManagementPage", "APIKeysPage", "UserProfilePage", "UnmappedResourcesPage", "RoleManagementPage"]:
            assert page in content
            assert f"../pages/system/{page}" not in content

    def test_system_pages_module_exports_all_system_pages(self):
        index_content = (FRONTEND_SRC / "pages" / "system" / "index.ts").read_text(encoding="utf-8")
        for page in ["LanguagesPage", "UserManagementPage", "APIKeysPage", "UserProfilePage", "UnmappedResourcesPage", "RoleManagementPage"]:
            assert f"as {page}" in index_content

    def test_visible_system_menu_is_limited_to_five_items(self):
        content = (FRONTEND_SRC / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        system_paths = []
        for line in content.splitlines():
            if "group: 'system'" in line and "hideInMenu: true" not in line:
                path = line.split("path: '")[1].split("'")[0]
                system_paths.append(path)
        assert system_paths == ["/languages", "/users", "/unmapped-resources", "/api-keys", "/profile"]
        roles_line = next(line for line in content.splitlines() if "path: '/roles'" in line)
        assert "hideInMenu: true" in roles_line
        assert "group: 'system'" not in roles_line

    def test_key_pentest_routes_remain_in_pentest_group(self):
        content = (FRONTEND_SRC / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        for path in ["/", "/scheduler", "/knowledge", "/terminal", "/mcp", "/providers", "/settings"]:
            route_line = next(line for line in content.splitlines() if f"path: '{path}'" in line)
            assert "group: 'pentest'" in route_line

    def test_pro_layout_builds_two_grouped_menus(self):
        content = (FRONTEND_SRC / "layouts" / "ProAppLayout.tsx").read_text(encoding="utf-8")
        assert "path: '/system-setting-group'" in content
        assert "path: '/penetration-testing-group'" in content
        assert "t('sidebar.systemSettings')" in content
        assert "t('sidebar.penetrationTesting')" in content
        assert "item.parentKeys?.length && item.icon" in content
        assert "item.children ? content" in content

    def test_menu_routes_exclude_hidden_and_public_routes(self):
        content = (FRONTEND_SRC / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        assert "export const menuRoutes = appRoutes.filter(route => !route.hideInMenu && !route.public)" in content
        roles_line = next(line for line in content.splitlines() if "path: '/roles'" in line)
        assert "hideInMenu: true" in roles_line

    def test_system_pages_use_standard_pro_layout_cards(self):
        for page_file in self.SYSTEM_PAGES:
            content = (FRONTEND_SRC / "pages" / "system" / page_file).read_text(encoding="utf-8")
            assert "PageContainer" in content
            assert "ProCard" in content

    def test_frontend_nginx_api_proxy_does_not_capture_api_keys_route(self):
        content = (PROJECT_ROOT / "docker" / "nginx.conf").read_text(encoding="utf-8")
        assert "location /api/" in content
        assert "location /api {" not in content


class TestFrontendServices:
    """Test frontend service layer."""

    def test_api_service_exists(self):
        assert (FRONTEND_SRC / "services" / "api.ts").exists(), "api.ts should exist"

    def test_websocket_service_exists(self):
        assert (FRONTEND_SRC / "services" / "websocket.ts").exists(), "websocket.ts should exist"

    def test_rbac_service_exists(self):
        assert (FRONTEND_SRC / "services" / "rbac.ts").exists(), "rbac.ts should exist"

    def test_rbac_service_has_role_apis(self):
        content = (FRONTEND_SRC / "services" / "rbac.ts").read_text(encoding="utf-8")
        assert "me: () => get<RbacProfile>('/rbac/me')" in content
        assert "menus?:" in content
        for method in ["roles", "role", "createRole", "updateRolePermissions", "deleteRole", "unmappedResources", "createResourceMapping"]:
            assert f"{method}:" in content, f"rbacApi should expose {method}"

    def test_system_service_entrypoint_exports_rbac_boundary(self):
        content = (FRONTEND_SRC / "services" / "system" / "index.ts").read_text(encoding="utf-8")
        assert "export { rbacApi } from '../rbac'" in content
        for type_name in ["Permission", "ResourceMapping", "RoleSummary", "UnmappedResource"]:
            assert type_name in content

    def test_system_pages_do_not_import_rbac_service_directly(self):
        for page_file in ["LanguagesPage.tsx", "UserManagementPage.tsx", "APIKeysPage.tsx", "UserProfilePage.tsx", "UnmappedResourcesPage.tsx", "RoleManagementPage.tsx"]:
            content = (FRONTEND_SRC / "pages" / "system" / page_file).read_text(encoding="utf-8")
            assert "../../services/rbac" not in content

    def test_rbac_management_pages_use_system_service_entrypoint(self):
        for page_file in ["UserManagementPage.tsx", "RoleManagementPage.tsx", "UnmappedResourcesPage.tsx"]:
            content = (FRONTEND_SRC / "pages" / "system" / page_file).read_text(encoding="utf-8")
            assert "../../services/system" in content

    def test_auth_context_keeps_rbac_profile_import(self):
        content = (FRONTEND_SRC / "contexts" / "AuthContext.tsx").read_text(encoding="utf-8")
        assert "../services/rbac" in content


class TestAutoPentestOptions:
    """Test Auto Pentest mode options."""

    def test_kali_sandbox_is_checkbox_not_test_mode(self):
        content = (FRONTEND_SRC / "pages" / "AutoPentestPage.tsx").read_text(encoding="utf-8")
        assert "kali_researcher" not in content
        assert "isKaliResearcherMode" not in content
        assert "enable_kali_sandbox" in content
        assert "t('autoPentest.kaliSandbox')" in content

    def test_kali_researcher_i18n_keys_exist(self):
        with open(FRONTEND_SRC / "locales" / "en-US.json", encoding="utf-8") as f:
            en = json.load(f)
        with open(FRONTEND_SRC / "locales" / "zh-CN.json", encoding="utf-8") as f:
            zh = json.load(f)
        assert en["autoPentest"]["kaliResearcher"] == "Kali Sandbox + AI Researcher"
        assert zh["autoPentest"]["kaliResearcher"] == "Kali 沙箱 + AI 研究员"

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

    def test_sidebar_group_locale_keys_exist(self):
        with open(FRONTEND_SRC / "locales" / "en-US.json", encoding="utf-8") as f:
            en = json.load(f)
        with open(FRONTEND_SRC / "locales" / "zh-CN.json", encoding="utf-8") as f:
            zh = json.load(f)
        assert en["sidebar"]["systemSettings"] == "System Settings"
        assert en["sidebar"]["penetrationTesting"] == "Penetration Testing"
        assert zh["sidebar"]["systemSettings"] == "系统设置"
        assert zh["sidebar"]["penetrationTesting"] == "渗透测试"


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
        "/languages",
        "/users",
        "/profile",
        "/roles",
        "/unmapped-resources",
        "/api-keys",
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
