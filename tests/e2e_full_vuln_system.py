#!/usr/bin/env python3
"""
PTTechAI E2E Test: Vulnerability Library + System Settings
Full API-level E2E test covering all sub-pages of both modules.

Usage:
    python tests/e2e_full_vuln_system.py
    python tests/e2e_full_vuln_system.py --base-url http://192.168.1.100:8000
"""

import argparse
import random
import sys
import time
from datetime import datetime, timezone

import requests

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "admin@bctech.ai"
ADMIN_PASSWORD = "admin123"
VIEWER_EMAIL = "test_e2e_viewer@example.com"
USER_EMAIL = "test_e2e_user@example.com"
TEST_PASSWORD = "TestPass123!"
RAND = random.randint(1000, 9999)

# ──────────────────────────────────────────────
# Test infrastructure
# ──────────────────────────────────────────────
results: list[dict] = []
cleanup_actions: list[tuple[str, callable]] = []


def header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test(test_id: str, name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    symbol = "+" if passed else "X"
    color = "\033[92m" if passed else "\033[91m"
    reset = "\033[0m"
    print(f"  {color}[{symbol}]{reset} [{test_id}] {name}" + (f" -- {detail}" if detail else ""))
    results.append({"id": test_id, "name": name, "status": status, "detail": detail})
    return passed


def api(method: str, path: str, token: str | None = None, json_body: dict | None = None, params: dict | None = None):
    """Make API request, return (status_code, response_json_or_text)."""
    url = f"{BASE_URL}{path}"
    headers = header(token) if token else {"Content-Type": "application/json"}
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, params=params, timeout=30)
        elif method == "POST":
            r = requests.post(url, headers=headers, json=json_body, params=params, timeout=30)
        elif method == "PUT":
            r = requests.put(url, headers=headers, json=json_body, params=params, timeout=30)
        elif method == "DELETE":
            r = requests.delete(url, headers=headers, params=params, timeout=30)
        else:
            return 0, {}
        try:
            data = r.json() if r.content else {}
        except Exception:
            data = {"_text": r.text}
        return r.status_code, data
    except Exception as e:
        return 0, {"_error": str(e)}


def add_cleanup(desc: str, action: callable):
    cleanup_actions.append((desc, action))


def run_cleanup(admin_token: str):
    print("\n--- Cleanup ---")
    for desc, action in reversed(cleanup_actions):
        try:
            action(admin_token)
            print(f"  [ok] {desc}")
        except Exception as e:
            print(f"  [!!] {desc}: {e}")


# ──────────────────────────────────────────────
# Auth Setup
# ──────────────────────────────────────────────
def setup_auth():
    print("\n=== Auth Setup ===")
    # Admin login
    code, data = api("POST", "/api/v1/system/profile/login", json_body={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
    })
    if code != 200 or "access_token" not in data:
        print(f"FATAL: Admin login failed (code={code})")
        sys.exit(1)
    admin_token = data["access_token"]
    print(f"  [+] Admin login OK")

    # Create viewer user (ignore if exists)
    api("POST", "/api/v1/system/users", token=admin_token, json_body={
        "email": VIEWER_EMAIL, "password": TEST_PASSWORD, "full_name": "E2E Viewer", "role": "viewer"
    })
    code, vdata = api("POST", "/api/v1/system/profile/login", json_body={
        "email": VIEWER_EMAIL, "password": TEST_PASSWORD
    })
    viewer_token = vdata.get("access_token") if code == 200 else None
    print(f"  [{'+' if viewer_token else 'X'}] Viewer login: {'OK' if viewer_token else 'FAILED'}")

    # Create user role user (ignore if exists)
    api("POST", "/api/v1/system/users", token=admin_token, json_body={
        "email": USER_EMAIL, "password": TEST_PASSWORD, "full_name": "E2E User", "role": "user"
    })
    code, udata = api("POST", "/api/v1/system/profile/login", json_body={
        "email": USER_EMAIL, "password": TEST_PASSWORD
    })
    user_token = udata.get("access_token") if code == 200 else None
    print(f"  [{'+' if user_token else 'X'}] User login: {'OK' if user_token else 'FAILED'}")

    return admin_token, viewer_token, user_token


# ══════════════════════════════════════════════
# VULNERABILITY LIBRARY MODULE
# ══════════════════════════════════════════════

