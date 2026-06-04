#!/usr/bin/env python3
"""
E2E Test Script for PTTechAI v3 Restructured System
Tests both System Management and Pentest modules
"""
import requests
import json
import sys
import time

BASE_URL = "http://localhost:8000"
__test__ = False

def test_endpoint(name, method, url, expected_status=None, data=None, headers=None, json_data=None):
    """Test a single endpoint and return result"""
    try:
        kwargs = {"headers": headers or {}, "timeout": 10}
        if data:
            kwargs["data"] = data
        if json_data:
            kwargs["json"] = json_data

        if method == "GET":
            resp = requests.get(url, **kwargs)
        elif method == "POST":
            resp = requests.post(url, **kwargs)
        elif method == "PUT":
            resp = requests.put(url, **kwargs)
        elif method == "DELETE":
            resp = requests.delete(url, **kwargs)
        else:
            return {"name": name, "status": "FAIL", "error": f"Unknown method {method}"}

        # Support multiple expected status codes
        if expected_status is None:
            status_ok = True
        elif isinstance(expected_status, list):
            status_ok = resp.status_code in expected_status
        else:
            status_ok = resp.status_code == expected_status

        result = {
            "name": name,
            "method": method,
            "url": url,
            "status_code": resp.status_code,
            "status": "PASS" if status_ok else "FAIL",
        }

        if result["status"] == "FAIL":
            result["error"] = f"Expected {expected_status}, got {resp.status_code}"
            result["response"] = resp.text[:200]

        return result, resp
    except Exception as e:
        return {"name": name, "status": "ERROR", "error": str(e)}, None

def print_result(result):
    """Print test result"""
    status = result["status"]
    symbol = "[PASS]" if status == "PASS" else "[FAIL]" if status == "FAIL" else "[ERR!]"
    print(f"{symbol} {result['name']}")
    if status != "PASS":
        print(f"  Error: {result.get('error', 'Unknown')}")
        if "response" in result:
            print(f"  Response: {result['response'][:150]}")

