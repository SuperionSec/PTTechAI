"""
PTTechAI v3 - Menu API Tests

Unit tests for Menu model, schemas, and tree-building logic.
"""
import uuid
import pytest

# Import all models to ensure SQLAlchemy mappers are configured
import backend.pentest.backend.models
from backend.system.menu.models import Menu
from backend.system.menu.schemas import MenuCreate, MenuUpdate, MenuTreeNode


class TestMenuModel:
    """Test Menu model methods."""

    def test_menu_to_dict(self):
        menu = Menu(
            id="test-id",
            name="Test Menu",
            path="/test",
            icon="TestIcon",
            sort_order=5,
            permission="test:read",
            is_visible=True,
            is_active=True,
        )
        d = menu.to_dict()
        assert d["id"] == "test-id"
        assert d["name"] == "Test Menu"
        assert d["path"] == "/test"
        assert d["icon"] == "TestIcon"
        assert d["sort_order"] == 5
        assert d["permission"] == "test:read"
        assert d["is_visible"] is True
        assert d["is_active"] is True
        assert "children" not in d

    def test_menu_to_tree_dict_with_children(self):
        parent = Menu(id="parent", name="Parent", sort_order=1)
        child1 = Menu(id="child1", parent_id="parent", name="Child 1", sort_order=2)
        child2 = Menu(id="child2", parent_id="parent", name="Child 2", sort_order=1)
        parent.children = [child1, child2]

        d = parent.to_tree_dict()
        assert "children" in d
        assert len(d["children"]) == 2
        # Should be sorted by sort_order
        assert d["children"][0]["name"] == "Child 2"
        assert d["children"][1]["name"] == "Child 1"


class TestMenuSchemas:
    """Test Pydantic schemas."""

    def test_menu_create_valid(self):
        data = MenuCreate(
            name="Dashboard",
            path="/dashboard",
            icon="DashboardOutlined",
            sort_order=1,
        )
        assert data.name == "Dashboard"
        assert data.parent_id is None

    def test_menu_create_with_parent(self):
        data = MenuCreate(
            parent_id="parent-uuid",
            name="Sub Menu",
            path="/sub",
            sort_order=5,
            permission="sub:read",
        )
        assert data.parent_id == "parent-uuid"
        assert data.permission == "sub:read"

    def test_menu_update_partial(self):
        data = MenuUpdate(name="Updated Name", sort_order=10)
        dumped = data.model_dump(exclude_unset=True)
        assert "name" in dumped
        assert "sort_order" in dumped
        assert "path" not in dumped

    def test_menu_tree_node(self):
        node = MenuTreeNode(
            id="1",
            parent_id=None,
            name="Root",
            path="/",
            component=None,
            icon=None,
            sort_order=0,
            permission=None,
            is_visible=True,
            is_active=True,
            children=[],
        )
        assert node.id == "1"
        assert node.children == []


class TestMenuTreeBuilder:
    """Test the _build_tree helper function."""

    def test_build_empty_tree(self):
        from backend.system.menu.api import _build_tree
        result = _build_tree([])
        assert result == []

    def test_build_flat_tree(self):
        from backend.system.menu.api import _build_tree

        menus = [
            Menu(id="1", name="A", sort_order=2, is_visible=True, is_active=True),
            Menu(id="2", name="B", sort_order=1, is_visible=True, is_active=True),
        ]
        result = _build_tree(menus)
        assert len(result) == 2
        assert result[0].name == "B"  # sorted by sort_order
        assert result[1].name == "A"

    def test_build_nested_tree(self):
        from backend.system.menu.api import _build_tree

        menus = [
            Menu(id="root", name="Root", sort_order=0, is_visible=True, is_active=True),
            Menu(id="child1", parent_id="root", name="Child 1", sort_order=2, is_visible=True, is_active=True),
            Menu(id="child2", parent_id="root", name="Child 2", sort_order=1, is_visible=True, is_active=True),
            Menu(id="grandchild", parent_id="child1", name="Grandchild", sort_order=0, is_visible=True, is_active=True),
        ]
        result = _build_tree(menus)
        assert len(result) == 1
        root = result[0]
        assert root.name == "Root"
        assert len(root.children) == 2
        assert root.children[0].name == "Child 2"  # sorted
        assert root.children[1].name == "Child 1"
        assert len(root.children[1].children) == 1
        assert root.children[1].children[0].name == "Grandchild"

    def test_build_tree_with_permission_filter(self):
        from backend.system.menu.api import _build_tree

        menus = [
            Menu(id="1", name="Public", sort_order=0, permission=None, is_visible=True, is_active=True),
            Menu(id="2", name="Admin Only", sort_order=1, permission="admin:manage", is_visible=True, is_active=True),
            Menu(id="3", name="User Area", sort_order=2, permission="user:read", is_visible=True, is_active=True),
        ]
        # User has user:read but not admin:manage
        user_permissions = {"user:read"}
        result = _build_tree(menus, user_permissions=user_permissions)
        assert len(result) == 2
        names = {node.name for node in result}
        assert "Public" in names
        assert "User Area" in names
        assert "Admin Only" not in names
