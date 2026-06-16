# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.





**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Project Structure (v3.0)

PTTechAI uses a three-layer backend architecture:

```
backend/
├── common/          # Shared infrastructure (config, db, auth, permissions)
│   ├── config.py    # App settings (moved from backend/config.py)
│   ├── db/          # Database connection
│   ├── models/      # Shared models (User, Permission)
│   ├── schemas/     # Shared schemas (auth, rbac)
│   └── infra/       # Auth, token manager, resource guard, RBAC policies
├── system/          # System management (users, roles, menus)
│   ├── auth/        # Authentication API
│   ├── users/       # User management API
│   ├── rbac/        # Role-based access control (permissions_api, rbac_api, service)
│   ├── api_keys/    # API key management
│   ├── system/      # System settings (composition layer)
│   └── menu/        # Dynamic menu management (Phase 3)
├── pentest/         # Penetration testing (two isolated domains)
│   ├── core/        # Domain A: root-level neurosploit code (15 .py files)
│   ├── tools/       # Domain A: pentest tools (22 files + 6 subdirs)
│   ├── agents/      # Domain A: AI agents (8 files)
│   ├── prompts/     # Domain A: agent prompts (124 files)
│   ├── data/        # Domain A: data files
│   ├── config/      # Domain A: config JSON
│   ├── custom_agents/
│   ├── models/      # Domain A: datasets
│   ├── reports/     # Domain A: benchmarks
│   ├── neurosploit.py
│   └── backend/     # Domain B: original backend pentest code
│       ├── core/    # ~85 .py files + 5 subdirs (vuln_engine, rag, etc.)
│       ├── api/v1/  # Pentest route handlers (17 files)
│       ├── api/websocket.py
│       ├── models/  # Pentest models (8 files)
│       ├── schemas/ # Pentest schemas (6 files)
│       ├── services/ # scan_service, report_service
│       ├── data/
│       └── prompts/
├── routes.py        # Top-level route registration
├── main.py          # FastAPI app entry point
└── app_lifecycle.py # Startup/shutdown hooks
```

### Key Architecture Rules

1. **Domain isolation**: `pentest/core/` (Domain A) and `pentest/backend/core/` (Domain B) are independent - no file merging, no renames
2. **Shared code in common/**: `system/` and `pentest/` share infrastructure via `common/`, never import each other directly
3. **Routes at top level**: `backend/routes.py` registers both SYSTEM_ROUTERS and PENTEST_ROUTERS
4. **Zero renames in pentest/**: All files in `pentest/` keep their original names to minimize migration risk

### Menu Management Module (Phase 3)

The dynamic menu system lives in `backend/system/menu/`:

- **Model**: `Menu` (self-referential tree with `parent_id`)
- **API endpoints**: `/api/v1/menus` (CRUD), `/api/v1/menus/tree`, `/api/v1/menus/user`
- **Permission integration**: Menus can require specific permissions; user menu tree filters by user's permissions
- **RBAC**: Admin endpoints require `settings:manage` permission

### Testing

Run tests with: `SECRET_KEY=test-secret-key-for-testing python -m pytest tests/ -q`

Current baseline: **320 tests** (309 existing + 10 menu unit tests + 1 markdown brand test)
