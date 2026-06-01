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

    def test_visible_system_menu_matches_rbac_admin_information_architecture(self):
        content = (FRONTEND_SRC / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        system_paths = []
        for line in content.splitlines():
            if "group: 'system'" in line and "hideInMenu: true" not in line:
                path = line.split("path: '")[1].split("'")[0]
                system_paths.append(path)
        assert system_paths == ["/users", "/roles", "/menus", "/audit", "/unmapped-resources", "/languages"]
        profile_line = next(line for line in content.splitlines() if "path: '/profile'" in line)
        api_keys_line = next(line for line in content.splitlines() if "path: '/api-keys'" in line)
        assert "hideInMenu: true" in profile_line
        assert "group: 'system'" not in profile_line
        assert "hideInMenu: true" in api_keys_line
        assert "group: 'system'" not in api_keys_line

    def test_key_pentest_routes_remain_in_pentest_group(self):
        content = (FRONTEND_SRC / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        for path in ["/", "/scheduler", "/knowledge", "/terminal", "/mcp", "/providers", "/settings"]:
            route_line = next(line for line in content.splitlines() if f"path: '{path}'" in line)
            assert "group: 'pentest'" in route_line

    def test_protected_routes_declare_access_metadata(self):
        content = (FRONTEND_SRC / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        assert "access?: 'canAccessPage'" in content
        for line in content.splitlines():
            if "path: '" in line and "public: true" not in line and "hideInMenu: true" not in line:
                assert "access: 'canAccessPage'" in line

    def test_route_guard_uses_declared_access_metadata(self):
        guard_content = (FRONTEND_SRC / "routes" / "routeGuards.tsx").read_text(encoding="utf-8")
        access_content = (FRONTEND_SRC / "routes" / "access.ts").read_text(encoding="utf-8")
        layout_content = (FRONTEND_SRC / "layouts" / "ProAppLayout.tsx").read_text(encoding="utf-8")
        assert "export function canAccessPage(" in access_content
        assert "export const canAccessPath = canAccessPage" in access_content
        assert "if (permission) return hasPermission(ctx, permission)" in access_content
        assert "if (permission && hasPermission(ctx, permission)) return true" not in access_content
        assert "route.access === 'canAccessPage'" in guard_content
        assert "canAccessPage({" in guard_content
        assert "role: userPermissions?.role || user.role" in guard_content
        assert "canAccessPage({" in layout_content
        assert "role: userPermissions?.role || user?.role" in layout_content

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
        profile_line = next(line for line in content.splitlines() if "path: '/profile'" in line)
        api_keys_line = next(line for line in content.splitlines() if "path: '/api-keys'" in line)
        assert "group: 'system'" in roles_line
        assert "hideInMenu: true" not in roles_line
        assert "hideInMenu: true" in profile_line
        assert "hideInMenu: true" in api_keys_line

    def test_pro_layout_exposes_profile_and_api_tokens_in_avatar_menu(self):
        content = (FRONTEND_SRC / "layouts" / "ProAppLayout.tsx").read_text(encoding="utf-8")
        assert "key: 'profile'" in content
        assert "key: 'api-keys'" in content
        assert "navigate('/profile')" in content
        assert "navigate('/api-keys')" in content
        assert "canAccessApiTokens" in content
        assert "hasPermission({" in content

    def test_system_pages_use_standard_pro_layout_cards(self):
        for page_file in self.SYSTEM_PAGES:
            content = (FRONTEND_SRC / "pages" / "system" / page_file).read_text(encoding="utf-8")
            assert "PageContainer" in content
            assert "ProCard" in content

    def test_role_management_uses_extracted_ui_helpers(self):
        content = (FRONTEND_SRC / "pages" / "system" / "RoleManagementPage.tsx").read_text(encoding="utf-8")
        assert "function PermissionSelector(" in content
        assert "function RoleStatisticCards(" in content
        assert "<PermissionSelector" in content
        assert "<RoleStatisticCards" in content
        assert "<Tree" in content
        assert "checkable" in content
        assert "treeData={Object.entries(groupedPermissions).map" in content
        assert "togglePermissions" in content
        assert "<Checkbox" not in content

    def test_role_management_uses_protable_request_mode(self):
        content = (FRONTEND_SRC / "pages" / "system" / "RoleManagementPage.tsx").read_text(encoding="utf-8")
        assert "useRef<ActionType>()" in content
        assert "actionRef={actionRef}" in content
        assert "request={async () => {" in content
        assert "return { data, success: true, total: data.length }" in content
        assert "actionRef.current?.reload()" in content
        assert "dataSource={roles}" not in content

    def test_role_management_supports_custom_role_metadata_editing(self):
        content = (FRONTEND_SRC / "pages" / "system" / "RoleManagementPage.tsx").read_text(encoding="utf-8")
        assert "display_name: string" in content
        assert "description?: string" in content
        assert "is_active: boolean" in content
        assert "roleMetadataForm(false)" in content
        assert "roleMetadataForm(true)" in content
        assert "systemApi.updateRole(editRole" in content
        assert "display_name: values.display_name" in content
        assert "description: values.description" in content
        assert "is_active: values.is_active" in content
        assert "valuePropName=\"checked\"" in content

    def test_role_management_does_not_hard_disable_preseeded_roles(self):
        content = (FRONTEND_SRC / "pages" / "system" / "RoleManagementPage.tsx").read_text(encoding="utf-8")
        assert "PROTECTED_SYSTEM_ROLES" not in content
        assert "SYSTEM_ROLES" not in content
        assert "isSystemRole" not in content
        assert "if (!editRole) return" in content
        assert "disabled={role.user_count > 0}" in content
        assert "disabled={isSystemRole" not in content
        assert "systemRoleEditDisabled" not in content

    def test_role_management_metadata_locale_keys_exist(self):
        with open(FRONTEND_SRC / "locales" / "en-US.json", encoding="utf-8") as f:
            en = json.load(f)
        with open(FRONTEND_SRC / "locales" / "zh-CN.json", encoding="utf-8") as f:
            zh = json.load(f)
        assert en["roleManagement"]["displayName"] == "Display Name"
        assert en["roleManagement"]["displayNameRequired"] == "Display name is required"
        assert en["roleManagement"]["activeRoles"] == "Active Roles"
        assert "systemRoleEditDisabled" not in en["roleManagement"]
        assert "systemRoleDeleteDisabled" not in en["roleManagement"]
        assert zh["roleManagement"]["displayName"] == "显示名称"
        assert zh["roleManagement"]["displayNameRequired"] == "显示名称为必填项"
        assert zh["roleManagement"]["activeRoles"] == "启用角色"
        assert "systemRoleEditDisabled" not in zh["roleManagement"]
        assert "systemRoleDeleteDisabled" not in zh["roleManagement"]

    def test_user_management_uses_extracted_statistic_cards(self):
        content = (FRONTEND_SRC / "pages" / "system" / "UserManagementPage.tsx").read_text(encoding="utf-8")
        assert "function UserStatisticCards(" in content
        assert "<UserStatisticCards" in content

    def test_user_management_uses_protable_request_mode(self):
        content = (FRONTEND_SRC / "pages" / "system" / "UserManagementPage.tsx").read_text(encoding="utf-8")
        assert "useRef<ActionType>()" in content
        assert "actionRef={actionRef}" in content
        assert "request={async () => {" in content
        assert "return { data: validData, success: true, total: validData.length }" in content
        assert "actionRef.current?.reload()" in content
        assert "dataSource={validUsers}" not in content

    def test_unmapped_resources_uses_extracted_statistic_cards(self):
        content = (FRONTEND_SRC / "pages" / "system" / "UnmappedResourcesPage.tsx").read_text(encoding="utf-8")
        assert "function UnmappedResourceStatisticCards(" in content
        assert "<UnmappedResourceStatisticCards" in content
        assert "accessCoverage.title" in content
        assert "accessCoverage.subtitle" in content
        assert "accessCoverage.mapPermission" in content
        assert "systemApi.unmappedResources()" in content

    def test_api_keys_uses_extracted_statistic_cards(self):
        content = (FRONTEND_SRC / "pages" / "system" / "APIKeysPage.tsx").read_text(encoding="utf-8")
        assert "function APIKeyStatisticCards(" in content
        assert "<APIKeyStatisticCards" in content
        en = json.loads((FRONTEND_SRC / "locales" / "en-US.json").read_text(encoding="utf-8"))
        zh = json.loads((FRONTEND_SRC / "locales" / "zh-CN.json").read_text(encoding="utf-8"))
        assert en["apiKeys"]["title"] == "My API Tokens"
        assert "current signed-in user" in en["apiKeys"]["subtitle"]
        assert zh["apiKeys"]["title"] == "我的 API Token"
        assert "当前登录用户" in zh["apiKeys"]["subtitle"]

    def test_user_profile_uses_extracted_statistic_cards(self):
        content = (FRONTEND_SRC / "pages" / "system" / "UserProfilePage.tsx").read_text(encoding="utf-8")
        assert "function ProfileStatisticCards(" in content
        assert "<ProfileStatisticCards" in content

    def test_languages_uses_extracted_statistic_cards(self):
        content = (FRONTEND_SRC / "pages" / "system" / "LanguagesPage.tsx").read_text(encoding="utf-8")
        assert "function LanguageStatisticCards(" in content
        assert "<LanguageStatisticCards" in content

    def test_access_coverage_locale_keys_exist(self):
        en = json.loads((FRONTEND_SRC / "locales" / "en-US.json").read_text(encoding="utf-8"))
        zh = json.loads((FRONTEND_SRC / "locales" / "zh-CN.json").read_text(encoding="utf-8"))
        assert en["accessCoverage"]["title"] == "Access Coverage"
        assert "permission" in en["accessCoverage"]["subtitle"]
        assert zh["accessCoverage"]["title"] == "访问覆盖"
        assert "权限映射" in zh["accessCoverage"]["subtitle"]

    def test_frontend_vite_api_proxy_does_not_capture_api_keys_route(self):
        content = (PROJECT_ROOT / "frontend" / "vite.config.ts").read_text(encoding="utf-8")
        assert "'^/api/'" in content
        assert "'/api':" not in content

    def test_frontend_nginx_api_proxy_does_not_capture_api_keys_route(self):
        content = (PROJECT_ROOT / "deploy" / "docker" / "nginx.conf").read_text(encoding="utf-8")
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

    def test_system_service_entrypoint_exports_system_boundaries(self):
        content = (FRONTEND_SRC / "services" / "system" / "index.ts").read_text(encoding="utf-8")
        assert "export { rbacApi } from '../rbac'" in content
        for api_name in ["systemApi", "usersApi", "profileApi", "apiKeysApi"]:
            assert f"export const {api_name}" in content
        for endpoint in ["/system/me", "/system/roles", "/system/permissions", "/system/resources", "/system/resources/unmapped", "/system/resources/mappings", "/system/users", "/system/profile/me", "/system/profile/change-password", "/system/api-keys"]:
            assert endpoint in content
        for type_name in ["Permission", "ResourceMapping", "RbacProfile", "RoleDetail", "RoleSummary", "UnmappedResource"]:
            assert type_name in content

    def test_system_pages_do_not_import_api_or_rbac_services_directly(self):
        for page_file in ["LanguagesPage.tsx", "UserManagementPage.tsx", "APIKeysPage.tsx", "UserProfilePage.tsx", "UnmappedResourcesPage.tsx", "RoleManagementPage.tsx"]:
            content = (FRONTEND_SRC / "pages" / "system" / page_file).read_text(encoding="utf-8")
            assert "../../services/api" not in content
            assert "../../services/rbac" not in content

    def test_rbac_management_pages_use_system_service_entrypoint(self):
        for page_file in ["UserManagementPage.tsx", "RoleManagementPage.tsx", "UnmappedResourcesPage.tsx"]:
            content = (FRONTEND_SRC / "pages" / "system" / page_file).read_text(encoding="utf-8")
            assert "../../services/system" in content

    def test_pentest_pages_do_not_import_system_service_entrypoint(self):
        for page_file in TestFrontendPages.PENTEST_PAGES:
            content = (FRONTEND_SRC / "pages" / page_file).read_text(encoding="utf-8")
            assert "../services/system" not in content
            assert "../../services/system" not in content

    def test_auth_refresh_uses_shared_single_flight_helper(self):
        helper_content = (FRONTEND_SRC / "services" / "authTokens.ts").read_text(encoding="utf-8")
        auth_content = (FRONTEND_SRC / "contexts" / "AuthContext.tsx").read_text(encoding="utf-8")
        api_content = (FRONTEND_SRC / "services" / "api.ts").read_text(encoding="utf-8")
        assert "let refreshPromise: Promise<string> | null = null" in helper_content
        assert "if (!refreshPromise)" in helper_content
        assert "finally(() =>" in helper_content
        # AuthContext no longer has global interceptors (v1 cleanup)
        # Interceptors live in api.ts which uses isAuthRefreshRequest
        assert "isAuthRefreshRequest" in api_content
        assert "!isAuthRefreshRequest(originalRequest.url)" in api_content
        assert "refreshAccessToken()" in api_content
        assert "refreshAccessToken()" in api_content
        assert "!isAuthRefreshRequest(originalRequest.url)" in api_content
        assert "axios.post(`${AUTH_URL}/refresh`" not in auth_content
        assert "axios.post('/api/v1/auth/refresh'" not in api_content

    def test_settings_page_uses_shared_api_client_for_authenticated_requests(self):
        content = (FRONTEND_SRC / "pages" / "SettingsPage.tsx").read_text(encoding="utf-8")
        assert "import api from '../services/api'" in content
        assert "localStorage.getItem('access_token')" not in content
        assert "tokenHeaders" not in content
        assert "fetch('/api/v1/settings" not in content
        assert "api.get<Settings>('/settings')" in content
        assert "api.put<Settings>('/settings', body)" in content
        assert "api.post('/settings/clear-database'" in content

    def test_auth_context_uses_system_profile_import(self):
        content = (FRONTEND_SRC / "contexts" / "AuthContext.tsx").read_text(encoding="utf-8")
        assert "../services/system" in content
        assert "systemApi.me()" in content
        assert "../services/rbac" not in content


class TestAutoPentestOptions:
    """Test Auto Pentest mode options."""

    def test_kali_sandbox_is_checkbox_not_test_mode(self):
        content = (FRONTEND_SRC / "pages" / "AutoPentestPage.tsx").read_text(encoding="utf-8")
        assert "value=\"auto_pentest\"" in content
        assert "value=\"cli_agent\"" in content
        assert "value=\"full_llm_pentest\"" in content
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
