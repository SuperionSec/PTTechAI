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
        from backend.common.config import settings
        assert settings is not None

    def test_app_name_is_pttechai(self):
        from backend.common.config import settings
        assert "PTTechAI" in settings.APP_NAME, f"APP_NAME should contain 'PTTechAI', got: {settings.APP_NAME}"

    def test_app_version_format(self):
        from backend.common.config import settings
        assert settings.APP_VERSION == "3.0.0", f"APP_VERSION should be '3.0.0', got: {settings.APP_VERSION}"

    def test_database_url_not_empty(self):
        from backend.common.config import settings
        assert settings.DATABASE_URL, "DATABASE_URL should not be empty"

    def test_jwt_config_present(self):
        from backend.common.config import settings
        assert settings.SECRET_KEY, "SECRET_KEY should be set"
        assert settings.ALGORITHM == "HS256"
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES > 0


class TestBackendModelsImport:
    """Test that all ORM models can be imported."""

    @pytest.mark.parametrize("module_name", [
        "backend.common.models.user",
        "backend.pentest.backend.models.scan",
        "backend.pentest.backend.models.target",
        "backend.pentest.backend.models.vulnerability",
        "backend.pentest.backend.models.report",
        "backend.pentest.backend.models.prompt",
        "backend.common.models.permission",
        "backend.pentest.backend.models.endpoint",
        "backend.pentest.backend.models.agent_task",
        "backend.pentest.backend.models.vuln_lab",
    ])
    def test_model_import(self, module_name):
        mod = importlib.import_module(module_name)
        assert mod is not None, f"Failed to import {module_name}"


class TestBackendSchemasImport:
    """Test that all Pydantic schemas can be imported."""

    @pytest.mark.parametrize("module_name", [
        "backend.common.schemas.auth",
        "backend.pentest.backend.schemas.scan",
        "backend.pentest.backend.schemas.target",
        "backend.pentest.backend.schemas.vulnerability",
        "backend.pentest.backend.schemas.report",
        "backend.pentest.backend.schemas.prompt",
        "backend.pentest.backend.schemas.agent_task",
        "backend.common.schemas.rbac",
    ])
    def test_schema_import(self, module_name):
        mod = importlib.import_module(module_name)
        assert mod is not None, f"Failed to import {module_name}"


class TestBackendCoreModulesImport:
    """Test that core backend modules can be imported."""

    @pytest.mark.parametrize("module_name", [
        "backend.pentest.backend.core.agent_memory",
        "backend.pentest.backend.core.auth_manager",
        "backend.pentest.backend.core.chain_engine",
        "backend.pentest.backend.core.confidence_scorer",
        "backend.pentest.backend.core.negative_control",
        "backend.pentest.backend.core.proof_of_execution",
        "backend.pentest.backend.core.request_engine",
        "backend.pentest.backend.core.response_verifier",
        "backend.pentest.backend.core.strategy_adapter",
        "backend.pentest.backend.core.validation_judge",
        "backend.pentest.backend.core.waf_detector",
        "backend.pentest.backend.core.access_control_learner",
        "backend.pentest.backend.core.payload_mutator",
        "backend.pentest.backend.core.xss_context_analyzer",
        "backend.pentest.backend.core.xss_validator",
        "backend.pentest.backend.core.banner_analyzer",
        "backend.pentest.backend.core.site_analyzer",
        "backend.pentest.backend.core.param_analyzer",
        "backend.pentest.backend.core.endpoint_classifier",
        "backend.pentest.backend.core.execution_history",
        "backend.common.infra.notification_manager",
        "backend.pentest.backend.core.checkpoint_manager",
        "backend.common.infra.token_manager",
        "backend.pentest.backend.core.methodology_loader",
        "backend.pentest.backend.core.report_generator",
        "backend.pentest.backend.core.exploit_generator",
        "backend.pentest.backend.core.poc_generator",
        "backend.pentest.backend.core.poc_validator",
        "backend.common.infra.rbac.access_helpers",
        "backend.routes",
        "backend.app_lifecycle",
        "backend.pentest.backend.services.rbac_service",
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
        system_content = (BACKEND_DIR / "pentest" / "backend" / "api" / "v1" / "system.py").read_text(encoding="utf-8")
        assert "include_router(rbac.router)" in system_content
        assert "include_router(users.router" in system_content
        assert "include_router(auth.router" in system_content
        assert "include_router(api_keys.router" in system_content
        assert "@router." not in system_content
        assert "async def " not in system_content


class TestVulnEngineImport:
    """Test that the vulnerability engine modules can be imported."""

    def test_vuln_registry_import(self):
        from backend.pentest.backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        assert registry is not None

    def test_vuln_registry_has_entries(self):
        from backend.pentest.backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        info = registry.VULNERABILITY_INFO
        assert len(info) >= 90, f"Expected >= 90 vuln types, got {len(info)}"

    def test_payload_generator_import(self):
        from backend.pentest.backend.core.vuln_engine.payload_generator import PayloadGenerator
        gen = PayloadGenerator()
        assert gen is not None

    def test_system_prompts_import(self):
        from backend.pentest.backend.core.vuln_engine.system_prompts import get_system_prompt, get_prompt_for_vuln_type
        assert callable(get_system_prompt)
        assert callable(get_prompt_for_vuln_type)

    def test_ai_prompts_import(self):
        from backend.pentest.backend.core.vuln_engine.ai_prompts import get_verification_prompt, get_poc_prompt
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
        from backend.pentest.backend.core.rag.engine import RAGEngine
        assert RAGEngine is not None

    def test_rag_vectorstore_import(self):
        from backend.pentest.backend.core.rag.vectorstore import BaseVectorStore, BM25VectorStore
        assert BaseVectorStore is not None
        assert BM25VectorStore is not None


class TestReportEngineImport:
    """Test report engine modules."""

    def test_report_generator_import(self):
        from backend.pentest.backend.core.report_engine.generator import ReportGenerator
        assert ReportGenerator is not None


class TestSmartRouterImport:
    """Test smart router modules."""

    def test_provider_registry_import(self):
        from backend.pentest.backend.core.smart_router.provider_registry import ProviderRegistry
        assert ProviderRegistry is not None

    def test_router_import(self):
        from backend.pentest.backend.core.smart_router.router import SmartRouter
        assert SmartRouter is not None


class TestPromptEngineImport:
    """Test prompt engine modules."""

    def test_parser_import(self):
        from backend.pentest.backend.core.prompt_engine.parser import PromptParser
        assert PromptParser is not None
