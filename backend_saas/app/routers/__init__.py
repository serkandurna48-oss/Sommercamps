from .admin import router as admin_router
from .camps import router as camps_router
from .exports import router as exports_router
from .organizations import router as organizations_router
from .pilot_request import router as pilot_request_router
from .registrations import router as registrations_router
from .signup import router as signup_router
from .payments import router as payments_router

__all__ = [
    "admin_router",
    "camps_router",
    "exports_router",
    "organizations_router",
    "pilot_request_router",
    "registrations_router",
    "signup_router",
    "payments_router",
]
