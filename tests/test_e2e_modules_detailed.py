"""
Detailed per-function E2E tests for three modules against a running backend:

    - App security detection (apptest)
    - System settings (organization / users / roles / menus)
    - Vulnerability library (vulnerability-library)

Each test exercises one concrete feature the way the API actually implements it
(verified against source). Skipped automatically when the backend is unreachable.

Run against the live stack:
    PTTECH_E2E_BASE_URL=http://127.0.0.1:8100 pytest tests/test_e2e_modules_detailed.py -v
"""
import os
import uuid

import httpx
import pytest

BASE = os.getenv("PTTECH_E2E_BASE_URL", "http://127.0.0.1:8100").rstrip("/")
API = f"{BASE}/api/v1"
ADMIN = os.getenv("PTTECH_E2E_ADMIN", "admin@bctech.ai")
ADMIN_PW = os.getenv("PTTECH_E2E_ADMIN_PW", "admin123")


def _up() -> bool:
    try:
        return httpx.get(f"{BASE}/api/health", timeout=3).status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _up(), reason=f"backend not reachable at {BASE}")


def H(t):
    return {"Authorization": f"Bearer {t}"}


def login(c, email=ADMIN, pw=ADMIN_PW):
    r = c.post(f"{API}/system/profile/login", json={"email": email, "password": pw})
    r.raise_for_status()
    return r.json()["access_token"]


def apk_file():
    return {"file": ("app.apk", b"PK\x03\x04" + b"\x00" * 96, "application/octet-stream")}


@pytest.fixture(scope="module")
def c():
    with httpx.Client(timeout=60) as client:
        yield client


@pytest.fixture(scope="module")
def admin(c):
    return login(c)


@pytest.fixture
def sfx():
    return uuid.uuid4().hex[:8]