def test_vuln_overview(admin_token, viewer_token):
    print("\n=== VulnLib: Overview (Stats) ===")
    code, data = api("GET", "/api/v1/vulnerability-library/stats", token=admin_token)
    test("VLIB-OV-01", "Get stats", code == 200 and "total" in data,
         f"total={data.get('total')}" if code == 200 else f"code={code}")

    code2, _ = api("GET", "/api/v1/vulnerability-library/stats")
    test("VLIB-OV-02", "No token => 401", code2 in (401, 403), f"code={code2}")


def test_vuln_entries(admin_token):
    print("\n=== VulnLib: Entries ===")
    # List
    code, data = api("GET", "/api/v1/vulnerability-library/entries", token=admin_token)
    test("VLIB-E01", "List entries (default)", code == 200 and "items" in data and "total" in data,
         f"total={data.get('total')}")

    # Create
    entry_title = f"E2E Test Vuln {RAND}"
    code, data = api("POST", "/api/v1/vulnerability-library/entries", token=admin_token, json_body={
        "title": entry_title,
        "description": "E2E test vulnerability description",
        "severity": "high",
        "status": "draft",
        "vendor": "E2E-Vendor",
        "product": "E2E-Product",
        "vuln_type": "injection",
        "cwe_id": "CWE-79",
    })
    created = code == 201 and "id" in data
    test("VLIB-E05", "Create entry", created,
         f"vuln_code={data.get('vuln_code')}" if created else f"code={code} data={data}")
    entry_id = data.get("id")

    if entry_id:
        add_cleanup(f"Delete entry {entry_id}", lambda t, eid=entry_id: api("DELETE", f"/api/v1/vulnerability-library/entries/{eid}", token=t))

        # Verify vuln_code format
        test("VLIB-E05a", "vuln_code format PTVULN-YYYY-NNNNNN",
             data.get("vuln_code", "").startswith("PTVULN-"), f"code={data.get('vuln_code')}")

        # Get detail
        code, detail = api("GET", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token)
        test("VLIB-E07", "Get entry detail", code == 200 and detail.get("title") == entry_title,
             f"title={detail.get('title')}")

        # Update
        code, upd = api("PUT", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token, json_body={
            "severity": "critical", "title": f"{entry_title} Updated"
        })
        test("VLIB-E08", "Update entry", code == 200 and upd.get("severity") == "critical",
             f"severity={upd.get('severity')}")

        # Filter by severity
        code, filt = api("GET", "/api/v1/vulnerability-library/entries", token=admin_token,
                         params={"severity": "critical", "q": f"E2E Test Vuln {RAND}"})
        test("VLIB-E02", "Filter by severity=critical", code == 200,
             f"found={filt.get('total', 0)}")

        # Filter by q
        code, filt2 = api("GET", "/api/v1/vulnerability-library/entries", token=admin_token,
                          params={"q": f"E2E Test Vuln {RAND}"})
        test("VLIB-E03", "Filter by keyword search", code == 200 and filt2.get("total", 0) >= 1,
             f"found={filt2.get('total', 0)}")

        # Export JSON
        code, exp_json = api("GET", "/api/v1/vulnerability-library/entries/export", token=admin_token,
                             params={"format": "json"})
        test("VLIB-E09", "Export entries JSON", code == 200, f"code={code}")

        # Export CSV
        code, exp_csv = api("GET", "/api/v1/vulnerability-library/entries/export", token=admin_token,
                            params={"format": "csv"})
        test("VLIB-E10", "Export entries CSV", code == 200 and "vuln_code" in str(exp_csv),
             f"code={code}")

        # Import
        code, imp = api("POST", "/api/v1/vulnerability-library/entries/import", token=admin_token, json_body={
            "entries": [{"title": f"E2E Import {RAND}", "description": "imported", "severity": "low"}]
        })
        test("VLIB-E11", "Import entries", code == 200 and imp.get("created", 0) >= 1,
             f"created={imp.get('created')}")
        if imp.get("created") and code == 200:
            # Cleanup imported
            code_l, list_imp = api("GET", "/api/v1/vulnerability-library/entries", token=admin_token,
                                   params={"q": f"E2E Import {RAND}"})
            if code_l == 200:
                for item in list_imp.get("items", []):
                    add_cleanup(f"Delete imported entry {item['id']}",
                                lambda t, iid=item["id"]: api("DELETE", f"/api/v1/vulnerability-library/entries/{iid}", token=t))

    # Missing required field
    code, err = api("POST", "/api/v1/vulnerability-library/entries", token=admin_token, json_body={
        "description": "no title"
    })
    test("VLIB-E06", "Create without title => 422", code == 422, f"code={code}")

    # Filter has_poc
    code, hp = api("GET", "/api/v1/vulnerability-library/entries", token=admin_token, params={"has_poc": True})
    test("VLIB-E04", "Filter has_poc=True", code == 200, f"found={hp.get('total', 0)}")

    return entry_id


