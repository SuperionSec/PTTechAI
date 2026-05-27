"""
PTTechAI v3 - Backend Module Import Tests

Verifies that all backend modules can be imported successfully
after the brand rename. This catches broken imports, missing references,
and syntax errors introduced during the rename.
"""
import sys
import importlib
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
CORE_DIR = BACKEND_DIR / "core"
API_DIR = BACKEND_DIR / "api"

sys.path.insert(0, str(PROJECT_ROOT))


class TestBackendConfigImport:
    """Test core configuration module."""

    def test_import_settings(self):
        from backend.config import settings
        assert settings is not None

    def test_app_name_is_pttechai(self):
        from backend.config import settings
        assert "PTTechAI" in settings.APP_NAME, f"APP_NAME should contain 'PTTechAI', got: {settings.APP_NAME}"

    def test_app_version_format(self):
        from backend.config import settings
        assert settings.APP_VERSION == "3.0.0", f"APP_VERSION should be '3.0.0', got: {settings.APP_VERSION}"

    def test_database_url_not_empty(self):
        from backend.config import settings
        assert settings.DATABASE_URL, "DATABASE_URL should not be empty"

    def test_jwt_config_present(self):
        from backend.config import settings
        assert settings.SECRET_KEY, "SECRET_KEY should be set"
        assert settings.ALGORITHM == "HS256"
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES > 0


class TestBackendModelsImport:
    """Test that all ORM models can be imported."""

    @pytest.mark.parametrize("module_name", [
        "backend.models.user",
        "backend.models.scan",
        "backend.models.target",
        "backend.models.vulnerability",
        "backend.models.report",
        "backend.models.prompt",
        "backend.models.permission",
        "backend.models.endpoint",
        "backend.models.agent_task",
        "backend.models.vuln_lab",
    ])
    def test_model_import(self, module_name):
        mod = importlib.import_module(module_name)
        assert mod is not None, f"Failed to import {module_name}"


class TestBackendSchemasImport:
    """Test that all Pydantic schemas can be imported."""

    @pytest.mark.parametrize("module_name", [
        "backend.schemas.auth",
        "backend.schemas.scan",
        "backend.schemas.target",
        "backend.schemas.vulnerability",
        "backend.schemas.report",
        "backend.schemas.prompt",
        "backend.schemas.agent_task",
        "backend.schemas.rbac",
    ])
    def test_schema_import(self, module_name):
        mod = importlib.import_module(module_name)
        assert mod is not None, f"Failed to import {module_name}"


class TestBackendCoreModulesImport:
    """Test that core backend modules can be imported."""

    @pytest.mark.parametrize("module_name", [
        "backend.core.agent_memory",
        "backend.core.auth_manager",
        "backend.core.chain_engine",
        "backend.core.confidence_scorer",
        "backend.core.negative_control",
        "backend.core.proof_of_execution",
        "backend.core.request_engine",
        "backend.core.response_verifier",
        "backend.core.strategy_adapter",
        "backend.core.validation_judge",
        "backend.core.waf_detector",
        "backend.core.access_control_learner",
        "backend.core.payload_mutator",
        "backend.core.xss_context_analyzer",
        "backend.core.xss_validator",
        "backend.core.banner_analyzer",
        "backend.core.site_analyzer",
        "backend.core.param_analyzer",
        "backend.core.endpoint_classifier",
        "backend.core.execution_history",
        "backend.core.notification_manager",
        "backend.core.checkpoint_manager",
        "backend.core.token_manager",
        "backend.core.methodology_loader",
        "backend.core.report_generator",
        "backend.core.exploit_generator",
        "backend.core.poc_generator",
        "backend.core.poc_validator",
        "backend.core.rbac.access_helpers",
        "backend.api.v1.routes",
        "backend.app_lifecycle",
        "backend.services.rbac_service",
    ])
    def test_core_module_import(self, module_name):
        mod = importlib.import_module(module_name)
        assert mod is not None, f"Failed to import {module_name}"

    def test_main_uses_lifecycle_module(self):
        main_content = (BACKEND_DIR / "main.py").read_text(encoding="utf-8")
        lifecycle_content = (BACKEND_DIR / "app_lifecycle.py").read_text(encoding="utf-8")
        assert "from backend.app_lifecycle import shutdown_app, startup_app" in main_content
        assert "await startup_app(app)" in main_content
        assert "await shutdown_app(app)" in main_content
        assert "def execute_scheduled_scan(" in lifecycle_content
        assert "set_scan_callback(execute_scheduled_scan)" in lifecycle_content

    def test_system_router_is_composition_layer_only(self):
        system_content = (BACKEND_DIR / "api" / "v1" / "system.py").read_text(encoding="utf-8")
        assert "include_router(rbac.router)" in system_content
        assert "include_router(users.router" in system_content
        assert "include_router(auth.router" in system_content
        assert "include_router(api_keys.router" in system_content
        assert "@router." not in system_content
        assert "async def " not in system_content


