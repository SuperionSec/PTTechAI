"""
PTTechAI v3 - Configuration Consistency Tests

Verifies that configuration files are consistent after the brand rename,
including pyproject.toml, config.json, package.json, .env.example, etc.
"""
import json
import os
import re
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent


class TestPyprojectToml:
    """Test pyproject.toml consistency."""

    def test_project_name_is_pttechai(self):
        content = (PROJECT_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        assert 'name = "pttechai"' in content, "pyproject.toml project name should be 'pttechai'"

    def test_version_matches(self):
        content = (PROJECT_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        assert 'version = "3.0.0"' in content, "pyproject.toml version should be '3.0.0'"

    def test_no_stale_neurosploit(self):
        content = (PROJECT_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        assert "neurosploit" not in content.lower(), "pyproject.toml should not contain 'neurosploit'"

    def test_pytest_config_present(self):
        content = (PROJECT_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        assert "asyncio_mode" in content, "pytest asyncio_mode should be configured"
        assert "testpaths" in content, "pytest testpaths should be configured"


class TestBackendConfig:
    """Test backend/config.py consistency."""

    def test_app_name_contains_pttechai(self):
        content = (PROJECT_ROOT / "backend" / "config.py").read_text(encoding="utf-8")
        assert "PTTechAI" in content, "config.py APP_NAME should contain 'PTTechAI'"

    def test_version_3_0_0(self):
        content = (PROJECT_ROOT / "backend" / "config.py").read_text(encoding="utf-8")
        assert '"3.0.0"' in content or "'3.0.0'" in content, "config.py version should be '3.0.0'"

    def test_no_stale_brand_in_comments(self):
        content = (PROJECT_ROOT / "backend" / "config.py").read_text(encoding="utf-8")
        assert "NeuroSploit" not in content, "config.py should not contain 'NeuroSploit'"


class TestConfigJson:
    """Test config/config.json consistency."""

    def test_config_json_is_valid(self):
        config_path = PROJECT_ROOT / "config" / "config.json"
        with open(config_path, encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, dict), "config.json should be a valid JSON object"

    def test_llm_profiles_exist(self):
        config_path = PROJECT_ROOT / "config" / "config.json"
        with open(config_path, encoding="utf-8") as f:
            data = json.load(f)
        assert "llm" in data, "config.json should have 'llm' section"
        assert "profiles" in data["llm"], "config.json should have LLM profiles"
        assert len(data["llm"]["profiles"]) > 0, "Should have at least one LLM profile"

    def test_sandbox_config_exists(self):
        config_path = PROJECT_ROOT / "config" / "config.json"
        with open(config_path, encoding="utf-8") as f:
            data = json.load(f)
        assert "sandbox" in data, "config.json should have 'sandbox' section"

    def test_agent_roles_exist(self):
        config_path = PROJECT_ROOT / "config" / "config.json"
        with open(config_path, encoding="utf-8") as f:
            data = json.load(f)
        assert "agent_roles" in data, "config.json should have 'agent_roles' section"
        assert len(data["agent_roles"]) > 0, "Should have at least one agent role"


class TestPostgreSqlRuntimeConfig:
    """Test runtime database configuration stays on PostgreSQL."""

    def test_runtime_files_do_not_reintroduce_sqlite(self):
        checked_paths = [
            PROJECT_ROOT / "pyproject.toml",
            PROJECT_ROOT / "backend" / "requirements.txt",
            PROJECT_ROOT / "backend" / "config.py",
            PROJECT_ROOT / "backend" / "tests" / "conftest.py",
            PROJECT_ROOT / "config" / "config.json",
            PROJECT_ROOT / "core" / "scheduler.py",
            PROJECT_ROOT / "docker" / "Dockerfile.backend",
            PROJECT_ROOT / "docker" / "Dockerfile.backend.lite",
            PROJECT_ROOT / "tests" / "test_rbac_service.py",
        ]
        forbidden = ["sqlite" + "+aiosqlite", "sqlite" + ":///", "aiosqlite", "pttechai_scheduler" + ".db"]
        offenders = []
        for path in checked_paths:
            content = path.read_text(encoding="utf-8")
            for token in forbidden:
                if token in content:
                    offenders.append(f"{path.relative_to(PROJECT_ROOT)} contains {token}")
        assert offenders == []

    def test_no_local_sqlite_database_files(self):
        skipped_dirs = {".git", ".qoder", ".pytest_cache", "__pycache__", "node_modules", "dist", "build", ".venv", "venv"}
        suffixes = {".db", ".sqlite", ".sqlite3"}
        database_files = []
        for path in PROJECT_ROOT.rglob("*"):
            if any(part in skipped_dirs for part in path.parts):
                continue
            if path.is_file() and path.suffix.lower() in suffixes:
                database_files.append(str(path.relative_to(PROJECT_ROOT)))
        assert database_files == []


class TestRbacPolicyDefaults:
    """Test RBAC migration-safe policy defaults."""

    def test_unmapped_api_policy_defaults_to_allow(self):
        from backend.core.rbac.policies import UnmappedApiPolicy, get_unmapped_api_policy

        original = os.environ.pop("RBAC_UNMAPPED_API_POLICY", None)
        try:
            assert get_unmapped_api_policy() == UnmappedApiPolicy.ALLOW
        finally:
            if original is not None:
                os.environ["RBAC_UNMAPPED_API_POLICY"] = original

    def test_invalid_unmapped_api_policy_falls_back_to_allow(self):
        from backend.core.rbac.policies import UnmappedApiPolicy, get_unmapped_api_policy

        original = os.environ.get("RBAC_UNMAPPED_API_POLICY")
        os.environ["RBAC_UNMAPPED_API_POLICY"] = "invalid"
        try:
            assert get_unmapped_api_policy() == UnmappedApiPolicy.ALLOW
        finally:
            if original is None:
                os.environ.pop("RBAC_UNMAPPED_API_POLICY", None)
            else:
                os.environ["RBAC_UNMAPPED_API_POLICY"] = original

    def test_role_permission_reset_defaults_to_disabled(self):
        from backend.core.rbac.policies import should_reset_role_permissions_on_startup

        original = os.environ.pop("RBAC_RESET_ON_STARTUP", None)
        try:
            assert should_reset_role_permissions_on_startup() is False
        finally:
            if original is not None:
                os.environ["RBAC_RESET_ON_STARTUP"] = original


class TestAlembicConfig:
    """Test database migration configuration."""

    def test_alembic_ini_exists(self):
        assert (PROJECT_ROOT / "alembic.ini").exists(), "alembic.ini should exist"

    def test_alembic_uses_backend_migrations(self):
        content = (PROJECT_ROOT / "alembic.ini").read_text(encoding="utf-8")
        assert "script_location = backend/migrations" in content

    def test_initial_roles_migration_exists(self):
        migration_path = PROJECT_ROOT / "backend" / "migrations" / "versions" / "20260526_0001_add_roles_table_and_role_foreign_keys.py"
        assert migration_path.exists(), "Initial roles migration should exist"

    def test_initial_roles_migration_backfills_role_ids(self):
        migration_path = PROJECT_ROOT / "backend" / "migrations" / "versions" / "20260526_0001_add_roles_table_and_role_foreign_keys.py"
        content = migration_path.read_text(encoding="utf-8")
        assert "op.create_table(" in content
        assert '"roles"' in content
        assert "UPDATE users" in content
        assert "UPDATE role_permissions" in content

    def test_role_permission_role_length_migration_exists(self):
        migration_path = PROJECT_ROOT / "backend" / "migrations" / "versions" / "20260526_0002_widen_role_permission_role.py"
        content = migration_path.read_text(encoding="utf-8")
        assert migration_path.exists()
        assert '"role_permissions"' in content
        assert '"role"' in content
        assert "sa.String(length=50)" in content


class TestRbacFrontendRouteConsistency:
    """Test frontend routes stay aligned with RBAC frontend resources."""

    def _frontend_menu_paths(self):
        content = (PROJECT_ROOT / "frontend" / "src" / "routes" / "routeConfig.tsx").read_text(encoding="utf-8")
        paths = []
        for line in content.splitlines():
            match = re.search(r"path: '([^']+)'", line)
            if match and "hideInMenu: true" not in line and "public: true" not in line and match.group(1) != "*":
                paths.append(match.group(1))
        return paths

    def test_menu_routes_are_registered_in_rbac_service(self):
        rbac_service = (PROJECT_ROOT / "backend" / "services" / "rbac_service.py").read_text(encoding="utf-8")
        missing = [path for path in self._frontend_menu_paths() if f'("{path}",' not in rbac_service]
        assert missing == [], f"Menu routes missing from RBAC frontend route registry: {missing}"

    def test_menu_routes_have_seeded_frontend_resource_mappings(self):
        init_permissions = (PROJECT_ROOT / "backend" / "scripts" / "init_permissions.py").read_text(encoding="utf-8")
        missing = [path for path in self._frontend_menu_paths() if f'"{path}"' not in init_permissions]
        assert missing == [], f"Menu routes missing from seeded frontend resource mappings: {missing}"


class TestFrontendPackageJson:
    """Test frontend/package.json consistency."""

    def test_package_name_is_pttechai(self):
        pkg_path = PROJECT_ROOT / "frontend" / "package.json"
        with open(pkg_path, encoding="utf-8") as f:
            data = json.load(f)
        assert "pttechai" in data["name"].lower(), \
            f"package.json name should contain 'pttechai', got: {data['name']}"

    def test_version_3_0_0(self):
        pkg_path = PROJECT_ROOT / "frontend" / "package.json"
        with open(pkg_path, encoding="utf-8") as f:
            data = json.load(f)
        assert data["version"] == "3.0.0", f"package.json version should be '3.0.0', got: {data['version']}"

    def test_key_dependencies_present(self):
        pkg_path = PROJECT_ROOT / "frontend" / "package.json"
        with open(pkg_path, encoding="utf-8") as f:
            data = json.load(f)
        deps = data.get("dependencies", {})
        required = ["react", "react-dom", "react-router-dom", "axios", "zustand"]
        missing = [d for d in required if d not in deps]
        assert len(missing) == 0, f"Missing key dependencies: {missing}"


class TestEnvExample:
    """Test .env.example consistency."""

    def test_env_example_exists(self):
        assert (PROJECT_ROOT / ".env.example").exists(), ".env.example should exist"

    def test_no_stale_brand(self):
        content = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
        assert "NeuroSploit" not in content, ".env.example should not contain 'NeuroSploit'"

    def test_contains_pttechai(self):
        content = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
        assert "PTTechAI" in content or "BCTechAI" in content, \
            ".env.example should contain 'PTTechAI' or 'BCTechAI'"


class TestFrontendStoreConsistency:
    """Test frontend store uses PTTechAI branding."""

    def test_store_name_is_pttechai(self):
        store_path = PROJECT_ROOT / "frontend" / "src" / "store" / "index.ts"
        content = store_path.read_text(encoding="utf-8")
        assert "pttechai-scan-store" in content, "Zustand store name should use 'pttechai'"
        assert "pttechai-ui-store" in content, "UI store name should use 'pttechai'"

    def test_no_stale_store_names(self):
        store_path = PROJECT_ROOT / "frontend" / "src" / "store" / "index.ts"
        content = store_path.read_text(encoding="utf-8")
        assert "neurosploit" not in content.lower(), "Store should not reference 'neurosploit'"


class TestVersionConsistency:
    """Test version numbers are consistent across all config files."""

    def test_versions_match(self):
        expected_version = "3.0.0"

        pyproject = (PROJECT_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        assert f'version = "{expected_version}"' in pyproject

        pkg_json_path = PROJECT_ROOT / "frontend" / "package.json"
        with open(pkg_json_path, encoding="utf-8") as f:
            pkg = json.load(f)
        assert pkg["version"] == expected_version

        config_py = (PROJECT_ROOT / "backend" / "config.py").read_text(encoding="utf-8")
        assert expected_version in config_py
