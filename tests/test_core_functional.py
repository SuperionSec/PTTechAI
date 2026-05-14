"""
PTTechAI v3 - Core Module Functional Tests

Tests that core modules function correctly after the brand rename.
Covers key classes, methods, and data structures.
"""
import sys
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


class TestVulnerabilityRegistry:
    """Test the vulnerability registry functionality."""

    def test_registry_instantiation(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        assert registry is not None

    def test_vuln_info_count(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        assert len(registry.VULNERABILITY_INFO) >= 90

    def test_key_vuln_types_present(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        key_types = [
            "xss_reflected", "xss_stored", "xss_dom",
            "sqli_error", "sqli_union", "sqli_blind",
            "ssrf", "csrf", "lfi", "rfi", "xxe",
            "idor", "bola", "bfla",
            "command_injection", "ssti",
        ]
        missing = [t for t in key_types if t not in registry.VULNERABILITY_INFO]
        assert len(missing) == 0, f"Missing key vuln types: {missing}"

    def test_vuln_info_has_required_fields(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        required_fields = {"title", "severity", "cwe_id"}
        for vuln_type, info in list(registry.VULNERABILITY_INFO.items())[:10]:
            missing = required_fields - set(info.keys())
            assert len(missing) == 0, f"Vuln type '{vuln_type}' missing fields: {missing}"

    def test_get_tester_for_type(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        tester = registry.get_tester("xss_reflected")
        assert tester is not None, "Should get tester for xss_reflected"

    def test_severity_values_valid(self):
        from backend.core.vuln_engine.registry import VulnerabilityRegistry
        registry = VulnerabilityRegistry()
        valid_severities = {"critical", "high", "medium", "low", "info", "varies"}
        for vuln_type, info in registry.VULNERABILITY_INFO.items():
            assert info["severity"] in valid_severities, \
                f"Vuln '{vuln_type}' has invalid severity: {info['severity']}"


class TestPayloadGenerator:
    """Test the payload generator."""

    def test_generator_instantiation(self):
        from backend.core.vuln_engine.payload_generator import PayloadGenerator
        gen = PayloadGenerator()
        assert gen is not None

    def test_has_payloads(self):
        from backend.core.vuln_engine.payload_generator import PayloadGenerator
        gen = PayloadGenerator()
        assert gen is not None
        assert callable(getattr(gen, "generate", None)) or callable(getattr(gen, "get_payloads", None)) or hasattr(gen, "PAYLOADS") or hasattr(gen, "payloads"), \
            "PayloadGenerator should have a payload method or attribute"


class TestAgentMemory:
    """Test agent memory module."""

    def test_memory_instantiation(self):
        from backend.core.agent_memory import AgentMemory
        memory = AgentMemory()
        assert memory is not None


class TestNegativeControl:
    """Test negative control engine."""

    def test_engine_instantiation(self):
        from backend.core.negative_control import NegativeControlEngine
        engine = NegativeControlEngine()
        assert engine is not None


class TestConfidenceScorer:
    """Test confidence scorer."""

    def test_scorer_instantiation(self):
        from backend.core.confidence_scorer import ConfidenceScorer
        scorer = ConfidenceScorer()
        assert scorer is not None


class TestValidationJudge:
    """Test validation judge."""

    def test_judge_import(self):
        from backend.core.validation_judge import ValidationJudge
        assert ValidationJudge is not None


class TestChainEngine:
    """Test chain engine."""

    def test_engine_instantiation(self):
        from backend.core.chain_engine import ChainEngine
        engine = ChainEngine()
        assert engine is not None


class TestWAFDetector:
    """Test WAF detector."""

    def test_detector_instantiation(self):
        from backend.core.waf_detector import WAFDetector
        detector = WAFDetector()
        assert detector is not None


class TestStrategyAdapter:
    """Test strategy adapter."""

    def test_adapter_instantiation(self):
        from backend.core.strategy_adapter import StrategyAdapter
        adapter = StrategyAdapter()
        assert adapter is not None


class TestRequestEngine:
    """Test request engine."""

    def test_engine_import(self):
        from backend.core.request_engine import RequestEngine
        assert RequestEngine is not None


class TestResponseVerifier:
    """Test response verifier."""

    def test_verifier_instantiation(self):
        from backend.core.response_verifier import ResponseVerifier
        verifier = ResponseVerifier()
        assert verifier is not None


class TestAuthManager:
    """Test auth manager."""

    def test_manager_instantiation(self):
        from backend.core.auth_manager import AuthManager
        manager = AuthManager()
        assert manager is not None


class TestProofOfExecution:
    """Test proof of execution module."""

    def test_module_import(self):
        from backend.core.proof_of_execution import ProofOfExecution
        poe = ProofOfExecution()
        assert poe is not None


class TestDatabaseModule:
    """Test database module."""

    def test_database_import(self):
        from backend.db.database import init_db, close_db
        assert callable(init_db)
        assert callable(close_db)


class TestLLMManager:
    """Test LLM manager module."""

    def test_llm_manager_import(self):
        from core.llm_manager import LLMManager
        assert LLMManager is not None

    def test_llm_manager_instantiation(self):
        from core.llm_manager import LLMManager
        config = {
            "llm": {
                "default_profile": "test",
                "profiles": {
                    "test": {
                        "provider": "gemini",
                        "model": "gemini-pro",
                        "api_key": "",
                        "temperature": 0.7,
                        "max_tokens": 4096,
                    }
                }
            }
        }
        manager = LLMManager(config)
        assert manager is not None
        assert manager.provider == "gemini"