def test_vuln_identifiers(admin_token, entry_id):
    print("\n=== VulnLib: Identifiers ===")
    # List
    code, data = api("GET", "/api/v1/vulnerability-library/identifiers", token=admin_token)
    test("VLIB-I01", "List identifiers", code == 200 and "items" in data, f"total={data.get('total')}")

    if not entry_id:
        test("VLIB-I02", "Create identifier", False, "No entry_id")
        return None

    # Create
    code, data = api("POST", f"/api/v1/vulnerability-library/entries/{entry_id}/identifiers", token=admin_token, json_body={
        "source": "cve", "identifier": f"CVE-2099-{RAND}", "is_primary": True,
        "url": f"https://nvd.nist.gov/vuln/detail/CVE-2099-{RAND}"
    })
    created = code == 201 and "id" in data
    test("VLIB-I02", "Create identifier (cve)", created, f"id={data.get('id')}" if created else f"code={code}")
    id_id = data.get("id")

    if id_id:
        # Update
        code, upd = api("PUT", f"/api/v1/vulnerability-library/identifiers/{id_id}", token=admin_token, json_body={
            "url": "https://updated-url.example.com"
        })
        test("VLIB-I03", "Update identifier", code == 200, f"code={code}")

        # Filter by source
        code, filt = api("GET", "/api/v1/vulnerability-library/identifiers", token=admin_token,
                         params={"source": "cve", "entry_id": entry_id})
        test("VLIB-I04", "Filter identifiers source=cve", code == 200 and filt.get("total", 0) >= 1,
             f"found={filt.get('total', 0)}")

        # Delete
        code, _ = api("DELETE", f"/api/v1/vulnerability-library/identifiers/{id_id}", token=admin_token)
        test("VLIB-I05", "Delete identifier", code == 204, f"code={code}")


def test_vuln_artifacts(admin_token, entry_id):
    print("\n=== VulnLib: Artifacts ===")
    # List
    code, data = api("GET", "/api/v1/vulnerability-library/artifacts", token=admin_token)
    test("VLIB-A01", "List artifacts", code == 200 and "items" in data, f"total={data.get('total')}")

    if not entry_id:
        test("VLIB-A02", "Create POC", False, "No entry_id")
        return None, None

    # Create POC
    code, poc = api("POST", f"/api/v1/vulnerability-library/entries/{entry_id}/artifacts", token=admin_token, json_body={
        "artifact_type": "poc", "title": f"E2E POC {RAND}", "content": "# POC code\nimport requests",
        "platform": "web_app", "payload_type": "http"
    })
    poc_created = code == 201 and "id" in poc
    test("VLIB-A02", "Create POC artifact", poc_created,
         f"code={poc.get('artifact_code')}" if poc_created else f"code={code} data={poc}")
    poc_id = poc.get("id")

    # Create EXP
    code, exp = api("POST", f"/api/v1/vulnerability-library/entries/{entry_id}/artifacts", token=admin_token, json_body={
        "artifact_type": "exp", "title": f"E2E EXP {RAND}", "content": "# Exploit code",
    })
    exp_created = code == 201 and "id" in exp
    test("VLIB-A03", "Create EXP artifact", exp_created,
         f"code={exp.get('artifact_code')}" if exp_created else f"code={code}")
    exp_id = exp.get("id")

    # Get POC detail (content visible)
    if poc_id:
        code, det = api("GET", f"/api/v1/vulnerability-library/artifacts/{poc_id}", token=admin_token)
        test("VLIB-A04", "Get POC detail (content visible)", code == 200 and det.get("content") is not None,
             f"has_content={det.get('content') is not None}")

    # Get EXP detail (admin has read_exp)
    if exp_id:
        code, det = api("GET", f"/api/v1/vulnerability-library/artifacts/{exp_id}", token=admin_token)
        test("VLIB-A05", "Get EXP detail (admin, content visible)", code == 200 and det.get("content") is not None,
             f"has_content={det.get('content') is not None}")

        # Update
        code, upd = api("PUT", f"/api/v1/vulnerability-library/artifacts/{poc_id}", token=admin_token, json_body={
            "title": f"E2E POC Updated {RAND}", "verified": True
        })
        test("VLIB-A06", "Update artifact", code == 200 and upd.get("verified") is True,
             f"verified={upd.get('verified')}")

        # Filter by type
        code, filt = api("GET", "/api/v1/vulnerability-library/artifacts", token=admin_token,
                         params={"artifact_type": "poc", "entry_id": entry_id})
        test("VLIB-A07", "Filter artifacts type=poc", code == 200 and filt.get("total", 0) >= 1,
             f"found={filt.get('total', 0)}")

        # Delete artifacts
        code, _ = api("DELETE", f"/api/v1/vulnerability-library/artifacts/{poc_id}", token=admin_token)
        test("VLIB-A08", "Delete POC artifact", code == 204, f"code={code}")
        api("DELETE", f"/api/v1/vulnerability-library/artifacts/{exp_id}", token=admin_token)

    return poc_id, exp_id


