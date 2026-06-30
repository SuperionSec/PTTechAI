"""
PTTechAI v3 - Brand Rename Consistency Tests

Verifies that the NeuroSploit -> PTTechAI rename is complete and consistent
across all project files. No stale references should remain (except where
intentionally kept, like Docker image names, MCP server names, database
filenames, and vulnerability test markers/payloads).
"""
import os
import re
import json
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent

OLD_BRAND_LOWER = "neurosploit"
NEW_BRAND = "PTTechAI"
NEW_BRAND_LOWER = "pttechai"

SKIP_DIRECTORIES = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".idea", ".vscode", ".trae",
}

SKIP_EXTENSIONS = {
    ".db", ".db-shm", ".db-wal", ".pyc", ".pyo",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot",
    ".zip", ".tar", ".gz", ".rar", ".jsonl",
}

SKIP_PATH_PARTS = {
    "data\\reports", "data/reports",
    "reports\\report_", "reports/report_",
    "data\\reasoning_memory", "data/reasoning_memory",
    "tests\\test_brand_consistency", "tests/test_brand_consistency",
    "tests\\test_config_consistency", "tests/test_config_consistency",
    "tests\\test_frontend_verification", "tests/test_frontend_verification",
    "NeuroSploit-3.2.4", "NeuroSploit-3.3.0",
    "doc\\NEUROSPLOIT_MIGRATION_REPORT.md", "doc/NEUROSPLOIT_MIGRATION_REPORT.md",
    ".qoder", ".claude",
    "scripts\\check_migration.ps1", "scripts/check_migration.ps1",
    "改造计划.md",
}

INTENTIONAL_KEEP_FILES = {
    "tool_executor.py",
    "payload_generator.py",
    "ai_prompts.py",
    "container_pool.py",
    "kali_sandbox.py",
    "CLAUDE.md",  # Documents project structure, references neurosploit.py as filename
}

INTENTIONAL_KEEP_DIRS = {
    "vuln_engine\\testers",
    "vuln_engine/testers",
}

INTENTIONAL_KEEP_CONFIG_KEYS = {
    "neurosploit_tools",
    "neurosploit-tools",
}

INTENTIONAL_KEEP_DOCKER = {
    "neurosploit-kali",
    "neurosploit-backend",
    "neurosploit-frontend",
    "neurosploit-sandbox",
    "neurosploit-data",
    "neurosploit-network",
    "neurosploit-tools",
    "neurosploit.db",
    "neurosploit.type",
    "neurosploit.version",
}


def _should_skip_file(filepath: Path) -> bool:
    if filepath.suffix in SKIP_EXTENSIONS:
        return True
    filepath_str = str(filepath)
    for part in SKIP_PATH_PARTS:
        if part in filepath_str:
            return True
    for keep_dir in INTENTIONAL_KEEP_DIRS:
        if keep_dir in filepath_str:
            return True
    if filepath.name in INTENTIONAL_KEEP_FILES:
        return True
    return False


def _is_intentional_keep(line: str) -> bool:
    line_lower = line.lower()
    for keep in INTENTIONAL_KEEP_CONFIG_KEYS:
        if keep in line_lower:
            return True
    for keep in INTENTIONAL_KEEP_DOCKER:
        if keep in line_lower:
            return True
    if "bctechai" in line_lower or "bctech" in line_lower:
        return True
    return False


def _iter_project_files():
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRECTORIES]
        for f in files:
            filepath = Path(root) / f
            if _should_skip_file(filepath):
                continue
            yield filepath


def _find_stale_refs(file_filter, desc):
    stale_refs = []
    for filepath in _iter_project_files():
        if not file_filter(filepath):
            continue
        try:
            content = filepath.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for i, line in enumerate(content.splitlines(), 1):
            if OLD_BRAND_LOWER in line.lower() and not _is_intentional_keep(line):
                stale_refs.append((str(filepath.relative_to(PROJECT_ROOT)), i, line.strip()[:120]))
    return stale_refs