# ============================================================
#  Vulnerability Library
# ============================================================
class TestVulnLibrary:
    def test_entry_full_lifecycle(self, c, admin, sfx):
        # create (auto vuln_code) → read → update → soft-delete
        r = c.post(f"{API}/vulnerability-library/entries", headers=H(admin),
                   json={"title": f"VL {sfx}", "description": "d", "severity": "high", "cvss_score": 7.5, "vuln_type": "SQLi"})
        assert r.status_code == 201, r.text
        eid = r.json()["id"]
        assert r.json()["vuln_code"].startswith("PTVULN")

        r = c.get(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin))
        assert r.status_code == 200 and r.json()["severity"] == "high"

        r = c.put(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin),
                  json={"severity": "critical", "cvss_score": 9.8})
        assert r.status_code == 200 and r.json()["severity"] == "critical"

        assert c.delete(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin)).status_code == 204
        # soft-deleted → no longer listed
        r = c.get(f"{API}/vulnerability-library/entries", headers=H(admin), params={"q": sfx})
        ids = {e["id"] for e in r.json()["items"]}
        assert eid not in ids

    def test_identifier_crud_and_primary_switch(self, c, admin, sfx):
        eid = c.post(f"{API}/vulnerability-library/entries", headers=H(admin),
                     json={"title": f"ID {sfx}", "description": "d", "severity": "medium"}).json()["id"]
        r = c.post(f"{API}/vulnerability-library/entries/{eid}/identifiers", headers=H(admin),
                   json={"source": "cve", "identifier": f"CVE-2026-{sfx[:5]}", "is_primary": True})
        assert r.status_code == 201, r.text
        iid = r.json()["id"]
        # second primary should flip the first to non-primary
        r2 = c.post(f"{API}/vulnerability-library/entries/{eid}/identifiers", headers=H(admin),
                    json={"source": "cwe", "identifier": f"CWE-{sfx[:6]}", "is_primary": True})
        assert r2.status_code == 201, r2.text
        lst = c.get(f"{API}/vulnerability-library/identifiers", headers=H(admin), params={"entry_id": eid}).json()
        assert lst["total"] == 2
        primaries = [i for i in lst["items"] if i.get("is_primary")]
        assert len(primaries) == 1  # only one primary at a time

        assert c.put(f"{API}/vulnerability-library/identifiers/{iid}", headers=H(admin),
                     json={"identifier": f"CVE-2026-{sfx[:5]}-x"}).status_code == 200
        assert c.delete(f"{API}/vulnerability-library/identifiers/{iid}", headers=H(admin)).status_code == 204
        c.delete(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin))

    def test_duplicate_identifier_conflict(self, c, admin, sfx):
        eid = c.post(f"{API}/vulnerability-library/entries", headers=H(admin),
                     json={"title": f"Dup {sfx}", "description": "d", "severity": "low"}).json()["id"]
        body = {"source": "cve", "identifier": f"CVE-DUP-{sfx}"}
        assert c.post(f"{API}/vulnerability-library/entries/{eid}/identifiers", headers=H(admin), json=body).status_code == 201
        dup = c.post(f"{API}/vulnerability-library/entries/{eid}/identifiers", headers=H(admin), json=body)
        assert dup.status_code == 409  # unique constraint
        c.delete(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin))

    def test_artifact_poc_flag_and_cascade(self, c, admin, sfx):
        eid = c.post(f"{API}/vulnerability-library/entries", headers=H(admin),
                     json={"title": f"Art {sfx}", "description": "d", "severity": "high"}).json()["id"]
        r = c.post(f"{API}/vulnerability-library/entries/{eid}/artifacts", headers=H(admin),
                   json={"artifact_type": "poc", "title": f"PoC {sfx}", "content": "print(1)", "language": "python"})
        assert r.status_code == 201, r.text
        aid = r.json()["id"]
        assert r.json()["artifact_code"].startswith("PTPOC")
        # entry.has_poc must flip true
        assert c.get(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin)).json()["has_poc"] in (True, 1)
        assert c.put(f"{API}/vulnerability-library/artifacts/{aid}", headers=H(admin),
                     json={"title": f"PoC {sfx} upd"}).status_code == 200
        assert c.delete(f"{API}/vulnerability-library/artifacts/{aid}", headers=H(admin)).status_code == 204
        # has_poc flips back false after artifact removed
        assert c.get(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin)).json()["has_poc"] in (False, 0)
        c.delete(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin))

    def test_category_crud(self, c, admin, sfx):
        r = c.post(f"{API}/vulnerability-library/categories", headers=H(admin),
                   json={"code": f"cat{sfx}", "name": f"Cat {sfx}"})
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        assert c.put(f"{API}/vulnerability-library/categories/{cid}", headers=H(admin),
                     json={"code": f"cat{sfx}", "name": f"Cat {sfx} upd"}).status_code == 200
        assert c.delete(f"{API}/vulnerability-library/categories/{cid}", headers=H(admin)).status_code == 204

    def test_filters_and_sort(self, c, admin, sfx):
        eid = c.post(f"{API}/vulnerability-library/entries", headers=H(admin),
                     json={"title": f"Filt {sfx}", "description": "d", "severity": "critical", "vendor": f"Vend{sfx}"}).json()["id"]
        # by severity
        assert c.get(f"{API}/vulnerability-library/entries", headers=H(admin), params={"severity": "critical"}).status_code == 200
        # by vendor substring
        r = c.get(f"{API}/vulnerability-library/entries", headers=H(admin), params={"vendor": f"Vend{sfx}"})
        assert r.status_code == 200 and any(e["id"] == eid for e in r.json()["items"])
        # sort by cvss
        assert c.get(f"{API}/vulnerability-library/entries", headers=H(admin), params={"sort": "-cvss_score"}).status_code == 200
        c.delete(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin))

    def test_import_export(self, c, admin, sfx):
        r = c.post(f"{API}/vulnerability-library/entries/import", headers=H(admin), json={"entries": [
            {"title": f"Imp1 {sfx}", "description": "i1", "severity": "low"},
            {"title": f"Imp2 {sfx}", "description": "i2", "severity": "medium"},
        ]})
        assert r.status_code == 200 and r.json()["created"] == 2
        # export json
        rj = c.get(f"{API}/vulnerability-library/entries/export", headers=H(admin), params={"format": "json"})
        assert rj.status_code == 200 and len(rj.content) > 0
        # export csv
        rc = c.get(f"{API}/vulnerability-library/entries/export", headers=H(admin), params={"format": "csv"})
        assert rc.status_code == 200 and b"vuln_code" in rc.content
        # cleanup imported
        for e in c.get(f"{API}/vulnerability-library/entries", headers=H(admin), params={"q": sfx}).json()["items"]:
            c.delete(f"{API}/vulnerability-library/entries/{e['id']}", headers=H(admin))

    def test_stats_shape(self, c, admin):
        r = c.get(f"{API}/vulnerability-library/stats", headers=H(admin))
        assert r.status_code == 200
        body = r.json()
        for key in ("total",):
            assert key in body

    def test_global_shared_visible_to_tenant_user(self, c, admin, sfx):
        # vuln library is NOT tenant-scoped: a tenant user must see admin's entry.
        eid = c.post(f"{API}/vulnerability-library/entries", headers=H(admin),
                     json={"title": f"Shared {sfx}", "description": "d", "severity": "high"}).json()["id"]
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"vl{sfx}", "name": f"VL{sfx}"}).json()["id"]
        em = f"vlu{sfx}@ex.com"
        c.post(f"{API}/system/users", headers=H(admin),
               json={"email": em, "password": "e2ePassw0rd!", "full_name": "u", "role": "tenant_admin", "tenant_id": tid, "data_scope": "tenant"})
        tu = login(c, em, "e2ePassw0rd!")
        r = c.get(f"{API}/vulnerability-library/entries", headers=H(tu), params={"q": sfx})
        assert r.status_code == 200 and any(e["id"] == eid for e in r.json()["items"])
        # cleanup
        c.delete(f"{API}/vulnerability-library/entries/{eid}", headers=H(admin))
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))


