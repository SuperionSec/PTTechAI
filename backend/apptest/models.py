"""SQLAlchemy models for apptest module."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.common.db.database import Base


class AppTestTask(Base):
    """App security detection task record."""

    __tablename__ = "apptest_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    assets_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    document_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    terminal_type: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    terminal_type_name: Mapped[str] = mapped_column(String(32), default="Android")
    template_id: Mapped[Optional[str]] = mapped_column(String(64))
    template_name: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[Optional[int]] = mapped_column(Integer)
    file_name: Mapped[Optional[str]] = mapped_column(String(255))
    file_size: Mapped[Optional[str]] = mapped_column(String(32))
    md5: Mapped[Optional[str]] = mapped_column(String(64))
    package_name: Mapped[Optional[str]] = mapped_column(String(255))
    version: Mapped[Optional[str]] = mapped_column(String(64))
    vuln_high: Mapped[int] = mapped_column(Integer, default=0)
    vuln_mid: Mapped[int] = mapped_column(Integer, default=0)
    vuln_low: Mapped[int] = mapped_column(Integer, default=0)
    vuln_danger: Mapped[int] = mapped_column(Integer, default=0)
    report_path: Mapped[Optional[str]] = mapped_column(String(512))
    report_type: Mapped[Optional[str]] = mapped_column(String(16))
    callback_url: Mapped[Optional[str]] = mapped_column(String(512))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Relationship
    user = relationship("User", foreign_keys=[created_by], lazy="selectin")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "assets_id": self.assets_id,
            "document_id": self.document_id,
            "terminal_type": self.terminal_type,
            "terminal_type_name": self.terminal_type_name,
            "template_id": self.template_id,
            "template_name": self.template_name,
            "status": self.status,
            "progress": self.progress,
            "score": self.score,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "md5": self.md5,
            "package_name": self.package_name,
            "version": self.version,
            "vuln_high": self.vuln_high,
            "vuln_mid": self.vuln_mid,
            "vuln_low": self.vuln_low,
            "vuln_danger": self.vuln_danger,
            "report_path": self.report_path,
            "report_type": self.report_type,
            "error_message": self.error_message,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
