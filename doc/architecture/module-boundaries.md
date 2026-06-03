# Module Boundaries

PTTechAI uses a modular monolith layout.

## Shared infrastructure

`backend/common/` contains shared concerns used by system, vulnerability library, and pentest modules:

- configuration
- database/session management
- authentication
- permission checks
- shared models such as users, roles, permissions, API keys, and tokens

## System settings

`backend/system/` owns operational management:

- users and profiles
- roles and permissions
- frontend/backend resource mappings
- menus
- audit logs
- system monitor
- API keys

## Vulnerability library

`backend/vulnerability_library/` is an independent knowledge module:

- vulnerability entries
- external identifier mappings
- POC/EXP artifacts
- category tree
- import/export

It is not part of `backend/pentest/` and does not reuse scan-result vulnerability tables.

## Pentest module

`backend/pentest/` contains pentest runtime capabilities. Avoid changing pentest internals when improving system settings or vulnerability library unless a shared authentication/RBAC compatibility point requires it.