# ============================================================
#  System settings
# ============================================================
class TestSystemSettings:
    def test_tenant_lifecycle_and_auto_root_dept(self, c, admin, sfx):
        r = c.post(f"{API}/organization/tenants", headers=H(admin),
                   json={"code": f"t{sfx}", "name": f"T {sfx}", "max_users": 5})
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        detail = c.get(f"{API}/organization/tenants/{tid}", headers=H(admin)).json()
        assert detail["department_count"] >= 1   # auto root dept
        # update
        assert c.put(f"{API}/organization/tenants/{tid}", headers=H(admin),
                     json={"name": f"T {sfx} upd", "max_users": 10}).json()["name"] == f"T {sfx} upd"
        # duplicate code rejected
        assert c.post(f"{API}/organization/tenants", headers=H(admin),
                      json={"code": f"t{sfx}", "name": "dup"}).status_code == 400
        # suspend (soft delete)
        assert c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin)).status_code == 204

    def test_department_tree_nesting_and_delete_guard(self, c, admin, sfx):
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"d{sfx}", "name": f"D{sfx}"}).json()["id"]
        root = c.post(f"{API}/organization/departments", headers=H(admin), json={"name": f"Root {sfx}", "tenant_id": tid}).json()["id"]
        child = c.post(f"{API}/organization/departments", headers=H(admin), json={"name": f"Child {sfx}", "tenant_id": tid, "parent_id": root}).json()["id"]
        tree = c.get(f"{API}/organization/departments/tree", headers=H(admin), params={"tenant_id": tid}).json()["departments"]

        def find(nodes, nid):
            for n in nodes:
                if n["id"] == nid:
                    return n
                f = find(n.get("children", []), nid)
                if f:
                    return f
        root_node = find(tree, root)
        assert root_node and any(ch["id"] == child for ch in root_node["children"])
        # delete parent with child → 400
        assert c.delete(f"{API}/organization/departments/{root}", headers=H(admin)).status_code == 400
        # delete child ok, then parent ok
        assert c.delete(f"{API}/organization/departments/{child}", headers=H(admin)).status_code == 204
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))

    def test_department_cycle_is_rejected(self, c, admin, sfx):
        # Moving a department under one of its own descendants must be rejected,
        # otherwise the branch detaches from every root and vanishes from the tree.
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"cyc{sfx}", "name": f"CYC{sfx}"}).json()["id"]
        a = c.post(f"{API}/organization/departments", headers=H(admin), json={"name": f"A{sfx}", "tenant_id": tid}).json()["id"]
        b = c.post(f"{API}/organization/departments", headers=H(admin), json={"name": f"B{sfx}", "tenant_id": tid, "parent_id": a}).json()["id"]
        # A -> B would create cycle A->B->A
        r = c.put(f"{API}/organization/departments/{a}", headers=H(admin), json={"parent_id": b})
        assert r.status_code == 400, f"cycle should be rejected, got {r.status_code}"
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))

    def test_tenant_code_normalized(self, c, admin, sfx):
        # Codes are normalized (strip + lower); a case/space variant collides.
        code = f"Cx{sfx}"
        r1 = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": code, "name": f"CX{sfx}"})
        assert r1.status_code in (200, 201), r1.text
        tid = r1.json()["id"]
        assert r1.json()["code"] == code.lower()
        # Same code with different case / surrounding space must be rejected.
        r2 = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"  {code.upper()}  ", "name": "dup"})
        assert r2.status_code == 400
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))

    def test_suspended_tenant_blocks_login(self, c, admin, sfx):
        # A user in a suspended tenant cannot log in.
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"sus{sfx}", "name": f"SUS{sfx}"}).json()["id"]
        em = f"sus{sfx}@ex.com"
        c.post(f"{API}/system/users", headers=H(admin),
               json={"email": em, "password": "e2ePassw0rd!", "full_name": "U", "role": "user", "tenant_id": tid, "data_scope": "self"})
        # Works before suspension
        assert c.post(f"{API}/system/profile/login", json={"email": em, "password": "e2ePassw0rd!"}).status_code == 200
        # Suspend tenant → login now blocked (403)
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))
        r = c.post(f"{API}/system/profile/login", json={"email": em, "password": "e2ePassw0rd!"})
        assert r.status_code == 403, f"suspended-tenant login should be 403, got {r.status_code}"

    def test_user_org_assignment_and_promotion(self, c, admin, sfx):
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"u{sfx}", "name": f"U{sfx}"}).json()["id"]
        em = f"u{sfx}@ex.com"
        r = c.post(f"{API}/system/users", headers=H(admin),
                   json={"email": em, "password": "e2ePassw0rd!", "full_name": "U", "role": "user", "tenant_id": tid, "data_scope": "department"})
        assert r.status_code in (200, 201), r.text
        uid = r.json()["id"]
        assert r.json()["tenant_id"] == tid and r.json()["data_scope"] == "department"
        # promote to tenant admin
        assert c.post(f"{API}/organization/tenants/{tid}/admins", headers=H(admin), json={"user_id": uid}).status_code == 200
        assert c.get(f"{API}/system/users/{uid}", headers=H(admin)).json()["role"] == "tenant_admin"
        # demote back to user
        assert c.post(f"{API}/organization/tenants/{tid}/admins", headers=H(admin), json={"user_id": uid, "is_tenant_admin": False}).status_code == 200
        assert c.get(f"{API}/system/users/{uid}", headers=H(admin)).json()["role"] == "user"
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))

    def test_role_with_permissions(self, c, admin, sfx):
        perms = c.get(f"{API}/system/permissions", headers=H(admin)).json()
        pids = [p["id"] for p in (perms if isinstance(perms, list) else perms.get("items", []))][:3]
        rname = f"role_{sfx}"
        r = c.post(f"{API}/system/roles", headers=H(admin),
                   json={"name": rname, "display_name": f"R {sfx}", "description": "e2e", "permission_ids": pids})
        assert r.status_code in (200, 201), r.text
        assert len(c.get(f"{API}/system/roles/{rname}", headers=H(admin)).json()["permissions"]) >= 1
        assert c.put(f"{API}/system/roles/{rname}", headers=H(admin),
                     json={"permission_ids": pids[:1]}).status_code == 200
        assert c.delete(f"{API}/system/roles/{rname}", headers=H(admin)).status_code in (200, 204)

    def test_menu_crud(self, c, admin, sfx):
        r = c.post(f"{API}/menus", headers=H(admin),
                   json={"name": f"m{sfx}", "path": f"/x-{sfx}", "menu_type": "menu", "permission": "scan:read", "sort_order": 77})
        assert r.status_code in (200, 201), r.text
        mid = r.json()["id"]
        assert c.get(f"{API}/menus/tree", headers=H(admin)).status_code == 200
        assert c.delete(f"{API}/menus/{mid}", headers=H(admin)).status_code in (200, 204)

    def test_tenant_admin_boundaries(self, c, admin, sfx):
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"b{sfx}", "name": f"B{sfx}"}).json()["id"]
        other = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"o{sfx}", "name": f"O{sfx}"}).json()["id"]
        em = f"ta{sfx}@ex.com"
        c.post(f"{API}/system/users", headers=H(admin),
               json={"email": em, "password": "e2ePassw0rd!", "full_name": "TA", "role": "tenant_admin", "tenant_id": tid, "data_scope": "tenant"})
        ta = login(c, em, "e2ePassw0rd!")
        # cannot manage tenants
        assert c.get(f"{API}/organization/tenants", headers=H(ta)).status_code == 403
        # cannot view another tenant's dept tree
        assert c.get(f"{API}/organization/departments/tree", headers=H(ta), params={"tenant_id": other}).status_code == 403
        # can view own dept tree
        assert c.get(f"{API}/organization/departments/tree", headers=H(ta)).status_code == 200
        # creating a user is locked to own tenant
        r = c.post(f"{API}/system/users", headers=H(ta),
                   json={"email": f"tac{sfx}@ex.com", "password": "e2ePassw0rd!", "full_name": "x", "role": "user", "data_scope": "self"})
        assert r.status_code in (200, 201) and r.json()["tenant_id"] == tid
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))
        c.delete(f"{API}/organization/tenants/{other}", headers=H(admin))


