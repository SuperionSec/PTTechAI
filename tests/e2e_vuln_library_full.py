#!/usr/bin/env python3
"""
PTTechAI E2E Test: Vulnerability Library Full Coverage
API-level E2E test covering: Stats, Entries CRUD, Entries Edge Cases, Identifiers,
Artifacts, Categories, Export/Import, Permission Matrix.

Usage:
    python tests/e2e_vuln_library_full.py
    python tests/e2e_vuln_library_full.py --base-url http://192.168.1.100:8000
"""

import argparse
import random
import sys
import time
from datetime import datetime

import requests

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/v1/vulnerability-library"
ADMIN_EMAIL = "admin@bctech.ai"
ADMIN_PASSWORD = "admin123"
VIEWER_EMAIL = "test_vl_viewer@example.com"
USER_EMAIL = "test_vl_user@example.com"
TEST_PASSWORD = "TestPass123!"
RAND = random.randint(1000, 9999)

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


def api(method: str, path: str, token: str | None = None, json_body: dict | None = None,
        params: dict | None = None, full_path: bool = False):
    url = path if full_path else f"{BASE_URL}{API_PREFIX}{path}"
    if token:
        headers = header(token)
    else:
        headers = {"Content-Type": "application/json"}
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
            data = {"_text": r.text, "_content_type": r.headers.get("content-type", "")}
        return r.status_code, data
    except Exception as e:
        return 0, {"_error": str(e)}


