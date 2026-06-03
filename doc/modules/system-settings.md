# System Settings Module

System Settings includes operational administration features:

- User management
- Role and permission management
- Resource mapping and access coverage
- Menu management
- Audit logs
- System monitor
- API key management
- Profile and language settings

## Boundaries

The `/settings` page under the pentest group is a pentest runtime settings page and is not the same as System Settings.

## Backend modules

- `backend/system/users/api.py`
- `backend/system/rbac/rbac_api.py`
- `backend/system/rbac/service.py`
- `backend/system/menu/api.py`
- `backend/system/audit/api.py`
- `backend/system/monitor/api.py`
- `backend/system/api_keys/api.py`

## Frontend modules

- `frontend/src/pages/system/`
- `frontend/src/services/system/index.ts`
- `frontend/src/layouts/ProAppLayout.tsx`

## Verification

```bash
SECRET_KEY=test-secret-key-for-testing python -m pytest tests/test_rbac_service.py tests/test_api_endpoints.py tests/test_frontend_verification.py -q
npm --prefix frontend run build
```