def test_vuln_categories(admin_token):
    print("\n=== VulnLib: Categories ===")
    # Get tree
    code, data = api("GET", "/api/v1/vulnerability-library/categories", token=admin_token)
    test("VLIB-C01", "Get category tree", code == 200 and isinstance(data, list),
         f"top_level={len(data)}" if code == 200 else f"code={code}")

    # Create top-level
    code, cat = api("POST", "/api/v1/vulnerability-library/categories", token=admin_token, json_body={
        "code": f"e2e_test_{RAND}", "name": f"E2E Test Category {RAND}", "sort_order": 999
    })
    cat_created = code == 201 and "id" in cat
    test("VLIB-C02", "Create top-level category", cat_created,
         f"id={cat.get('id')}" if cat_created else f"code={code}")
    cat_id = cat.get("id")

    if cat_id:
        add_cleanup(f"Delete category {cat_id}", lambda t, cid=cat_id: api("DELETE", f"/api/v1/vulnerability-library/categories/{cid}", token=t))

        # Create sub-category
        code, sub = api("POST", "/api/v1/vulnerability-library/categories", token=admin_token, json_body={
            "code": f"e2e_sub_{RAND}", "name": f"E2E Sub Category {RAND}", "parent_id": cat_id, "sort_order": 1
        })
        test("VLIB-C03", "Create sub-category", code == 201 and "id" in sub,
             f"parent_id={sub.get('parent_id')}" if code == 201 else f"code={code}")
        sub_id = sub.get("id")
        if sub_id:
            add_cleanup(f"Delete sub-category {sub_id}", lambda t, sid=sub_id: api("DELETE", f"/api/v1/vulnerability-library/categories/{sid}", token=t))

        # Update
        code, upd = api("PUT", f"/api/v1/vulnerability-library/categories/{cat_id}", token=admin_token, json_body={
            "name": f"E2E Updated {RAND}"
        })
        test("VLIB-C04", "Update category", code == 200 and upd.get("name") == f"E2E Updated {RAND}",
             f"name={upd.get('name')}")

        # Delete
        code, _ = api("DELETE", f"/api/v1/vulnerability-library/categories/{cat_id}", token=admin_token)
        test("VLIB-C05", "Delete category (soft)", code == 204, f"code={code}")

    # Invalid parent_id
    code, _ = api("POST", "/api/v1/vulnerability-library/categories", token=admin_token, json_body={
        "code": f"e2e_orphan_{RAND}", "name": "Orphan", "parent_id": "nonexistent-parent-id"
    })
    test("VLIB-C06", "Create with invalid parent_id => error", code in (400, 404, 422), f"code={code}")


# ══════════════════════════════════════════════
# SYSTEM SETTINGS MODULE
# ══════════════════════════════════════════════

