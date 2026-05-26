"""
Permission Management Models
PTTechAI v0.1.0 - RBAC with User-Role-Permission three-level association
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List

from sqlalchemy import Column, String, DateTime, ForeignKey, Table, Enum as SQLEnum, Boolean, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column

from backend.db.database import Base
from backend.models.user import RoleModel


class PermissionScope(str, Enum):
    """Permission scopes for different modules"""
    SCAN = "scan"                # Scan management
    TARGET = "target"            # Target management
    REPORT = "report"            # Report management
    VULNERABILITY = "vulnerability"  # Vulnerability management
    DASHBOARD = "dashboard"      # Dashboard access
    SETTINGS = "settings"        # System settings
    USER = "user"                # User management
    API_KEY = "api_key"          # API key management
    PROVIDER = "provider"        # LLM provider management
    AGENT = "agent"              # AI agent management
    SCHEDULER = "scheduler"      # Scheduler management
    KNOWLEDGE = "knowledge"      # Knowledge base management


class PermissionAction(str, Enum):
    """Permission actions"""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    EXECUTE = "execute"          # For running scans, agents, etc.
    MANAGE = "manage"            # Full management (admin only)


class Permission(Base):
    """Permission definition table"""
    __tablename__ = "permissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    scope: Mapped[PermissionScope] = mapped_column(SQLEnum(PermissionScope), nullable=False)
    action: Mapped[PermissionAction] = mapped_column(SQLEnum(PermissionAction), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    role_permissions: Mapped[List["RolePermission"]] = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")
    resource_mappings: Mapped[List["ResourceMapping"]] = relationship("ResourceMapping", back_populates="permission", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "scope": self.scope.value,
            "action": self.action.value,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RolePermission(Base):
    """Role-Permission association table (many-to-many)"""
    __tablename__ = "role_permissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # legacy role name
    role_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("roles.id"), nullable=True)
    permission_id: Mapped[str] = mapped_column(String(36), ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    permission: Mapped["Permission"] = relationship("Permission", back_populates="role_permissions")
    role_ref: Mapped[Optional["RoleModel"]] = relationship("RoleModel")

    def to_dict(self):
        return {
            "id": self.id,
            "role": self.role,
            "role_id": self.role_id,
            "permission_id": self.permission_id,
            "permission": self.permission.to_dict() if self.permission else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ResourceMapping(Base):
    """Permission-Resource mapping table (Permission -> Frontend Page / Backend API)"""
    __tablename__ = "resource_mappings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    permission_id: Mapped[str] = mapped_column(String(36), ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'frontend_page' | 'backend_api'
    resource_path: Mapped[str] = mapped_column(String(255), nullable=False)  # '/scan/new' or 'POST /api/v1/scans'
    version: Mapped[int] = mapped_column(default=1)
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    permission: Mapped["Permission"] = relationship("Permission", back_populates="resource_mappings")

    def to_dict(self):
        return {
            "id": self.id,
            "permission_id": self.permission_id,
            "resource_type": self.resource_type,
            "resource_path": self.resource_path,
            "version": self.version,
            "updated_by": self.updated_by,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ResourceMappingHistory(Base):
    """Resource mapping change history table"""
    __tablename__ = "resource_mapping_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    permission_id: Mapped[str] = mapped_column(String(36), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'frontend_page' | 'backend_api'
    resource_path: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False)  # 'added' | 'removed' | 'modified'
    changed_by: Mapped[str] = mapped_column(String(36), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "permission_id": self.permission_id,
            "resource_type": self.resource_type,
            "resource_path": self.resource_path,
            "action": self.action,
            "changed_by": self.changed_by,
            "changed_at": self.changed_at.isoformat() if self.changed_at else None,
        }
