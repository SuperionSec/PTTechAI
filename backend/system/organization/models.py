"""
Organization Management Models
Multi-tenant: Tenant (company) + Department (tree within a tenant).
"""
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.common.db.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TenantStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class Tenant(Base):
    """Tenant = a customer company. Top level of the organization hierarchy."""
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=TenantStatus.ACTIVE.value, nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    max_users: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_storage_gb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    departments: Mapped[List["Department"]] = relationship(
        "Department", back_populates="tenant", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "status": self.status,
            "logo_url": self.logo_url,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "max_users": self.max_users,
            "max_storage_gb": self.max_storage_gb,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Department(Base):
    """Department = a node in a tenant's org tree. Tenant-scoped."""
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "parent_id", name="uq_dept_name_per_parent"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("departments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="departments")
    parent: Mapped[Optional["Department"]] = relationship(
        "Department", remote_side=[id], back_populates="children"
    )
    children: Mapped[List["Department"]] = relationship(
        "Department", back_populates="parent", cascade="all, delete-orphan"
    )

    def to_dict(self, include_children: bool = False) -> dict:
        data = {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "parent_id": self.parent_id,
            "name": self.name,
            "sort_order": self.sort_order,
            "description": self.description,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_children and self.children:
            data["children"] = [
                c.to_dict(include_children=True)
                for c in sorted(self.children, key=lambda x: x.sort_order)
            ]
        return data
