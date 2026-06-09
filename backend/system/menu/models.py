"""
Menu Management Model
PTTechAI v3 - Dynamic menu system with tree structure
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List
import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer
from sqlalchemy.orm import relationship, Mapped, mapped_column

from backend.common.db.database import Base


class MenuType(str, Enum):
    """Menu type enum: directory (group), menu (page), button (action)"""
    DIRECTORY = "directory"
    MENU = "menu"
    BUTTON = "button"


class Menu(Base):
    """Menu definition table with tree structure"""
    __tablename__ = "menus"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    parent_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("menus.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="Menu display name")
    path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="Frontend route path")
    component: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="Frontend component path")
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, comment="Icon name")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="Sort order (ascending)")
    menu_type: Mapped[str] = mapped_column(
        String(20), default=MenuType.MENU.value, comment="directory/menu/button"
    )
    permission: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="Required permission (e.g., scan:read)")
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, comment="Show in menu")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="Menu is enabled")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    parent: Mapped[Optional["Menu"]] = relationship(
        "Menu",
        remote_side=[id],
        back_populates="children",
        lazy="select"
    )
    children: Mapped[List["Menu"]] = relationship(
        "Menu",
        back_populates="parent",
        cascade="all, delete-orphan",
        lazy="select"
    )

    def to_dict(self, include_children: bool = False) -> dict:
        """Convert to dictionary"""
        data = {
            "id": self.id,
            "parent_id": self.parent_id,
            "name": self.name,
            "path": self.path,
            "component": self.component,
            "icon": self.icon,
            "sort_order": self.sort_order,
            "menu_type": self.menu_type or MenuType.MENU.value,
            "permission": self.permission,
            "is_visible": self.is_visible,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_children and self.children:
            data["children"] = [
                child.to_dict(include_children=True)
                for child in sorted(self.children, key=lambda x: x.sort_order)
            ]
        return data

    def to_tree_dict(self) -> dict:
        """Convert to tree structure dictionary (with children)"""
        return self.to_dict(include_children=True)
