from fastapi import APIRouter

from backend.api.v1 import api_keys, auth, rbac, users

router = APIRouter()
router.include_router(rbac.router)
router.include_router(users.router, prefix="/users")
router.include_router(auth.router, prefix="/profile")
router.include_router(api_keys.router, prefix="/api-keys")
