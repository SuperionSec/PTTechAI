"""
PTTechAI v3 - User and API Key Models
"""
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.db.database import Base
import uuid


class Role(str, Enum):
    """User role enum — kept for backward compatibility with require_role() and auth checks"""
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"
    SERVICE = "service"  # Service account for API-only access


class RoleModel(Base):
    """Persistent role table — replaces string-based role references over time"""
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Relationships
    users: Mapped[List["User"]] = relationship("User", back_populates="role_ref", foreign_keys="User.role_id")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "is_system": self.is_system,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class User(Base):
    """User model"""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="user")  # legacy string field — preserved
    role_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("roles.id"), nullable=True)  # new FK
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    role_ref: Mapped[Optional["RoleModel"]] = relationship("RoleModel", back_populates="users", foreign_keys=[role_id])
    api_keys: Mapped[List["APIKey"]] = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    tokens: Mapped[List["UserToken"]] = relationship("UserToken", back_populates="user", cascade="all, delete-orphan")
    scans: Mapped[List["Scan"]] = relationship("Scan", back_populates="user", cascade="all, delete-orphan")
    targets: Mapped[List["Target"]] = relationship("Target", back_populates="user", cascade="all, delete-orphan")
    prompts: Mapped[List["Prompt"]] = relationship("Prompt", back_populates="user", cascade="all, delete-orphan")
    endpoints: Mapped[List["Endpoint"]] = relationship("Endpoint", back_populates="user", cascade="all, delete-orphan")
    vulnerabilities: Mapped[List["Vulnerability"]] = relationship("Vulnerability", back_populates="user", cascade="all, delete-orphan")
    reports: Mapped[List["Report"]] = relationship("Report", back_populates="user", cascade="all, delete-orphan")
    agent_tasks: Mapped[List["AgentTask"]] = relationship("AgentTask", back_populates="user", cascade="all, delete-orphan")
    vuln_lab_challenges: Mapped[List["VulnLabChallenge"]] = relationship("VulnLabChallenge", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        """Convert to dictionary (without sensitive data)"""
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role.value if hasattr(self.role, 'value') else self.role,
            "role_id": self.role_id,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None
        }


class APIKey(Base):
    """API Key model for programmatic access"""
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    key_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    last_used: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="api_keys")

    def to_dict(self) -> dict:
        """Convert to dictionary (without key hash)"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used": self.last_used.isoformat() if self.last_used else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None
        }


class UserToken(Base):
    """User token model for session management and revocation"""
    __tablename__ = "user_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    token_jti: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    token_type: Mapped[str] = mapped_column(String(20), default="access")  # access or refresh
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    device_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    login_method: Mapped[str] = mapped_column(String(20), default="password")  # password, oauth, apikey

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="tokens")

    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "token_jti": self.token_jti,
            "token_type": self.token_type,
            "is_revoked": self.is_revoked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "device_info": self.device_info,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "login_method": self.login_method,
        }