def test_system_users(admin_token):
    print("\n=== System: Users ===")
    # Current user
    code, data = api("GET", "/api/v1/system/users/me", token=admin_token)
    test("SYS-U01", "Current user info", code == 200 and data.get("email") == ADMIN_EMAIL,
         f"email={data.get('email')}")

    # List users
    code, data = api("GET", "/api/v1/system/users", token=admin_token)
    test("SYS-U02", "List users", code == 200, f"code={code}")

    # Create user
    email = f"e2e_crud_{RAND}@example.com"
    code, data = api("POST", "/api/v1/system/users", token=admin_token, json_body={
        "email": email, "password": "CrudPass123!", "full_name": "E2E CRUD User", "role": "user"
    })
    created = code in (200, 201) and "id" in data
    test("SYS-U03", "Create user", created, f"id={data.get('id')}" if created else f"code={code}")
    user_id = data.get("id")

    if user_id:
        add_cleanup(f"Delete test user {user_id}", lambda t, uid=user_id: api("DELETE", f"/api/v1/system/users/{uid}", token=t))

        # Get detail
        code, det = api("GET", f"/api/v1/system/users/{user_id}", token=admin_token)
        test("SYS-U04", "Get user detail", code == 200 and det.get("email") == email,
             f"email={det.get('email')}")

        # Update
        code, upd = api("PUT", f"/api/v1/system/users/{user_id}", token=admin_token, json_body={
            "full_name": "E2E CRUD Updated"
        })
        test("SYS-U05", "Update user", code == 200 and upd.get("full_name") == "E2E CRUD Updated",
             f"full_name={upd.get('full_name')}")

        # Reset password
        code, _ = api("POST", f"/api/v1/system/users/{user_id}/reset-password", token=admin_token, json_body={
            "new_password": "NewCrudPass456!"
        })
        test("SYS-U06", "Reset password", code == 200, f"code={code}")

        # Login with new password
        code, login_data = api("POST", "/api/v1/system/profile/login", json_body={
            "email": email, "password": "NewCrudPass456!"
        })
        test("SYS-U07", "Login with new password", code == 200 and "access_token" in login_data,
             f"code={code}")

        # Delete
        code, _ = api("DELETE", f"/api/v1/system/users/{user_id}", token=admin_token)
        test("SYS-U08", "Delete user", code in (200, 204), f"code={code}")


def test_system_roles(admin_token):
    print("\n=== System: Roles ===")
    # List roles
    code, data = api("GET", "/api/v1/system/roles", token=admin_token)
    test("SYS-R01", "List roles", code == 200 and isinstance(data, list) and len(data) >= 4,
         f"count={len(data) if isinstance(data, list) else '?'}")

    # Create role
    role_name = f"e2e_role_{RAND}"
    code, data = api("POST", "/api/v1/system/roles", token=admin_token, json_body={
        "name": role_name, "display_name": "E2E Test Role", "description": "E2E test role"
    })
    created = code in (200, 201)
    test("SYS-R02", "Create role", created, f"role={role_name}" if created else f"code={code}")

    if created:
        add_cleanup(f"Delete test role {role_name}", lambda t, rn=role_name: api("DELETE", f"/api/v1/system/roles/{rn}", token=t))

        # Get detail
        code, det = api("GET", f"/api/v1/system/roles/{role_name}", token=admin_token)
        test("SYS-R03", "Get role detail", code == 200, f"role={det.get('role', det.get('name'))}")

        # Update
        code, upd = api("PUT", f"/api/v1/system/roles/{role_name}", token=admin_token, json_body={
            "description": "Updated E2E role"
        })
        test("SYS-R04", "Update role", code == 200, f"code={code}")

        # Update permissions
        code, _ = api("PUT", f"/api/v1/system/roles/{role_name}/permissions", token=admin_token, json_body={
            "permission_ids": []
        })
        test("SYS-R05", "Update role permissions", code == 200, f"code={code}")

        # Delete
        code, _ = api("DELETE", f"/api/v1/system/roles/{role_name}", token=admin_token)
        test("SYS-R06", "Delete role", code in (200, 204), f"code={code}")