class TestBrandRenameConsistency:

    def test_no_stale_neurosploit_in_python_files(self):
        stale = _find_stale_refs(
            lambda f: f.suffix == ".py",
            "Python files"
        )
        assert len(stale) == 0, (
            f"Found {len(stale)} stale 'NeuroSploit' references in Python files:\n"
            + "\n".join(f"  {f}:{line} -> {text}" for f, line, text in stale[:20])
        )

    def test_no_stale_neurosploit_in_config_files(self):
        config_exts = {".json", ".yaml", ".yml", ".toml", ".cfg", ".ini", ".env", ".env.example"}
        stale = _find_stale_refs(
            lambda f: f.suffix in config_exts or f.name == ".env.example",
            "Config files"
        )
        assert len(stale) == 0, (
            f"Found {len(stale)} stale 'NeuroSploit' references in config files:\n"
            + "\n".join(f"  {f}:{line} -> {text}" for f, line, text in stale[:20])
        )

    def test_no_stale_neurosploit_in_markdown_files(self):
        stale = _find_stale_refs(
            lambda f: f.suffix == ".md",
            "Markdown files"
        )
        assert len(stale) == 0, (
            f"Found {len(stale)} stale 'NeuroSploit' references in Markdown files:\n"
            + "\n".join(f"  {f}:{line} -> {text}" for f, line, text in stale[:20])
        )

    def test_no_stale_neurosploit_in_frontend_files(self):
        frontend_exts = {".ts", ".tsx", ".js", ".jsx", ".css", ".html"}
        stale = _find_stale_refs(
            lambda f: f.suffix in frontend_exts,
            "Frontend files"
        )
        assert len(stale) == 0, (
            f"Found {len(stale)} stale 'NeuroSploit' references in frontend files:\n"
            + "\n".join(f"  {f}:{line} -> {text}" for f, line, text in stale[:20])
        )

    def test_no_stale_neurosploit_in_shell_scripts(self):
        script_exts = {".sh", ".ps1", ".bash"}
        stale = _find_stale_refs(
            lambda f: f.suffix in script_exts,
            "Script files"
        )
        assert len(stale) == 0, (
            f"Found {len(stale)} stale 'NeuroSploit' references in script files:\n"
            + "\n".join(f"  {f}:{line} -> {text}" for f, line, text in stale[:20])
        )

    def test_no_stale_neurosploit_in_dockerfiles(self):
        stale = _find_stale_refs(
            lambda f: ("Dockerfile" in f.name or f.suffix in (".yml", ".yaml"))
                      and "docker" in str(f).lower(),
            "Docker files"
        )
        assert len(stale) == 0, (
            f"Found {len(stale)} stale 'NeuroSploit' references in Docker files:\n"
            + "\n".join(f"  {f}:{line} -> {text}" for f, line, text in stale[:20])
        )

    def test_new_brand_present_in_key_files(self):
        key_files = [
            "backend/common/config.py",
            "pyproject.toml",
            "frontend/package.json",
            "README.md",
        ]
        missing = []
        for rel_path in key_files:
            filepath = PROJECT_ROOT / rel_path
            if not filepath.exists():
                missing.append(f"{rel_path} (file not found)")
                continue
            content = filepath.read_text(encoding="utf-8", errors="ignore")
            if NEW_BRAND not in content and NEW_BRAND_LOWER not in content.lower():
                missing.append(f"{rel_path} (brand not found)")
        assert len(missing) == 0, f"New brand 'PTTechAI' missing from key files: {missing}"

    def test_vuln_engine_markers_still_functional(self):
        from backend.pentest.backend.core.vuln_engine.testers.injection import XSSReflectedTester
        tester = XSSReflectedTester()
        assert tester is not None

    def test_payload_generator_still_functional(self):
        from backend.pentest.backend.core.vuln_engine.payload_generator import PayloadGenerator
        gen = PayloadGenerator()
        assert gen is not None
