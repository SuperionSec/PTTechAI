from fastapi import APIRouter

from backend.system.auth import api as auth
from backend.system.users import api as users
from backend.system.rbac import rbac_api as rbac
from backend.system.api_keys import api as api_keys

router = APIRouter()
router.include_router(rbac.router)
router.include_router(users.router, prefix="/users")
router.include_router(auth.router, prefix="/profile")
router.include_router(api_keys.router, prefix="/api-keys")