# ============================================================
#  Audit log compliance (tenant-scoped list + export)
# ============================================================
class TestAuditCompliance:
    def test_platform_admin_lists_and_exports(self, c, admin):
        assert c.get(f"{API}/audit", headers=H(admin)).status_code == 200
        rc = c.get(f"{API}/audit/export", headers=H(admin), params={"format": "csv"})
        assert rc.status_code == 200 and b"action" in rc.content
        rj = c.get(f"{API}/audit/export", headers=H(admin), params={"format": "json"})
        assert rj.status_code == 200 and "logs" in rj.text

    def test_tenant_admin_sees_only_own_tenant_logs(self, c, admin, sfx):
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"aud{sfx}", "name": f"AUD{sfx}"}).json()["id"]
        em = f"aud{sfx}@ex.com"
        c.post(f"{API}/system/users", headers=H(admin),
               json={"email": em, "password": "e2ePassw0rd!", "full_name": "TA", "role": "tenant_admin", "tenant_id": tid, "data_scope": "tenant"})
        ta = login(c, em, "e2ePassw0rd!")
        # generate a tenant-scoped audit event
        c.post(f"{API}/organization/departments", headers=H(ta), json={"name": f"D{sfx}"})
        r = c.get(f"{API}/audit", headers=H(ta))
        assert r.status_code == 200
        tenant_ids = {log.get("tenant_id") for log in r.json()["logs"]}
        # every visible row belongs to this tenant (or the set is empty)
        assert tenant_ids <= {tid}
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))

    def test_normal_user_cannot_access_audit(self, c, admin, sfx):
        tid = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"na{sfx}", "name": f"NA{sfx}"}).json()["id"]
        em = f"na{sfx}@ex.com"
        c.post(f"{API}/system/users", headers=H(admin),
               json={"email": em, "password": "e2ePassw0rd!", "full_name": "U", "role": "user", "tenant_id": tid, "data_scope": "self"})
        u = login(c, em, "e2ePassw0rd!")
        assert c.get(f"{API}/audit", headers=H(u)).status_code == 403
        c.delete(f"{API}/organization/tenants/{tid}", headers=H(admin))