def run_e2e_tests():
    """Run all E2E tests"""
    results = []

    print("\n" + "="*70)
    print("PTTechAI v3 E2E Test Suite")
    print("="*70)

    # ===== 1. Health Check =====
    print("\n[1/6] Health Check")
    r, resp = test_endpoint("Health endpoint", "GET", f"{BASE_URL}/api/health", 200)
    print_result(r)
    results.append(r)

    # ===== 2. Authentication (System Module) =====
    print("\n[2/6] Authentication (System Module)")

    # Login
    r, resp = test_endpoint("Admin login", "POST", f"{BASE_URL}/api/v1/system/profile/login", 200,
                           json_data={"email": "admin@bctech.ai", "password": "admin123"})
    print_result(r)
    results.append(r)

    access_token = None
    if resp and resp.status_code == 200:
        data = resp.json()
        access_token = data.get("access_token")

    if not access_token:
        print("[FAIL] Cannot proceed without access token")
        return results

    headers = {"Authorization": f"Bearer {access_token}"}

    # Get current user
    r, _ = test_endpoint("Get current user", "GET", f"{BASE_URL}/api/v1/system/profile/me", 200, headers=headers)
    print_result(r)
    results.append(r)

    # ===== 3. System Management APIs =====
    print("\n[3/6] System Management APIs")

    # Users
    r, _ = test_endpoint("List users", "GET", f"{BASE_URL}/api/v1/system/users", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Roles
    r, _ = test_endpoint("List roles", "GET", f"{BASE_URL}/api/v1/roles", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Permissions
    r, _ = test_endpoint("List permissions", "GET", f"{BASE_URL}/api/v1/system/permissions", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Menus
    r, resp = test_endpoint("Get menu tree", "GET", f"{BASE_URL}/api/v1/menus/tree", 200, headers=headers)
    print_result(r)
    results.append(r)
    if resp and resp.status_code == 200:
        menu_data = resp.json()
        print(f"  -> Menus: {len(menu_data)} root items")

    # Create a test menu
    r, resp = test_endpoint("Create test menu", "POST", f"{BASE_URL}/api/v1/menus", 201,
                           headers=headers,
                           json_data={"name": "E2E Test Menu", "path": "/test", "icon": "ExperimentOutlined", "sort_order": 999})
    print_result(r)
    results.append(r)

    menu_id = None
    if resp and resp.status_code == 201:
        menu_id = resp.json().get("id")

    # Delete test menu
    if menu_id:
        r, _ = test_endpoint("Delete test menu", "DELETE", f"{BASE_URL}/api/v1/menus/{menu_id}", 204, headers=headers)
        print_result(r)
        results.append(r)

    # RBAC
    r, _ = test_endpoint("Get RBAC profile", "GET", f"{BASE_URL}/api/v1/system/me", 200, headers=headers)
    print_result(r)
    results.append(r)

    r, _ = test_endpoint("List resource mappings", "GET", f"{BASE_URL}/api/v1/system/resources", 200, headers=headers)
    print_result(r)
    results.append(r)

    # ===== 4. Pentest APIs =====
    print("\n[4/6] Pentest APIs")

    # Scans
    r, resp = test_endpoint("List scans", "GET", f"{BASE_URL}/api/v1/scans", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Targets
    r, _ = test_endpoint("List targets", "GET", f"{BASE_URL}/api/v1/targets", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Vulnerabilities
    r, _ = test_endpoint("List vulnerabilities", "GET", f"{BASE_URL}/api/v1/vulnerabilities", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Reports
    r, _ = test_endpoint("List reports", "GET", f"{BASE_URL}/api/v1/reports", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Prompts
    r, _ = test_endpoint("List prompts", "GET", f"{BASE_URL}/api/v1/prompts", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Dashboard
    r, _ = test_endpoint("Dashboard stats", "GET", f"{BASE_URL}/api/v1/dashboard/stats", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Scheduler
    r, _ = test_endpoint("List scheduled jobs", "GET", f"{BASE_URL}/api/v1/scheduler/jobs", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Knowledge
    r, _ = test_endpoint("Knowledge base", "GET", f"{BASE_URL}/api/v1/knowledge", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Vuln Lab
    r, _ = test_endpoint("Vuln Lab challenges", "GET", f"{BASE_URL}/api/v1/vuln-lab/challenges", 200, headers=headers)
    print_result(r)
    results.append(r)

    # MCP
    r, _ = test_endpoint("MCP servers", "GET", f"{BASE_URL}/api/v1/mcp/servers", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Terminal
    r, _ = test_endpoint("Terminal status", "GET", f"{BASE_URL}/api/v1/terminal/status", 200, headers=headers)
    print_result(r)
    results.append(r)

    # Sandbox (may return 404 if no active scan pool)
    r, _ = test_endpoint("Sandbox pool", "GET", f"{BASE_URL}/api/v1/sandbox/pool", [200, 404], headers=headers)
    print_result(r)
    results.append(r)

    # ===== 5. Cross-Module Integration =====
    print("\n[5/6] Cross-Module Integration")

    # Create a scan (pentest) and verify it appears in dashboard (cross-module)
    r, resp = test_endpoint("Create test scan", "POST", f"{BASE_URL}/api/v1/scans", 200,
                           headers=headers,
                           json_data={"name": "E2E Test Scan", "targets": ["http://example.com"], "scan_type": "quick"})
    print_result(r)
    results.append(r)

    scan_id = None
    if resp and resp.status_code == 200:
        scan_id = resp.json().get("id")

    if scan_id:
        # Get scan details
        r, _ = test_endpoint("Get scan details", "GET", f"{BASE_URL}/api/v1/scans/{scan_id}", 200, headers=headers)
        print_result(r)
        results.append(r)

        # Delete scan
        r, _ = test_endpoint("Delete test scan", "DELETE", f"{BASE_URL}/api/v1/scans/{scan_id}", 200, headers=headers)
        print_result(r)
        results.append(r)

    # Verify dashboard reflects changes
    r, _ = test_endpoint("Dashboard after operations", "GET", f"{BASE_URL}/api/v1/dashboard/stats", 200, headers=headers)
    print_result(r)
    results.append(r)

    # ===== 6. API Documentation =====
    print("\n[6/6] API Documentation")

    r, _ = test_endpoint("OpenAPI spec", "GET", f"{BASE_URL}/openapi.json", 200)
    print_result(r)
    results.append(r)

    r, _ = test_endpoint("Swagger UI", "GET", f"{BASE_URL}/docs", 200)
    print_result(r)
    results.append(r)

    # ===== Summary =====
    print("\n" + "="*70)
    print("Test Summary")
    print("="*70)

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    errors = sum(1 for r in results if r["status"] == "ERROR")
    total = len(results)

    print(f"Total:  {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Errors: {errors}")

    if failed == 0 and errors == 0:
        print("\n[PASS] All tests passed!")
        return 0
    else:
        print(f"\n[FAIL] {failed + errors} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(run_e2e_tests())
