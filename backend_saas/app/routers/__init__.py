from .admin import router as admin_router
from .camps import router as camps_router
from .organizations import router as organizations_router
from .registrations import router as registrations_router

__all__ = ["admin_router", "camps_router", "organizations_router", "registrations_router"]