# ============================================================
#  Security: password policy + online sessions (RuoYi parity)
# ============================================================
class TestSecurityHardening:
    def test_weak_password_rejected_on_create(self, c, admin, sfx):
        # Missing character classes / common password → 400.
        for weak in ["password", "12345678", "alllowercase"]:
            r = c.post(f"{API}/system/users", headers=H(admin),
                       json={"email": f"weak{sfx}{weak[:3]}@ex.com", "password": weak, "full_name": "W", "role": "user"})
            assert r.status_code == 400, f"weak password {weak!r} should be rejected, got {r.status_code}"

    def test_strong_password_accepted(self, c, admin, sfx):
        r = c.post(f"{API}/system/users", headers=H(admin),
                   json={"email": f"strong{sfx}@ex.com", "password": "Str0ng!Pass", "full_name": "S", "role": "user"})
        assert r.status_code in (200, 201), r.text
        c.delete(f"{API}/system/users/{r.json()['id']}", headers=H(admin))

    def test_reset_password_enforces_policy_and_revokes(self, c, admin, sfx):
        em = f"rst{sfx}@ex.com"
        uid = c.post(f"{API}/system/users", headers=H(admin),
                     json={"email": em, "password": "Str0ng!Pass", "full_name": "R", "role": "user"}).json()["id"]
        # user logs in (creates a session)
        assert c.post(f"{API}/system/profile/login", json={"email": em, "password": "Str0ng!Pass"}).status_code == 200
        # weak reset rejected (>=8 chars but no character-class variety → policy 400;
        # too-short would be schema 422 — both are rejections)
        assert c.post(f"{API}/system/users/{uid}/reset-password", headers=H(admin), json={"new_password": "alllowercase"}).status_code == 400
        # strong reset ok
        assert c.post(f"{API}/system/users/{uid}/reset-password", headers=H(admin), json={"new_password": "N3w!Str0ng"}).status_code == 200
        c.delete(f"{API}/system/users/{uid}", headers=H(admin))

    def test_online_sessions_list_and_force_logout(self, c, admin, sfx):
        em = f"sess{sfx}@ex.com"
        c.post(f"{API}/system/users", headers=H(admin),
               json={"email": em, "password": "Str0ng!Pass", "full_name": "SS", "role": "user"})
        # create a session for that user
        assert c.post(f"{API}/system/profile/login", json={"email": em, "password": "Str0ng!Pass"}).status_code == 200
        sessions = c.get(f"{API}/system/sessions", headers=H(admin))
        assert sessions.status_code == 200
        target = next((s for s in sessions.json()["sessions"] if s["username"] == em), None)
        assert target is not None, "new session should be listed"
        # force-logout it
        assert c.delete(f"{API}/system/sessions/{target['jti']}", headers=H(admin)).status_code == 200

    def test_normal_user_cannot_manage_sessions(self, c, admin, sfx):
        em = f"nosess{sfx}@ex.com"
        c.post(f"{API}/system/users", headers=H(admin),
               json={"email": em, "password": "Str0ng!Pass", "full_name": "N", "role": "user"})
        tok = login(c, em, "Str0ng!Pass")
        assert c.get(f"{API}/system/sessions", headers=H(tok)).status_code == 403


