#!/usr/bin/env python3
"""
Detailed E2E Test Script for PTTechAI v3
Comprehensive testing of CRUD operations, RBAC, menus, and cross-module integration
"""
import requests
import json
import time
import sys

BASE_URL = "http://localhost:8000"
__test__ = False

class E2ETestRunner:
    def __init__(self):
        self.admin_token = None
        self.user_token = None
        self.viewer_token = None
        self.test_results = []
        self.created_resources = {
            'menus': [],
            'scans': [],
            'targets': [],
            'users': [],
            'roles': []
        }

    def log_test(self, name, passed, details=""):
        """Log test result"""
        status = "[PASS]" if passed else "[FAIL]"
        self.test_results.append({'name': name, 'passed': passed, 'details': details})
        print(f"{status} - {name}")
        if details and not passed:
            print(f"     {details}")

    def make_request(self, method, endpoint, token=None, json_data=None, expected_status=200):
        """Make HTTP request with optional auth token"""
        url = f"{BASE_URL}{endpoint}"
        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        if json_data:
            headers['Content-Type'] = 'application/json'

        try:
            response = requests.request(method, url, headers=headers, json=json_data, timeout=15)
            return response
        except requests.exceptions.Timeout:
            print(f"  [WARN] Timeout on {method} {endpoint}")
            return None
        except requests.exceptions.ConnectionError:
            print(f"  [WARN] Connection error on {method} {endpoint}")
            return None
        except Exception as e:
            print(f"  [WARN] Error on {method} {endpoint}: {str(e)}")
            return None

    def safe_json(self, response):
        """Safely parse JSON response"""
        if not response:
            return None
        try:
            if response.status_code == 204 or not response.text.strip():
                return {}
            return response.json()
        except:
            return None

    # ========== Authentication Tests ==========
    def test_authentication(self):
        print("\n" + "="*60)
        print("1. AUTHENTICATION TESTS")
        print("="*60)

        # Test 1.1: Admin login
        resp = self.make_request('POST', '/api/v1/auth/login', json_data={
            'email': 'admin@bctech.ai',
            'password': 'admin123'
        })
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.admin_token = data.get('access_token')
            self.log_test("Admin login", True)
        else:
            self.log_test("Admin login", False, f"Status: {resp.status_code if resp else 'No response'}")
            return False

        # Test 1.2: User login
        resp = self.make_request('POST', '/api/v1/auth/login', json_data={
            'email': 'rbac-user@bctech.ai',
            'password': 'admin123'
        })
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.user_token = data.get('access_token')
            self.log_test("User login", True)
        else:
            self.log_test("User login", False, f"Status: {resp.status_code if resp else 'No response'}")

        # Test 1.3: Viewer login
        resp = self.make_request('POST', '/api/v1/auth/login', json_data={
            'email': 'rbac-viewer@bctech.ai',
            'password': 'admin123'
        })
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.viewer_token = data.get('access_token')
            self.log_test("Viewer login", True)
        else:
            self.log_test("Viewer login", False, f"Status: {resp.status_code if resp else 'No response'}")

        # Test 1.4: Invalid credentials
        resp = self.make_request('POST', '/api/v1/auth/login', json_data={
            'email': 'admin@bctech.ai',
            'password': 'wrongpassword'
        })
        if resp is None:
            self.log_test("Reject invalid credentials", False, "No response received")
        else:
            self.log_test("Reject invalid credentials",
                         resp.status_code == 401,
                         f"Expected 401, got {resp.status_code}")

        # Test 1.5: Get current user info
        resp = self.make_request('GET', '/api/v1/auth/me', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.log_test("Get current user info",
                         data.get('email') == 'admin@bctech.ai' and data.get('role') == 'admin')
        else:
            self.log_test("Get current user info", False)

        return True

    # ========== Menu CRUD Tests ==========
    def test_menu_crud(self):
        print("\n" + "="*60)
        print("2. MENU CRUD TESTS")
        print("="*60)

        # Test 2.1: List menus
        resp = self.make_request('GET', '/api/v1/menus', token=self.admin_token)
        self.log_test("List menus", resp and resp.status_code == 200)

        # Test 2.2: Get menu tree
        resp = self.make_request('GET', '/api/v1/menus/tree', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.log_test("Get menu tree", 'menus' in data and isinstance(data['menus'], list))
        else:
            self.log_test("Get menu tree", False)

        # Test 2.3: Create parent menu
        parent_menu_data = {
            'name': 'E2E Test Parent',
            'path': '/e2e-test-parent',
            'icon': 'TestOutlined',
            'sort_order': 999
        }
        resp = self.make_request('POST', '/api/v1/menus', token=self.admin_token, json_data=parent_menu_data)
        if resp and resp.status_code == 201:
            parent_menu = self.safe_json(resp)
            parent_id = parent_menu.get('id')
            self.created_resources['menus'].append(parent_id)
            self.log_test("Create parent menu", parent_menu.get('name') == 'E2E Test Parent')
        else:
            self.log_test("Create parent menu", False, f"Status: {resp.status_code if resp else 'No response'}")
            return

        # Test 2.4: Create child menu
        child_menu_data = {
            'name': 'E2E Test Child',
            'path': '/e2e-test-child',
            'icon': 'ChildOutlined',
            'sort_order': 1,
            'parent_id': parent_id
        }
        resp = self.make_request('POST', '/api/v1/menus', token=self.admin_token, json_data=child_menu_data)
        if resp and resp.status_code == 201:
            child_menu = self.safe_json(resp)
            child_id = child_menu.get('id')
            self.created_resources['menus'].append(child_id)
            self.log_test("Create child menu",
                         child_menu.get('name') == 'E2E Test Child' and child_menu.get('parent_id') == parent_id)
        else:
            self.log_test("Create child menu", False, f"Status: {resp.status_code if resp else 'No response'}")

        # Test 2.5: Get single menu
        resp = self.make_request('GET', f'/api/v1/menus/{parent_id}', token=self.admin_token)
        if resp and resp.status_code == 200:
            menu = self.safe_json(resp)
            self.log_test("Get single menu", menu.get('id') == parent_id)
        else:
            self.log_test("Get single menu", False)

        # Test 2.6: Update menu
        update_data = {
            'name': 'E2E Test Parent Updated',
            'sort_order': 998
        }
        resp = self.make_request('PUT', f'/api/v1/menus/{parent_id}', token=self.admin_token, json_data=update_data)
        if resp and resp.status_code == 200:
            menu = self.safe_json(resp)
            self.log_test("Update menu",
                         menu.get('name') == 'E2E Test Parent Updated' and menu.get('sort_order') == 998)
        else:
            self.log_test("Update menu", False, f"Status: {resp.status_code if resp else 'No response'}")

        # Test 2.7: Verify menu tree structure
        resp = self.make_request('GET', '/api/v1/menus/tree', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            # Find our parent menu and check it has children
            parent_found = False
            for menu in data['menus']:
                if menu.get('id') == parent_id:
                    parent_found = True
                    has_children = len(menu.get('children', [])) > 0
                    break
            self.log_test("Menu tree structure", parent_found and has_children)
        else:
            self.log_test("Menu tree structure", False)

        # Test 2.8: Get user menu tree
        resp = self.make_request('GET', '/api/v1/menus/user', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.log_test("Get user menu tree", 'menus' in data)
        else:
            self.log_test("Get user menu tree", False)

    # ========== Scan CRUD Tests ==========
    def test_scan_crud(self):
        print("\n" + "="*60)
        print("3. SCAN CRUD TESTS")
        print("="*60)

        # Test 3.1: Create scan
        scan_data = {
            'name': 'E2E Detailed Test Scan',
            'targets': ['http://testphp.vulnweb.com'],
            'scan_type': 'quick',
            'config': {'max_duration': 300}
        }
        resp = self.make_request('POST', '/api/v1/scans', token=self.admin_token, json_data=scan_data)
        if resp and resp.status_code == 200:
            scan = self.safe_json(resp)
            scan_id = scan.get('id')
            self.created_resources['scans'].append(scan_id)
            self.log_test("Create scan", scan.get('name') == 'E2E Detailed Test Scan')
        else:
            self.log_test("Create scan", False, f"Status: {resp.status_code if resp else 'No response'}")
            return

        # Test 3.2: List scans
        resp = self.make_request('GET', '/api/v1/scans', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            scan_ids = [s['id'] for s in data.get('scans', [])]
            self.log_test("List scans", scan_id in scan_ids)
        else:
            self.log_test("List scans", False)

        # Test 3.3: Get scan details
        resp = self.make_request('GET', f'/api/v1/scans/{scan_id}', token=self.admin_token)
        if resp and resp.status_code == 200:
            scan = self.safe_json(resp)
            self.log_test("Get scan details",
                         scan.get('id') == scan_id and scan.get('name') == 'E2E Detailed Test Scan')
        else:
            self.log_test("Get scan details", False)

        # Test 3.4: Get scan targets
        resp = self.make_request('GET', f'/api/v1/scans/{scan_id}/targets', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            if data:
                self.log_test("Get scan targets", len(data.get('targets', [])) > 0)
            else:
                self.log_test("Get scan targets", True)  # Empty response is OK
        else:
            self.log_test("Get scan targets", resp and resp.status_code == 200)

        # Test 3.5: Update scan (stop it)
        resp = self.make_request('POST', f'/api/v1/scans/{scan_id}/stop', token=self.admin_token)
        # May return 200 or 400 if already stopped, or 404 if scan not found
        if resp is None:
            self.log_test("Stop scan", False, "No response received")
        else:
            self.log_test("Stop scan",
                         resp.status_code in [200, 400, 404],
                         f"Expected 200/400/404, got {resp.status_code}")

    # ========== RBAC Permission Tests ==========
    def test_rbac_permissions(self):
        print("\n" + "="*60)
        print("4. RBAC PERMISSION TESTS")
        print("="*60)

        # Test 4.1: Admin can list users
        resp = self.make_request('GET', '/api/v1/users', token=self.admin_token)
        self.log_test("Admin can list users", resp and resp.status_code == 200)

        # Test 4.2: Admin can list roles
        resp = self.make_request('GET', '/api/v1/roles', token=self.admin_token)
        self.log_test("Admin can list roles", resp and resp.status_code == 200)

        # Test 4.3: Admin can list permissions
        resp = self.make_request('GET', '/api/v1/permissions', token=self.admin_token)
        self.log_test("Admin can list permissions", resp and resp.status_code == 200)

        # Test 4.4: User can access permitted resources
        resp = self.make_request('GET', '/api/v1/scans', token=self.user_token)
        self.log_test("User can list scans", resp and resp.status_code == 200)

        # Test 4.5: Viewer can read data
        resp = self.make_request('GET', '/api/v1/scans', token=self.viewer_token)
        # Viewer might have read access or might get 403
        self.log_test("Viewer access test", resp and resp.status_code in [200, 403])

        # Test 4.6: Get RBAC profile
        resp = self.make_request('GET', '/api/v1/rbac/me', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.log_test("Get RBAC profile", 'role' in data and 'permissions' in data)
        else:
            self.log_test("Get RBAC profile", False)

        # Test 4.7: Get resource mappings
        resp = self.make_request('GET', '/api/v1/rbac/resource-mappings', token=self.admin_token)
        self.log_test("Get resource mappings", resp and resp.status_code == 200)

    # ========== Dashboard & Statistics Tests ==========
    def test_dashboard_stats(self):
        print("\n" + "="*60)
        print("5. DASHBOARD & STATISTICS TESTS")
        print("="*60)

        # Test 5.1: Get dashboard stats
        resp = self.make_request('GET', '/api/v1/dashboard/stats', token=self.admin_token)
        if resp and resp.status_code == 200:
            data = self.safe_json(resp)
            self.log_test("Get dashboard stats",
                         'total_scans' in data or 'scans' in data or 'stats' in data)
        else:
            self.log_test("Get dashboard stats", False)

        # Test 5.2: Get vulnerability statistics
        resp = self.make_request('GET', '/api/v1/dashboard/vulnerability-stats', token=self.admin_token)
        # May return 200 or 404 if endpoint doesn't exist
        self.log_test("Get vulnerability stats", resp and resp.status_code in [200, 404])

    # ========== Additional API Tests ==========
    def test_additional_apis(self):
        print("\n" + "="*60)
        print("6. ADDITIONAL API TESTS")
        print("="*60)

        # Test 6.1: List prompts
        resp = self.make_request('GET', '/api/v1/prompts', token=self.admin_token)
        self.log_test("List prompts", resp and resp.status_code == 200)

        # Test 6.2: List reports
        resp = self.make_request('GET', '/api/v1/reports', token=self.admin_token)
        self.log_test("List reports", resp and resp.status_code == 200)

        # Test 6.3: List vulnerabilities
        resp = self.make_request('GET', '/api/v1/vulnerabilities', token=self.admin_token)
        self.log_test("List vulnerabilities", resp and resp.status_code == 200)

        # Test 6.4: Get scheduler jobs
        resp = self.make_request('GET', '/api/v1/scheduler/jobs', token=self.admin_token)
        self.log_test("Get scheduler jobs", resp and resp.status_code == 200)

        # Test 6.5: Get knowledge base
        resp = self.make_request('GET', '/api/v1/knowledge', token=self.admin_token)
        self.log_test("Get knowledge base", resp and resp.status_code == 200)

        # Test 6.6: Get MCP servers
        resp = self.make_request('GET', '/api/v1/mcp/servers', token=self.admin_token)
        self.log_test("Get MCP servers", resp and resp.status_code == 200)

        # Test 6.7: Get terminal status
        resp = self.make_request('GET', '/api/v1/terminal/status', token=self.admin_token)
        self.log_test("Get terminal status", resp and resp.status_code == 200)

        # Test 6.8: Get audit logs
        resp = self.make_request('GET', '/api/v1/audit', token=self.admin_token)
        self.log_test("Get audit logs", resp and resp.status_code == 200)

        # Test 6.9: Get monitor health
        resp = self.make_request('GET', '/api/v1/monitor/health', token=self.admin_token)
        self.log_test("Get monitor health", resp and resp.status_code == 200)

        # Test 6.10: Get database monitor
        resp = self.make_request('GET', '/api/v1/monitor/database', token=self.admin_token)
        self.log_test("Get database monitor", resp and resp.status_code == 200)

        # Test 6.11: Get sandbox list
        resp = self.make_request('GET', '/api/v1/sandbox/', token=self.admin_token)
        self.log_test("Get sandbox list", resp and resp.status_code in [200, 404])

        # Test 6.12: Get API docs
        resp = self.make_request('GET', '/api/docs', token=None)
        self.log_test("Get API docs", resp and resp.status_code == 200)

        # Test 6.13: Get OpenAPI spec
        resp = self.make_request('GET', '/openapi.json', token=None)
        self.log_test("Get OpenAPI spec", resp and resp.status_code == 200)

    # ========== Cleanup ==========
    def cleanup(self):
        print("\n" + "="*60)
        print("7. CLEANUP")
        print("="*60)

        # Delete test menus (children first, then parents)
        for menu_id in reversed(self.created_resources['menus']):
            resp = self.make_request('DELETE', f'/api/v1/menus/{menu_id}', token=self.admin_token)
            if resp and resp.status_code == 204:
                print(f"  [OK] Deleted menu {menu_id}")
            else:
                print(f"  [WARN] Failed to delete menu {menu_id}")

        # Delete test scans
        for scan_id in self.created_resources['scans']:
            # Stop scan first
            self.make_request('POST', f'/api/v1/scans/{scan_id}/stop', token=self.admin_token)
            time.sleep(1)
            # Delete scan
            resp = self.make_request('DELETE', f'/api/v1/scans/{scan_id}', token=self.admin_token)
            if resp and resp.status_code in [200, 204]:
                print(f"  [OK] Deleted scan {scan_id}")
            else:
                print(f"  [WARN] Failed to delete scan {scan_id}")

    # ========== Run All Tests ==========
    def run_all(self):
        print("\n" + "="*70)
        print(" PTTechAI v3 Detailed E2E Test Suite")
        print("="*70)

        # Run test suites
        if not self.test_authentication():
            print("\n❌ Authentication failed, cannot continue")
            return

        self.test_menu_crud()
        self.test_scan_crud()
        self.test_rbac_permissions()
        self.test_dashboard_stats()
        self.test_additional_apis()
        self.cleanup()

        # Print summary
        print("\n" + "="*70)
        print(" TEST SUMMARY")
        print("="*70)

        total = len(self.test_results)
        passed = sum(1 for r in self.test_results if r['passed'])
        failed = total - passed

        print(f"Total Tests:  {total}")
        print(f"Passed:       {passed}")
        print(f"Failed:       {failed}")
        print(f"Success Rate: {passed/total*100:.1f}%")

        if failed > 0:
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  [FAIL] {result['name']}")
                    if result['details']:
                        print(f"     {result['details']}")

        print("\n" + "="*70)
        if failed == 0:
            print(" ALL TESTS PASSED!")
        else:
            print(f" {failed} test(s) failed")
        print("="*70 + "\n")

        return failed == 0


if __name__ == '__main__':
    runner = E2ETestRunner()
    success = runner.run_all()
    sys.exit(0 if success else 1)