def test_system_menus(admin_token):
    print("\n=== System: Menus ===")
    # List
    code, data = api("GET", "/api/v1/menus", token=admin_token)
    test("SYS-M01", "List menus", code == 200, f"code={code}")

    # Tree
    code, tree = api("GET", "/api/v1/menus/tree", token=admin_token)
    test("SYS-M02", "Menu tree (3 groups)", code == 200,
         f"top_level={len(tree) if isinstance(tree, list) else '?'}")

    # User menu
    code, umenu = api("GET", "/api/v1/menus/user", token=admin_token)
    test("SYS-M03", "User menu tree", code == 200, f"code={code}")

    # Create
    code, data = api("POST", "/api/v1/menus", token=admin_token, json_body={
        "name": f"e2e_menu_{RAND}", "path": f"/e2e-test-{RAND}", "icon": "DashboardOutlined",
        "sort_order": 999, "is_visible": True, "menu_type": "menu"
    })
    created = code in (200, 201) and "id" in data
    test("SYS-M04", "Create menu", created, f"id={data.get('id')}" if created else f"code={code}")
    menu_id = data.get("id")

    if menu_id:
        add_cleanup(f"Delete test menu {menu_id}", lambda t, mid=menu_id: api("DELETE", f"/api/v1/menus/{mid}", token=t))

        # Get detail
        code, det = api("GET", f"/api/v1/menus/{menu_id}", token=admin_token)
        test("SYS-M05", "Get menu detail", code == 200, f"name={det.get('name')}")

        # Update
        code, upd = api("PUT", f"/api/v1/menus/{menu_id}", token=admin_token, json_body={
            "name": f"e2e_menu_updated_{RAND}"
        })
        test("SYS-M06", "Update menu", code == 200 and upd.get("name") == f"e2e_menu_updated_{RAND}",
             f"name={upd.get('name')}")

        # Delete
        code, _ = api("DELETE", f"/api/v1/menus/{menu_id}", token=admin_token)
        test("SYS-M07", "Delete menu", code in (200, 204), f"code={code}")


def test_system_audit(admin_token):
    print("\n=== System: Audit ===")
    # List
    code, data = api("GET", "/api/v1/audit", token=admin_token)
    test("SYS-AU01", "List audit logs", code == 200 and "total" in data,
         f"total={data.get('total')}")

    # Filter by action
    code, data = api("GET", "/api/v1/audit", token=admin_token, params={"action": "login"})
    test("SYS-AU02", "Filter by action=login", code == 200, f"code={code}")

    # Filter by resource_type
    code, data = api("GET", "/api/v1/audit", token=admin_token, params={"resource_type": "user"})
    test("SYS-AU03", "Filter by resource_type=user", code == 200, f"code={code}")

    # Filter by date range
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    code, data = api("GET", "/api/v1/audit", token=admin_token,
                     params={"start_date": today, "end_date": today})
    test("SYS-AU04", "Filter by date range", code == 200, f"code={code}")


def test_system_monitor(admin_token):
    print("\n=== System: Monitor ===")
    code, data = api("GET", "/api/v1/monitor/health", token=admin_token)
    test("SYS-MN01", "Health check", code == 200,
         f"status={data.get('status', data.get('_text', 'unknown'))}")

    code, data = api("GET", "/api/v1/monitor/database", token=admin_token)
    test("SYS-MN02", "Database status", code == 200, f"code={code}")


# ══════════════════════════════════════════════
# CROSS-MODULE VERIFICATION
# ══════════════════════════════════════════════