class TestVulnEngineImport:
    """Test that the vulnerability engine modules can be imported."""

    def test_vuln_registry_import(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        assert registry is not None

    def test_vuln_registry_has_entries(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        info = registry.VULNERABILITY_INFO
        assert len(info) >= 90, f"Expected >= 90 vuln types, got {len(info)}"

    def test_payload_generator_import(self):
        from backend.core.vuln_engine.payload_generator import PayloadGenerator
        gen = PayloadGenerator()
        assert gen is not None

    def test_system_prompts_import(self):
        from backend.core.vuln_engine.system_prompts import get_system_prompt, get_prompt_for_vuln_type
        assert callable(get_system_prompt)
        assert callable(get_prompt_for_vuln_type)

    def test_ai_prompts_import(self):
        from backend.core.vuln_engine.ai_prompts import get_verification_prompt, get_poc_prompt
        assert callable(get_verification_prompt)
        assert callable(get_poc_prompt)

    @pytest.mark.parametrize("tester_module", [
        "backend.core.vuln_engine.testers.injection",
        "backend.core.vuln_engine.testers.advanced_injection",
        "backend.core.vuln_engine.testers.file_access",
        "backend.core.vuln_engine.testers.request_forgery",
        "backend.core.vuln_engine.testers.auth",
        "backend.core.vuln_engine.testers.authorization",
        "backend.core.vuln_engine.testers.client_side",
        "backend.core.vuln_engine.testers.infrastructure",
        "backend.core.vuln_engine.testers.logic",
        "backend.core.vuln_engine.testers.data_exposure",
        "backend.core.vuln_engine.testers.cloud_supply",
    ])
    def test_tester_module_import(self, tester_module):
        mod = importlib.import_module(tester_module)
        assert mod is not None, f"Failed to import {tester_module}"


class TestRAGModulesImport:
    """Test RAG engine modules."""

    def test_rag_engine_import(self):
        from backend.core.rag.engine import RAGEngine
        assert RAGEngine is not None

    def test_rag_vectorstore_import(self):
        from backend.core.rag.vectorstore import BaseVectorStore, BM25VectorStore
        assert BaseVectorStore is not None
        assert BM25VectorStore is not None


class TestReportEngineImport:
    """Test report engine modules."""

    def test_report_generator_import(self):
        from backend.core.report_engine.generator import ReportGenerator
        assert ReportGenerator is not None


class TestSmartRouterImport:
    """Test smart router modules."""

    def test_provider_registry_import(self):
        from backend.core.smart_router.provider_registry import ProviderRegistry
        assert ProviderRegistry is not None

    def test_router_import(self):
        from backend.core.smart_router.router import SmartRouter
        assert SmartRouter is not None


class TestPromptEngineImport:
    """Test prompt engine modules."""

    def test_parser_import(self):
        from backend.core.prompt_engine.parser import PromptParser
        assert PromptParser is not None