def api_raw(method: str, path: str, token: str | None = None, params: dict | None = None):
    """Raw API call returning response object for export tests."""
    url = f"{BASE_URL}{API_PREFIX}{path}"
    if token:
        headers = header(token)
    else:
        headers = {"Content-Type": "application/json"}
    try:
        if method == "GET":
            return requests.get(url, headers=headers, params=params, timeout=30)
        return None
    except Exception:
        return None


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
    code, data = api("POST", "/api/v1/system/profile/login",
                     json_body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                     full_path=False)
    # Login via system endpoint
    url = f"{BASE_URL}/api/v1/system/profile/login"
    r = requests.post(url, json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
    if r.status_code != 200 or "access_token" not in r.json():
        print(f"FATAL: Admin login failed (code={r.status_code})")
        sys.exit(1)
    admin_token = r.json()["access_token"]
    print(f"  [+] Admin login OK")

    def sys_api(method, path, token=None, json_body=None):
        url = f"{BASE_URL}{path}"
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"} if token else {"Content-Type": "application/json"}
        if method == "GET":
            return requests.get(url, headers=h, timeout=10)
        elif method == "POST":
            return requests.post(url, headers=h, json=json_body, timeout=10)
        elif method == "DELETE":
            return requests.delete(url, headers=h, timeout=10)
        return type('R', (), {'status_code': 0, 'json': lambda: {}})()

    h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    # Create viewer user
    r2 = requests.get(f"{BASE_URL}/api/v1/system/users", headers=h, timeout=10)
    existing = r2.json() if r2.status_code == 200 and isinstance(r2.json(), list) else []
    for email, role in [(VIEWER_EMAIL, "viewer"), (USER_EMAIL, "user")]:
        found = any(u.get("email") == email for u in existing if isinstance(u, dict))
        if not found:
            requests.post(f"{BASE_URL}/api/v1/system/users", headers=h, json={
                "email": email, "password": TEST_PASSWORD, "full_name": f"VL {role.title()}", "role": role
            }, timeout=10)

    # Login viewer
    r = requests.post(f"{BASE_URL}/api/v1/system/profile/login",
                      json={"email": VIEWER_EMAIL, "password": TEST_PASSWORD}, timeout=10)
    viewer_token = r.json().get("access_token") if r.status_code == 200 else None
    print(f"  [{'+'if viewer_token else 'X'}] Viewer login: {'OK' if viewer_token else 'FAILED'}")

    # Login user
    r = requests.post(f"{BASE_URL}/api/v1/system/profile/login",
                      json={"email": USER_EMAIL, "password": TEST_PASSWORD}, timeout=10)
    user_token = r.json().get("access_token") if r.status_code == 200 else None
    print(f"  [{'+'if user_token else 'X'}] User login: {'OK' if user_token else 'FAILED'}")

    return admin_token, viewer_token, user_token


# ══════════════════════════════════════════════
# GROUP 1: Stats
# ══════════════════════════════════════════════
def test_stats(admin_token):
    print("\n=== Stats ===")

    # STAT-01: GET /stats
    code, data = api("GET", "/stats", token=admin_token)
    has_fields = all(k in data for k in ("total", "critical_count", "high_count", "poc_count", "exp_count"))
    test("STAT-01", "GET /stats returns statistics", code == 200 and has_fields,
         f"total={data.get('total')}" if code == 200 else f"code={code}")

    # STAT-02: severity_distribution
    sev_dist = data.get("severity_distribution", {}) if code == 200 else {}
    test("STAT-02", "severity_distribution is dict", code == 200 and isinstance(sev_dist, dict),
         f"keys={list(sev_dist.keys())}")

    # STAT-03: recent_entries
    recent = data.get("recent_entries", []) if code == 200 else None
    test("STAT-03", "recent_entries is list", code == 200 and isinstance(recent, list),
         f"count={len(recent) if isinstance(recent, list) else '?'}")


# ══════════════════════════════════════════════
# GROUP 2: Entries CRUD
# ══════════════════════════════════════════════
def test_entries_crud(admin_token):
    print("\n=== Entries CRUD ===")
    entry_id = None
    entry_id_auto = None

    # ENT-01: Create entry with explicit vuln_code
    vuln_code = f"PTVULN-E2E-{RAND}"
    code, data = api("POST", "/entries", token=admin_token, json_body={
        "vuln_code": vuln_code,
        "title": f"E2E Test Entry {RAND}",
        "description": f"Test description for E2E {RAND}",
        "severity": "high",
        "status": "draft",
        "vendor": "TestVendor",
        "product": "TestProduct",
        "vuln_type": "RCE",
        "cvss_score": 8.5,
    })
    ok = code == 201 and data.get("vuln_code") == vuln_code and data.get("title") == f"E2E Test Entry {RAND}"
    test("ENT-01", "Create entry with vuln_code", ok,
         f"id={data.get('id')}" if ok else f"code={code} detail={data.get('detail','')}")
    if ok:
        entry_id = data["id"]
        add_cleanup(f"Delete entry {entry_id}",
                    lambda t, eid=entry_id: api("DELETE", f"/entries/{eid}", token=t))

    # ENT-02: Create entry with auto-generated vuln_code
    code, data = api("POST", "/entries", token=admin_token, json_body={
        "title": f"E2E Auto Code {RAND}",
        "description": "Auto code test",
        "severity": "medium",
    })
    ok = code == 201 and data.get("vuln_code", "").startswith("PTVULN-")
    test("ENT-02", "Create entry auto vuln_code", ok,
         f"vuln_code={data.get('vuln_code')}" if ok else f"code={code}")
    if ok:
        entry_id_auto = data["id"]
        add_cleanup(f"Delete auto entry {entry_id_auto}",
                    lambda t, eid=entry_id_auto: api("DELETE", f"/entries/{eid}", token=t))

    # ENT-03: List entries
    code, data = api("GET", "/entries", token=admin_token)
    items = data.get("items", []) if isinstance(data, dict) else []
    total = data.get("total", 0) if isinstance(data, dict) else 0
    has_our = any(e.get("vuln_code") == vuln_code for e in items)
    test("ENT-03", "List entries", code == 200 and total >= 1,
         f"total={total} has_our={has_our}")

    # ENT-04: Get entry detail
    if entry_id:
        code, data = api("GET", f"/entries/{entry_id}", token=admin_token)
        has_fields = all(k in data for k in ("identifiers", "artifacts_summary", "vuln_code", "title"))
        test("ENT-04", "Get entry detail", code == 200 and has_fields,
             f"vuln_code={data.get('vuln_code')}")
    else:
        test("ENT-04", "Get entry detail", False, "No entry_id")

    # ENT-05: Update entry
    if entry_id:
        code, data = api("PUT", f"/entries/{entry_id}", token=admin_token, json_body={
            "title": f"E2E Updated {RAND}",
            "severity": "critical",
        })
        ok = code == 200 and data.get("title") == f"E2E Updated {RAND}" and data.get("severity") == "critical"
        test("ENT-05", "Update entry title+severity", ok,
             f"title={data.get('title')}" if code == 200 else f"code={code}")
    else:
        test("ENT-05", "Update entry title+severity", False, "No entry_id")

    # ENT-06: Filter by severity
    code, data = api("GET", "/entries", token=admin_token, params={"severity": "critical"})
    items = data.get("items", []) if isinstance(data, dict) else []
    all_critical = all(e.get("severity") == "critical" for e in items) if items else True
    test("ENT-06", "Filter by severity=critical", code == 200 and all_critical,
         f"count={len(items)}")

    # ENT-07: Search by keyword
    code, data = api("GET", "/entries", token=admin_token, params={"q": f"E2E"})
    items = data.get("items", []) if isinstance(data, dict) else []
    test("ENT-07", "Search by keyword 'E2E'", code == 200 and len(items) >= 1,
         f"count={len(items)}")

    # ENT-08: Delete entry
    if entry_id:
        code, _ = api("DELETE", f"/entries/{entry_id}", token=admin_token)
        test("ENT-08", "Delete entry", code == 204, f"code={code}")
    else:
        test("ENT-08", "Delete entry", False, "No entry_id")

    # ENT-09: Get deleted entry => 404
    if entry_id:
        code, _ = api("GET", f"/entries/{entry_id}", token=admin_token)
        test("ENT-09", "Deleted entry not found => 404", code == 404, f"code={code}")
    else:
        test("ENT-09", "Deleted entry not found => 404", False, "No entry_id")

    # ENT-10: Delete non-existent entry => 404
    code, _ = api("DELETE", "/entries/00000000-0000-0000-0000-000000000000", token=admin_token)
    test("ENT-10", "Delete non-existent entry => 404", code == 404, f"code={code}")

    return entry_id_auto


# ══════════════════════════════════════════════
# GROUP 3: Entries Edge Cases
# ══════════════════════════════════════════════
def test_entries_edge(admin_token):
    print("\n=== Entries Edge Cases ===")

    # ENT-E01: Missing title => 422
    code, _ = api("POST", "/entries", token=admin_token, json_body={
        "description": "No title", "severity": "high"
    })
    test("ENT-E01", "Create entry missing title => 422", code == 422, f"code={code}")

    # ENT-E02: Missing description => 422
    code, _ = api("POST", "/entries", token=admin_token, json_body={
        "title": f"No desc {RAND}", "severity": "high"
    })
    test("ENT-E02", "Create entry missing description => 422", code == 422, f"code={code}")

    # ENT-E03: Invalid severity => 422
    code, _ = api("POST", "/entries", token=admin_token, json_body={
        "title": f"Bad sev {RAND}", "description": "test", "severity": "extreme"
    })
    test("ENT-E03", "Create entry invalid severity => 422", code == 422, f"code={code}")

    # ENT-E04: CVSS score > 10 => 422
    code, _ = api("POST", "/entries", token=admin_token, json_body={
        "title": f"Bad cvss {RAND}", "description": "test", "severity": "high", "cvss_score": 15.0
    })
    test("ENT-E04", "Create entry cvss_score > 10 => 422", code == 422, f"code={code}")

    # ENT-E05: Duplicate vuln_code => 409
    dup_code = f"PTVULN-DUP-{RAND}"
    api("POST", "/entries", token=admin_token, json_body={
        "vuln_code": dup_code, "title": f"Dup1 {RAND}", "description": "test", "severity": "high"
    })
    code, _ = api("POST", "/entries", token=admin_token, json_body={
        "vuln_code": dup_code, "title": f"Dup2 {RAND}", "description": "test", "severity": "low"
    })
    test("ENT-E05", "Duplicate vuln_code => 409", code == 409, f"code={code}")
    # Cleanup
    code, list_data = api("GET", "/entries", token=admin_token, params={"q": dup_code})
    if isinstance(list_data, dict):
        for e in list_data.get("items", []):
            if e.get("vuln_code") == dup_code:
                api("DELETE", f"/entries/{e['id']}", token=admin_token)


# ══════════════════════════════════════════════
# GROUP 4: Identifiers
# ══════════════════════════════════════════════
def test_identifiers(admin_token, entry_id):
    print("\n=== Identifiers ===")
    if not entry_id:
        for i in range(1, 9):
            test(f"IDF-0{i}", f"Identifier test", False, "No entry_id available")
        return

    idf_cve_id = None
    idf_cnvd_id = None

    # IDF-01: Create CVE identifier
    code, data = api("POST", f"/entries/{entry_id}/identifiers", token=admin_token, json_body={
        "source": "cve", "identifier": f"CVE-2026-{RAND}", "is_primary": True
    })
    ok = code == 201 and data.get("source") == "cve"
    test("IDF-01", "Create CVE identifier", ok,
         f"id={data.get('id')}" if ok else f"code={code}")
    if ok:
        idf_cve_id = data["id"]

    # IDF-02: Create CNVD identifier
    code, data = api("POST", f"/entries/{entry_id}/identifiers", token=admin_token, json_body={
        "source": "cnvd", "identifier": f"CNVD-2026-{RAND}", "is_primary": False
    })
    ok = code == 201 and data.get("source") == "cnvd"
    test("IDF-02", "Create CNVD identifier", ok,
         f"id={data.get('id')}" if ok else f"code={code}")
    if ok:
        idf_cnvd_id = data["id"]

    # IDF-03: List identifiers
    code, data = api("GET", "/identifiers", token=admin_token, params={"entry_id": entry_id})
    items = data.get("items", []) if isinstance(data, dict) else []
    test("IDF-03", "List identifiers", code == 200 and len(items) >= 1,
         f"count={len(items)}")

    # IDF-04: Filter by source
    code, data = api("GET", "/identifiers", token=admin_token, params={"source": "cve", "entry_id": entry_id})
    items = data.get("items", []) if isinstance(data, dict) else []
    all_cve = all(i.get("source") == "cve" for i in items) if items else True
    test("IDF-04", "Filter identifiers by source=cve", code == 200 and all_cve,
         f"count={len(items)}")

    # IDF-05: Update identifier
    if idf_cve_id:
        code, data = api("PUT", f"/identifiers/{idf_cve_id}", token=admin_token, json_body={
            "url": f"https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-{RAND}"
        })
        ok = code == 200 and data.get("url") is not None
        test("IDF-05", "Update identifier url", ok,
             f"url={data.get('url')}" if code == 200 else f"code={code}")
    else:
        test("IDF-05", "Update identifier url", False, "No idf_cve_id")

    # IDF-06: Set is_primary (CNVD becomes primary, CVE becomes non-primary)
    if idf_cnvd_id:
        code, data = api("PUT", f"/identifiers/{idf_cnvd_id}", token=admin_token, json_body={
            "is_primary": True
        })
        ok = code == 200 and data.get("is_primary") == True
        test("IDF-06", "Set CNVD is_primary=True", ok,
             f"is_primary={data.get('is_primary')}" if code == 200 else f"code={code}")
    else:
        test("IDF-06", "Set CNVD is_primary=True", False, "No idf_cnvd_id")

    # IDF-07: Delete identifier
    if idf_cnvd_id:
        code, _ = api("DELETE", f"/identifiers/{idf_cnvd_id}", token=admin_token)
        test("IDF-07", "Delete identifier", code == 204, f"code={code}")
    else:
        test("IDF-07", "Delete identifier", False, "No idf_cnvd_id")

    # IDF-08: Duplicate source+identifier => 409
    if idf_cve_id:
        code, _ = api("POST", f"/entries/{entry_id}/identifiers", token=admin_token, json_body={
            "source": "cve", "identifier": f"CVE-2026-{RAND}"
        })
        test("IDF-08", "Duplicate source+identifier => 409", code == 409, f"code={code}")
    else:
        test("IDF-08", "Duplicate source+identifier => 409", False, "No idf_cve_id")


# ══════════════════════════════════════════════
# GROUP 5: Artifacts
# ══════════════════════════════════════════════
def test_artifacts(admin_token, entry_id):
    print("\n=== Artifacts ===")
    if not entry_id:
        for i in range(1, 11):
            test(f"ART-{i:02d}", f"Artifact test", False, "No entry_id available")
        return

    poc_id = None
    exp_id = None

    # ART-01: Create POC artifact
    code, data = api("POST", f"/entries/{entry_id}/artifacts", token=admin_token, json_body={
        "artifact_type": "poc",
        "title": f"E2E POC {RAND}",
        "content": "# POC script\nprint('test')",
        "platform": "python",
        "payload_type": "python",
        "author": "E2E Tester",
    })
    ok = code == 201 and data.get("artifact_type") == "poc"
    test("ART-01", "Create POC artifact", ok,
         f"code={data.get('artifact_code')}" if ok else f"status={code}")
    if ok:
        poc_id = data["id"]

    # ART-02: Create EXP artifact
    code, data = api("POST", f"/entries/{entry_id}/artifacts", token=admin_token, json_body={
        "artifact_type": "exp",
        "title": f"E2E EXP {RAND}",
        "content": "# EXP script\nimport os",
        "platform": "python",
        "payload_type": "python",
    })
    ok = code == 201 and data.get("artifact_type") == "exp"
    test("ART-02", "Create EXP artifact", ok,
         f"code={data.get('artifact_code')}" if ok else f"status={code}")
    if ok:
        exp_id = data["id"]

    # ART-03: List artifacts
    code, data = api("GET", "/artifacts", token=admin_token, params={"entry_id": entry_id})
    items = data.get("items", []) if isinstance(data, dict) else []
    test("ART-03", "List artifacts", code == 200 and len(items) >= 1,
         f"count={len(items)}")

    # ART-04: Filter by artifact_type
    code, data = api("GET", "/artifacts", token=admin_token, params={"artifact_type": "poc", "entry_id": entry_id})
    items = data.get("items", []) if isinstance(data, dict) else []
    all_poc = all(a.get("artifact_type") == "poc" for a in items) if items else True
    test("ART-04", "Filter artifacts by type=poc", code == 200 and all_poc,
         f"count={len(items)}")

    # ART-05: Get artifact detail
    if poc_id:
        code, data = api("GET", f"/artifacts/{poc_id}", token=admin_token)
        ok = code == 200 and "content" in data
        test("ART-05", "Get artifact detail with content", ok,
             f"artifact_code={data.get('artifact_code')}" if code == 200 else f"code={code}")
    else:
        test("ART-05", "Get artifact detail with content", False, "No poc_id")

    # ART-06: Update artifact
    if poc_id:
        code, data = api("PUT", f"/artifacts/{poc_id}", token=admin_token, json_body={
            "title": f"Updated POC {RAND}", "verified": True
        })
        ok = code == 200 and data.get("title") == f"Updated POC {RAND}" and data.get("verified") == True
        test("ART-06", "Update artifact title+verified", ok,
             f"title={data.get('title')}" if code == 200 else f"code={code}")
    else:
        test("ART-06", "Update artifact title+verified", False, "No poc_id")

    # ART-07: Delete artifact
    if exp_id:
        code, _ = api("DELETE", f"/artifacts/{exp_id}", token=admin_token)
        test("ART-07", "Delete EXP artifact", code == 204, f"code={code}")
    else:
        test("ART-07", "Delete EXP artifact", False, "No exp_id")

    # ART-08: Delete non-existent artifact => 404
    code, _ = api("DELETE", "/artifacts/00000000-0000-0000-0000-000000000000", token=admin_token)
    test("ART-08", "Delete non-existent artifact => 404", code == 404, f"code={code}")

    # ART-09: Entry has_poc/has_exp flags auto-updated
    code, data = api("GET", f"/entries/{entry_id}", token=admin_token)
    has_poc = data.get("has_poc", False)
    # After deleting EXP, has_exp should be False; POC still exists
    has_exp = data.get("has_exp", True)
    ok = code == 200 and has_poc == True and has_exp == False
    test("ART-09", "Entry has_poc=True has_exp=False after delete", ok,
         f"has_poc={has_poc} has_exp={has_exp}" if code == 200 else f"code={code}")

    # ART-10: Entry artifact_count
    count = data.get("artifact_count", -1) if code == 200 else -1
    ok = code == 200 and count >= 1
    test("ART-10", "Entry artifact_count reflects artifacts", ok, f"count={count}")


# ══════════════════════════════════════════════
# GROUP 6: Categories
# ══════════════════════════════════════════════
def test_categories(admin_token):
    print("\n=== Categories ===")
    cat_id = None
    child_id = None

    # CAT-01: Create top-level category
    code, data = api("POST", "/categories", token=admin_token, json_body={
        "code": f"e2e-cat-{RAND}", "name": f"E2E Category {RAND}",
        "description": "Test category", "sort_order": 0
    })
    ok = code == 201 and data.get("parent_id") is None
    test("CAT-01", "Create top-level category", ok,
         f"id={data.get('id')}" if ok else f"code={code}")
    if ok:
        cat_id = data["id"]
        add_cleanup(f"Delete category {cat_id}",
                    lambda t, cid=cat_id: api("DELETE", f"/categories/{cid}", token=t))

    # CAT-02: Create child category
    if cat_id:
        code, data = api("POST", "/categories", token=admin_token, json_body={
            "code": f"e2e-sub-{RAND}", "name": f"E2E Sub {RAND}",
            "parent_id": cat_id, "sort_order": 1
        })
        ok = code == 201 and data.get("parent_id") == cat_id
        test("CAT-02", "Create child category", ok,
             f"parent_id={data.get('parent_id')}" if ok else f"code={code}")
        if ok:
            child_id = data["id"]
            add_cleanup(f"Delete child category {child_id}",
                        lambda t, cid=child_id: api("DELETE", f"/categories/{cid}", token=t))
    else:
        test("CAT-02", "Create child category", False, "No cat_id")

    # CAT-03: List categories (tree)
    code, data = api("GET", "/categories", token=admin_token)
    has_children = False
    if isinstance(data, list):
        for cat in data:
            if cat.get("children") and len(cat["children"]) > 0:
                has_children = True
                break
    test("CAT-03", "List categories with tree", code == 200 and isinstance(data, list),
         f"count={len(data) if isinstance(data, list) else '?'} has_children={has_children}")

    # CAT-04: Update category name
    if cat_id:
        code, data = api("PUT", f"/categories/{cat_id}", token=admin_token, json_body={
            "name": f"E2E Updated Cat {RAND}"
        })
        ok = code == 200 and data.get("name") == f"E2E Updated Cat {RAND}"
        test("CAT-04", "Update category name", ok,
             f"name={data.get('name')}" if code == 200 else f"code={code}")
    else:
        test("CAT-04", "Update category name", False, "No cat_id")

    # CAT-05: Delete category (soft delete)
    if child_id:
        code, _ = api("DELETE", f"/categories/{child_id}", token=admin_token)
        test("CAT-05", "Delete category (soft)", code == 204, f"code={code}")
    else:
        test("CAT-05", "Delete category (soft)", False, "No child_id")

    # CAT-06: Self-reference parent_id => 400
    if cat_id:
        code, _ = api("PUT", f"/categories/{cat_id}", token=admin_token, json_body={
            "parent_id": cat_id
        })
        test("CAT-06", "Self-reference parent_id => 400", code == 400, f"code={code}")
    else:
        test("CAT-06", "Self-reference parent_id => 400", False, "No cat_id")

    # CAT-07: Invalid parent_id => 400
    code, _ = api("POST", "/categories", token=admin_token, json_body={
        "code": f"e2e-bad-{RAND}", "name": "Bad parent",
        "parent_id": "00000000-0000-0000-0000-000000000000"
    })
    test("CAT-07", "Invalid parent_id => 400", code == 400, f"code={code}")

    # CAT-08: Duplicate code => 409
    if cat_id:
        code, _ = api("POST", "/categories", token=admin_token, json_body={
            "code": f"e2e-cat-{RAND}", "name": "Duplicate code"
        })
        test("CAT-08", "Duplicate category code => 409", code == 409, f"code={code}")
    else:
        test("CAT-08", "Duplicate category code => 409", False, "No cat_id")


# ══════════════════════════════════════════════
# GROUP 7: Export/Import
# ══════════════════════════════════════════════
def test_export_import(admin_token):
    print("\n=== Export/Import ===")

    # EXP-01: JSON export
    r = api_raw("GET", "/entries/export", token=admin_token, params={"format": "json"})
    ok = r is not None and r.status_code == 200 and "json" in r.headers.get("content-type", "").lower()
    test("EXP-01", "Export JSON", ok,
         f"status={r.status_code} ct={r.headers.get('content-type','')[:40]}" if r else "No response")

    # EXP-02: CSV export
    r = api_raw("GET", "/entries/export", token=admin_token, params={"format": "csv"})
    ok = r is not None and r.status_code == 200 and "csv" in r.headers.get("content-type", "").lower()
    test("EXP-02", "Export CSV", ok,
         f"status={r.status_code} ct={r.headers.get('content-type','')[:40]}" if r else "No response")

    # EXP-03: JSON import
    import_data = {
        "entries": [{
            "title": f"E2E Import {RAND}",
            "description": "Imported entry",
            "severity": "low",
            "vuln_code": f"PTVULN-IMP-{RAND}",
            "status": "draft",
        }]
    }
    code, data = api("POST", "/entries/import", token=admin_token, json_body=import_data)
    ok = code == 200 and data.get("created", 0) >= 1
    test("EXP-03", "Import JSON", ok,
         f"created={data.get('created')}" if code == 200 else f"code={code}")
    # Cleanup imported
    if ok:
        code2, list_data = api("GET", "/entries", token=admin_token, params={"q": f"PTVULN-IMP-{RAND}"})
        if isinstance(list_data, dict):
            for e in list_data.get("items", []):
                if e.get("vuln_code") == f"PTVULN-IMP-{RAND}":
                    api("DELETE", f"/entries/{e['id']}", token=admin_token)

    # EXP-04: Duplicate import => skipped
    # First import
    dup_import = {"entries": [{"title": f"Dup Import {RAND}", "description": "dup", "severity": "medium", "vuln_code": f"PTVULN-DUPI-{RAND}"}]}
    api("POST", "/entries/import", token=admin_token, json_body=dup_import)
    # Second import same vuln_code
    code, data = api("POST", "/entries/import", token=admin_token, json_body=dup_import)
    ok = code == 200 and data.get("skipped", 0) >= 1
    test("EXP-04", "Duplicate import skipped", ok,
         f"skipped={data.get('skipped')}" if code == 200 else f"code={code}")
    # Cleanup
    code2, list_data = api("GET", "/entries", token=admin_token, params={"q": f"PTVULN-DUPI-{RAND}"})
    if isinstance(list_data, dict):
        for e in list_data.get("items", []):
            if e.get("vuln_code") == f"PTVULN-DUPI-{RAND}":
                api("DELETE", f"/entries/{e['id']}", token=admin_token)


# ══════════════════════════════════════════════
# GROUP 8: Permission Matrix
# ══════════════════════════════════════════════
def test_permissions(admin_token, viewer_token, user_token, entry_id):
    print("\n=== Permission Matrix ===")

    if not viewer_token:
        for i in range(1, 7):
            test(f"PERM-V0{i}", f"Permission test", False, "No viewer token")
        return

    # PERM-V01: Viewer cannot create entry => 403
    code, _ = api("POST", "/entries", token=viewer_token, json_body={
        "title": "fail", "description": "fail", "severity": "low"
    })
    test("PERM-V01", "Viewer cannot create entry => 403", code == 403, f"code={code}")

    # PERM-V02: Viewer cannot create category => 403
    code, _ = api("POST", "/categories", token=viewer_token, json_body={
        "code": "fail", "name": "fail"
    })
    test("PERM-V02", "Viewer cannot create category => 403", code == 403, f"code={code}")

    # PERM-V03: Viewer can read entries list (or 403 if not mapped)
    code, _ = api("GET", "/entries", token=viewer_token)
    test("PERM-V03", "Viewer read entries (200 or 403)", code in (200, 403), f"code={code}")

    # PERM-V04: User cannot create category => 403
    if user_token:
        code, _ = api("POST", "/categories", token=user_token, json_body={
            "code": f"fail-{RAND}", "name": "fail"
        })
        test("PERM-V04", "User cannot create category => 403", code == 403, f"code={code}")
    else:
        test("PERM-V04", "User cannot create category => 403", False, "No user token")

    # PERM-V05: User can read entry detail (or 403)
    if user_token and entry_id:
        code, _ = api("GET", f"/entries/{entry_id}", token=user_token)
        test("PERM-V05", "User read entry detail (200 or 403)", code in (200, 403), f"code={code}")
    else:
        test("PERM-V05", "User read entry detail (200 or 403)", False, "No user token or entry_id")

    # PERM-V06: Viewer cannot delete artifact => 403
    code, _ = api("DELETE", "/artifacts/00000000-0000-0000-0000-000000000000", token=viewer_token)
    test("PERM-V06", "Viewer cannot delete artifact => 403", code == 403, f"code={code}")


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
def print_report(start_time: float):
    duration = time.time() - start_time
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = total - passed

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
    print("E2E TEST REPORT - Vulnerability Library")
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
    parser = argparse.ArgumentParser(description="PTTechAI E2E Test: Vulnerability Library Full")
    parser.add_argument("--base-url", default=BASE_URL, help=f"Backend URL (default: {BASE_URL})")
    args = parser.parse_args()
    globals()['BASE_URL'] = args.base_url

    start_time = time.time()
    print(f"PTTechAI E2E Test Suite - Vulnerability Library")
    print(f"Target: {BASE_URL}")
    print(f"Time:   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    try:
        r = requests.get(f"{BASE_URL}/api/health", timeout=5)
        print(f"Backend reachable: {r.status_code}")
    except Exception as e:
        print(f"FATAL: Backend not reachable at {BASE_URL}: {e}")
        sys.exit(1)

    admin_token, viewer_token, user_token = setup_auth()

    # ── Stats ──
    test_stats(admin_token)

    # ── Entries CRUD ──
    entry_id_auto = test_entries_crud(admin_token)

    # ── Entries Edge Cases ──
    test_entries_edge(admin_token)

    # Create a persistent entry for identifier/artifact tests
    code, persistent = api("POST", "/entries", token=admin_token, json_body={
        "title": f"E2E Persistent {RAND}", "description": "For sub-resource tests",
        "severity": "medium", "vuln_code": f"PTVULN-PERSIST-{RAND}"
    })
    persist_id = persistent.get("id") if code == 201 else entry_id_auto
    if code == 201:
        add_cleanup(f"Delete persistent entry {persist_id}",
                    lambda t, eid=persist_id: api("DELETE", f"/entries/{eid}", token=t))

    # ── Identifiers ──
    test_identifiers(admin_token, persist_id)

    # ── Artifacts ──
    test_artifacts(admin_token, persist_id)

    # ── Categories ──
    test_categories(admin_token)

    # ── Export/Import ──
    test_export_import(admin_token)

    # ── Permission Matrix ──
    test_permissions(admin_token, viewer_token, user_token, persist_id)

    # Cleanup
    run_cleanup(admin_token)

    # Report
    print_report(start_time)

    failed = sum(1 for r in results if r["status"] == "FAIL")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