def test_cross_module(admin_token):
    print("\n=== Cross-Module Verification ===")

    # Get initial stats
    _, stats_before = api("GET", "/api/v1/vulnerability-library/stats", token=admin_token)
    total_before = stats_before.get("total", 0)

    # Create entry
    code, entry = api("POST", "/api/v1/vulnerability-library/entries", token=admin_token, json_body={
        "title": f"E2E Cross {RAND}", "description": "Cross-module test", "severity": "medium"
    })
    entry_id = entry.get("id")
    if not entry_id:
        test("CROSS-01", "Stats update after create", False, "Could not create entry")
        return

    # CROSS-01: Stats should increase
    _, stats_after = api("GET", "/api/v1/vulnerability-library/stats", token=admin_token)
    test("CROSS-01", "Stats total increases after create",
         stats_after.get("total", 0) > total_before,
         f"before={total_before} after={stats_after.get('total')}")

    # CROSS-02: Create POC => has_poc=True
    code, poc = api("POST", f"/api/v1/vulnerability-library/entries/{entry_id}/artifacts", token=admin_token, json_body={
        "artifact_type": "poc", "title": f"Cross POC {RAND}", "content": "poc"
    })
    poc_id = poc.get("id")
    if poc_id:
        _, det = api("GET", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token)
        test("CROSS-02", "has_poc=True after POC create", det.get("has_poc") is True,
             f"has_poc={det.get('has_poc')}")

        # CROSS-03: Create EXP => has_exp=True
        code, exp = api("POST", f"/api/v1/vulnerability-library/entries/{entry_id}/artifacts", token=admin_token, json_body={
            "artifact_type": "exp", "title": f"Cross EXP {RAND}", "content": "exp"
        })
        exp_id = exp.get("id")
        _, det2 = api("GET", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token)
        test("CROSS-03", "has_exp=True after EXP create", det2.get("has_exp") is True,
             f"has_exp={det2.get('has_exp')}")

        # CROSS-04: Delete artifact => count decreases
        _, det3 = api("GET", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token)
        count_before = det3.get("artifact_count", 0)
        api("DELETE", f"/api/v1/vulnerability-library/artifacts/{poc_id}", token=admin_token)
        _, det4 = api("GET", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token)
        test("CROSS-04", "artifact_count decreases after delete",
             det4.get("artifact_count", 0) < count_before,
             f"before={count_before} after={det4.get('artifact_count')}")

        if exp_id:
            api("DELETE", f"/api/v1/vulnerability-library/artifacts/{exp_id}", token=admin_token)

    # CROSS-05: Delete entry => children not visible
    api("DELETE", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token)
    _, id_list = api("GET", "/api/v1/vulnerability-library/identifiers", token=admin_token,
                     params={"entry_id": entry_id})
    _, art_list = api("GET", "/api/v1/vulnerability-library/artifacts", token=admin_token,
                      params={"entry_id": entry_id})
    test("CROSS-05", "Children invisible after entry delete",
         id_list.get("total", 0) == 0 and art_list.get("total", 0) == 0,
         f"identifiers={id_list.get('total')} artifacts={art_list.get('total')}")

    # CROSS-06: Audit log generated
    _, audit_data = api("GET", "/api/v1/audit", token=admin_token,
                        params={"action": "vuln_library.create_entry"})
    test("CROSS-06", "Audit log generated for entry create",
         audit_data.get("total", 0) > 0 if isinstance(audit_data, dict) else False,
         f"total={audit_data.get('total', 0)}")

    # CROSS-07: /me returns 3 menu groups
    _, me_data = api("GET", "/api/v1/system/me", token=admin_token)
    menus = me_data.get("menus", [])
    dir_menus = [m for m in menus if m.get("menu_type") == "directory" or m.get("children")]
    test("CROSS-07", "/me returns 3 menu groups", len(dir_menus) >= 3,
         f"groups={len(dir_menus)}")

    # CROSS-08: Permissions count
    perms = me_data.get("permissions", [])
    test("CROSS-08", "/me permissions count >= 40", len(perms) >= 40,
         f"count={len(perms)}")


# ══════════════════════════════════════════════
# PERMISSION MATRIX
# ══════════════════════════════════════════════

