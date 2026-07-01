"""
Organization Management Module
Multi-tenant: Tenant (company) + Department (tree within a tenant).
"""
from .models import Department, Tenant, TenantStatus
from .api import router

__all__ = ["Tenant", "Department", "TenantStatus", "router"]