# ============================================================
#  App security detection (apptest)
# ============================================================
class TestAppTest:
    def test_config_read_and_masking(self, c, admin):
        r = c.get(f"{API}/apptest/config", headers=H(admin))
        assert r.status_code == 200
        body = r.json()
        assert "base_url" in body
        # secret is masked (never returns full plain secret with a real value)
        sec = body.get("client_secret", "")
        assert sec == "" or "****" in sec

    def test_config_update_guarded_by_live_login(self, c, admin, sfx):
        # update_config performs a live iJiami login before saving; offline → 400.
        r = c.post(f"{API}/apptest/config", headers=H(admin),
                   json={"base_url": "https://rundet.ijiami.cn", "client_id": f"cid{sfx}"})
        assert r.status_code in (200, 400)

    @pytest.mark.parametrize("path", ["/apptest/assets", "/apptest/strategies", "/apptest/statistics"])
    def test_external_ijiami_endpoints(self, c, admin, path):
        # These proxy to the external iJiami cloud — 200 when configured, 502 offline.
        r = c.get(f"{API}{path}", headers=H(admin))
        assert r.status_code in (200, 502)

    def test_task_create_list_detail(self, c, admin, sfx):
        r = c.post(f"{API}/apptest/tasks", headers=H(admin),
                   data={"name": f"App {sfx}", "terminal_type": "1"}, files=apk_file())
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        assert r.json()["status"] in ("uploading", "pending", "running", "failed")
        assert c.get(f"{API}/apptest/tasks/{tid}", headers=H(admin)).status_code == 200
        assert c.get(f"{API}/apptest/tasks/{tid}/status", headers=H(admin)).status_code in (200, 502)
        # list filters
        assert c.get(f"{API}/apptest/tasks", headers=H(admin), params={"terminal_type": 1}).status_code == 200
        assert c.get(f"{API}/apptest/tasks", headers=H(admin), params={"page": 1, "per_page": 10}).status_code == 200
        c.delete(f"{API}/apptest/tasks/{tid}", headers=H(admin))

    def test_empty_file_rejected(self, c, admin):
        r = c.post(f"{API}/apptest/tasks", headers=H(admin),
                   data={"name": "empty", "terminal_type": "1"},
                   files={"file": ("e.apk", b"", "application/octet-stream")})
        assert r.status_code == 400

    def test_task_tenant_isolation(self, c, admin, sfx):
        tA = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"aa{sfx}", "name": f"AA{sfx}"}).json()["id"]
        tB = c.post(f"{API}/organization/tenants", headers=H(admin), json={"code": f"ab{sfx}", "name": f"AB{sfx}"}).json()["id"]

        def mk(tid):
            em = f"ap{uuid.uuid4().hex[:6]}@ex.com"
            c.post(f"{API}/system/users", headers=H(admin),
                   json={"email": em, "password": "e2ePassw0rd!", "full_name": "u", "role": "tenant_admin", "tenant_id": tid, "data_scope": "tenant"})
            return login(c, em, "e2ePassw0rd!")

        uA, uB = mk(tA), mk(tB)
        aA = c.post(f"{API}/apptest/tasks", headers=H(uA), data={"name": f"tA{sfx}", "terminal_type": "1"}, files=apk_file()).json()["id"]
        aB = c.post(f"{API}/apptest/tasks", headers=H(uB), data={"name": f"tB{sfx}", "terminal_type": "1"}, files=apk_file()).json()["id"]
        idsA = {t["id"] for t in c.get(f"{API}/apptest/tasks", headers=H(uA)).json()["tasks"]}
        assert aA in idsA and aB not in idsA
        # cross-tenant direct fetch → 404 (auto ORM tenant filter)
        assert c.get(f"{API}/apptest/tasks/{aB}", headers=H(uA)).status_code == 404
        # platform admin sees both
        idsAll = {t["id"] for t in c.get(f"{API}/apptest/tasks", headers=H(admin)).json()["tasks"]}
        assert aA in idsAll and aB in idsAll
        c.delete(f"{API}/apptest/tasks/{aA}", headers=H(admin))
        c.delete(f"{API}/apptest/tasks/{aB}", headers=H(admin))
        c.delete(f"{API}/organization/tenants/{tA}", headers=H(admin))
        c.delete(f"{API}/organization/tenants/{tB}", headers=H(admin))