def test_permission_matrix(admin_token, viewer_token, user_token):
    print("\n=== Permission Matrix ===")

    if not viewer_token:
        test("PERM-01", "Viewer read vuln library", False, "No viewer token")
        test("PERM-02", "Viewer create entry", False, "No viewer token")
        test("PERM-03", "Viewer read users", False, "No viewer token")
        test("PERM-04", "Viewer read menus", False, "No viewer token")
        test("PERM-05", "Viewer read audit", False, "No viewer token")
        test("PERM-10", "Viewer read health", False, "No viewer token")
    else:
        # PERM-01: Viewer can read vuln library
        code, _ = api("GET", "/api/v1/vulnerability-library/entries", token=viewer_token)
        test("PERM-01", "Viewer read vuln library", code == 200, f"code={code}")

        # PERM-02: Viewer cannot create entry
        code, _ = api("POST", "/api/v1/vulnerability-library/entries", token=viewer_token, json_body={
            "title": "Should fail", "description": "test", "severity": "low"
        })
        test("PERM-02", "Viewer create entry => 403", code == 403, f"code={code}")

        # PERM-03: Viewer cannot read user management
        code, _ = api("GET", "/api/v1/system/users", token=viewer_token)
        test("PERM-03", "Viewer read users => 403", code == 403, f"code={code}")

        # PERM-04: Viewer cannot read menus management
        code, _ = api("GET", "/api/v1/menus", token=viewer_token)
        test("PERM-04", "Viewer read menus => 403", code == 403, f"code={code}")

        # PERM-05: Viewer cannot read audit
        code, _ = api("GET", "/api/v1/audit", token=viewer_token)
        test("PERM-05", "Viewer read audit => 403", code == 403, f"code={code}")

        # PERM-10: Viewer can access health (authenticated only)
        code, _ = api("GET", "/api/v1/monitor/health", token=viewer_token)
        test("PERM-10", "Viewer read health", code == 200, f"code={code}")

    if not user_token:
        test("PERM-06", "User read vuln library", False, "No user token")
        test("PERM-07", "User create entry => 403", False, "No user token")
    else:
        # PERM-06: User can read vuln library
        code, _ = api("GET", "/api/v1/vulnerability-library/entries", token=user_token)
        test("PERM-06", "User read vuln library", code == 200, f"code={code}")

        # PERM-07: User cannot create entry
        code, _ = api("POST", "/api/v1/vulnerability-library/entries", token=user_token, json_body={
            "title": "Should fail", "description": "test", "severity": "low"
        })
        test("PERM-07", "User create entry => 403", code == 403, f"code={code}")

    # PERM-08: No token
    code, _ = api("GET", "/api/v1/vulnerability-library/entries")
    test("PERM-08", "No token => 401", code in (401, 403), f"code={code}")

    # PERM-09: Invalid token
    code, _ = api("GET", "/api/v1/vulnerability-library/entries", token="invalid-token-xxx")
    test("PERM-09", "Invalid token => 401", code in (401, 403), f"code={code}")


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def print_report(start_time: float):
    duration = time.time() - start_time
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = total - passed

    # Group by module prefix
    modules = {}
    for r in results:
        prefix = r["id"].split("-")[0]
        if prefix not in modules:
            modules[prefix] = {"pass": 0, "fail": 0}
        if r["status"] == "PASS":
            modules[prefix]["pass"] += 1
        else:
            modules[prefix]["fail"] += 1

    print("\n" + "=" * 60)
    print("E2E TEST REPORT")
    print("=" * 60)
    print(f"  Date:     {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Duration: {duration:.1f}s")
    print(f"  Target:   {BASE_URL}")
    print(f"  Total:    {total}")
    print(f"  \033[92mPassed:   {passed}\033[0m")
    if failed:
        print(f"  \033[91mFailed:   {failed}\033[0m")

    print(f"\n  {'Module':<12} {'PASS':>6} {'FAIL':>6} {'Total':>6}")
    print(f"  {'-'*12} {'-'*6} {'-'*6} {'-'*6}")
    for mod, counts in sorted(modules.items()):
        t = counts["pass"] + counts["fail"]
        color = "\033[92m" if counts["fail"] == 0 else "\033[91m"
        print(f"  {mod:<12} {color}{counts['pass']:>6}\033[0m {counts['fail']:>6} {t:>6}")

    if failed:
        print(f"\n  \033[91mFailed Tests:\033[0m")
        for r in results:
            if r["status"] == "FAIL":
                print(f"    [{r['id']}] {r['name']}: {r['detail']}")

    print("=" * 60)
    pass_rate = (passed / total * 100) if total else 0
    print(f"  Pass Rate: {pass_rate:.1f}%")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="PTTechAI E2E Test: VulnLib + System Settings")
    parser.add_argument("--base-url", default=BASE_URL, help=f"Backend URL (default: {BASE_URL})")
    args = parser.parse_args()

    globals()['BASE_URL'] = args.base_url

    start_time = time.time()
    print(f"PTTechAI E2E Test Suite")
    print(f"Target: {BASE_URL}")
    print(f"Time:   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Check connectivity
    try:
        r = requests.get(f"{BASE_URL}/api/health", timeout=5)
        print(f"Backend reachable: {r.status_code}")
    except Exception as e:
        print(f"FATAL: Backend not reachable at {BASE_URL}: {e}")
        sys.exit(1)

    # Auth setup
    admin_token, viewer_token, user_token = setup_auth()

    # ── Vulnerability Library Tests ──
    test_vuln_overview(admin_token, viewer_token)
    entry_id = test_vuln_entries(admin_token)
    test_vuln_identifiers(admin_token, entry_id)
    test_vuln_artifacts(admin_token, entry_id)
    test_vuln_categories(admin_token)

    # Delete test entry after sub-resource tests
    if entry_id:
        api("DELETE", f"/api/v1/vulnerability-library/entries/{entry_id}", token=admin_token)

    # ── System Settings Tests ──
    test_system_users(admin_token)
    test_system_roles(admin_token)
    test_system_menus(admin_token)
    test_system_audit(admin_token)
    test_system_monitor(admin_token)

    # ── Cross-Module Verification ──
    test_cross_module(admin_token)

    # ── Permission Matrix ──
    test_permission_matrix(admin_token, viewer_token, user_token)

    # Cleanup
    run_cleanup(admin_token)

    # Report
    print_report(start_time)

    # Exit code
    failed = sum(1 for r in results if r["status"] == "FAIL")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
