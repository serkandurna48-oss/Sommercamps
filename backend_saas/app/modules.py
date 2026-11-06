"""
Per-organization modules (organizations.modules, migration
20261106130000_organization_modules.sql).

`camps` is always on. `trainings`, `members` and `players` are premium
modules the platform owner switches per organization
(PATCH /admin/platform/organizations/{slug}/modules).

Gating is server-side:
- admin routes: `Depends(require_module("..."))` runs after
  require_org_access (auth first, so module state never leaks to a caller
  without access) and answers 403 {"code": "module_disabled"};
- public routes: `Depends(require_public_module("..."))` answers the same
  plain 404 as an unknown organization.
"""

from __future__ import annotations

from typing import Iterable, Literal

from fastapi import Depends, HTTPException, status

from .admin_resolve import require_organization
from .auth_deps import AuthContext, require_org_access
from .deps import get_tenant_context
from .tenancy import TenantContext

ModuleName = Literal["camps", "trainings", "members", "players"]
ALL_MODULES: tuple[str, ...] = ("camps", "trainings", "members", "players")
OPTIONAL_MODULES: tuple[str, ...] = ("trainings", "members", "players")


def normalize_modules(values: Iterable[str] | None) -> list[str]:
    """Known modules only, camps always first, stable order, no duplicates.
    A missing value (old row shape, test fixture) means camps only."""
    present = set(values or ())
    return [m for m in ALL_MODULES if m == "camps" or m in present]


def organization_modules(organization: dict) -> frozenset[str]:
    return frozenset(normalize_modules(organization.get("modules")))


def has_module(organization: dict, module: str) -> bool:
    return module in organization_modules(organization)


def module_disabled_error(module: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "module_disabled", "module": module},
    )


def require_module(module: ModuleName):
    """Admin dependency: org access first, then the module check."""

    def dependency(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> AuthContext:
        organization = require_organization(organization_slug)
        if not has_module(organization, module):
            raise module_disabled_error(module)
        return auth

    dependency.__name__ = f"require_module_{module}"
    return dependency


def require_public_module(module: ModuleName):
    """Public dependency: a disabled module looks exactly like an unknown organization."""

    def dependency(tenant: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if module not in tenant.modules:
            raise HTTPException(status_code=404, detail="Not found")
        return tenant

    dependency.__name__ = f"require_public_module_{module}"
    return dependency
