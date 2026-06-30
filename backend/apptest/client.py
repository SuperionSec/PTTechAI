"""iJiami (爱加密) API HTTP client with OAuth2 authentication."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import time
from typing import Any

import httpx

from backend.common.config import settings


class IJiamiError(Exception):
    """iJiami API error."""

    def __init__(self, message: str, code: int | None = None, response_data: dict | None = None):
        super().__init__(message)
        self.code = code
        self.response_data = response_data or {}


class IJiamiClient:
    """Async HTTP client for iJiami detection platform API."""

    def __init__(
        self,
        base_url: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        username: str | None = None,
        password: str | None = None,
    ):
        self.base_url = (base_url or settings.IJIAMI_BASE_URL or "https://rundet.ijiami.cn").rstrip("/")
        self.client_id = client_id or settings.IJIAMI_CLIENT_ID or ""
        self.client_secret = client_secret or settings.IJIAMI_CLIENT_SECRET or ""
        self.username = username or settings.IJIAMI_USERNAME or ""
        self.password = password or settings.IJIAMI_PASSWORD or ""
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0
        self._client: httpx.AsyncClient | None = None
        self._token_lock = asyncio.Lock()

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            # Generous write/read timeouts: large APK/IPA/AAB uploads (tens of MB)
            # need a long write window, and iJiami report/detail calls can be slow.
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(300.0, connect=30.0, write=600.0),
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def _ensure_token(self) -> str:
        """Ensure access token is valid, refresh if needed.

        Uses a lock so concurrent requests don't all fire a refresh at once;
        the second waiter re-checks validity and reuses the freshly set token.
        """
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token
        async with self._token_lock:
            # Re-check after acquiring the lock: another coroutine may have
            # already refreshed while we waited.
            if self._access_token and time.time() < self._token_expires_at - 60:
                return self._access_token
            return await self._refresh_token()

    async def _refresh_token(self) -> str:
        """OAuth2 password grant to get new access token."""
        if not all([self.client_id, self.client_secret, self.username, self.password]):
            raise IJiamiError("iJiami credentials not configured")

        credentials = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        headers = {"Authorization": f"Basic {credentials}"}
        data = {
            "username": self.username,
            "password": hashlib.md5(self.password.encode()).hexdigest(),
            "grant_type": "password",
        }

        response = await self.client.post("/detection/oauth/token", data=data, headers=headers)
        result = self._parse_response(response)

        self._access_token = result.get("access_token")
        if not self._access_token:
            raise IJiamiError("Failed to obtain access token", response_data=result)

        expires_in = result.get("expires_in", 43199)
        self._token_expires_at = time.time() + expires_in
        return self._access_token

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def _parse_response(self, response: httpx.Response) -> dict[str, Any]:
        """Parse API response and raise on error."""
        try:
            data = response.json()
        except Exception:
            data = {"raw": response.text}
        if not isinstance(data, dict):
            # iJiami sometimes returns a bare list/string; wrap for uniform access.
            data = {"data": data}

        def _msg(default: str) -> str:
            m = data.get("message") or data.get("msg")
            if m:
                return str(m)
            text = (response.text or "").strip()
            return text[:200] if text else default

        if response.status_code >= 400:
            raise IJiamiError(
                f"HTTP {response.status_code}: {_msg(response.reason_phrase or 'request failed')}",
                code=response.status_code,
                response_data=data,
            )

        # iJiami business status check.
        # Success markers: code 200/10000, or status 200.
        # Failure markers: status >= 201 (e.g. 201 文件解析失败, 400 账号或密码错误),
        # or code outside the success set.
        success = {"200", "10000"}
        code = data.get("code")
        status = data.get("status")
        if code is not None and str(code) not in success:
            raise IJiamiError(
                _msg(f"Business error: {code}"),
                code=code,
                response_data=data,
            )
        if status is not None and str(status) not in success:
            raise IJiamiError(
                _msg(f"Business error: {status}"),
                code=status,
                response_data=data,
            )

        return data

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    async def login(self) -> dict[str, Any]:
        """Manual login to test credentials."""
        token = await self._refresh_token()
        return {"access_token": token, "expires_at": self._token_expires_at}

    # ------------------------------------------------------------------
    # Assets
    # ------------------------------------------------------------------
    async def upload_asset(
        self,
        file_content: bytes,
        filename: str,
        assets_name: str | None = None,
        terminal_type: int = 1,
    ) -> dict[str, Any]:
        """Upload an app file to iJiami."""
        token = await self._ensure_token()
        files = {"file": (filename, file_content)}
        data = {
            "assetsName": assets_name or filename,
            "terminalType": terminal_type,
        }
        headers = {"Authorization": f"Bearer {token}"}
        response = await self.client.post(
            "/detection/api/detection/upload",
            data=data,
            files=files,
            headers=headers,
        )
        return self._parse_response(response)

    async def list_assets(
        self,
        app_name: str | None = None,
        terminal_type: int | None = None,
        assert_id: str | None = None,
    ) -> dict[str, Any]:
        """Query uploaded assets."""
        token = await self._ensure_token()
        params: dict[str, Any] = {}
        if app_name:
            params["appName"] = app_name
        if terminal_type is not None:
            params["terminalType"] = terminal_type
        if assert_id:
            params["assertId"] = assert_id
        response = await self.client.get(
            "/detection/api/detection/assert",
            params=params,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    async def upload_and_detect(
        self,
        file_content: bytes,
        filename: str,
        template_id: str | None = None,
        terminal_type: int = 1,
        assets_name: str | None = None,
        callback: bool = False,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        """Upload file and start detection in one step."""
        token = await self._ensure_token()
        files = {"file": (filename, file_content)}
        data: dict[str, Any] = {
            "assetsName": assets_name or filename,
            "terminalType": terminal_type,
            "isSdkDetection": 0,
            "callback": callback,
        }
        if template_id:
            data["templateId"] = template_id
        if callback and callback_url:
            data["callbackUrl"] = callback_url

        headers = {"Authorization": f"Bearer {token}"}
        response = await self.client.post(
            "/detection/api/detection/upload/detect",
            data=data,
            files=files,
            headers=headers,
        )
        return self._parse_response(response)

    # ------------------------------------------------------------------
    # Strategies / Templates
    # ------------------------------------------------------------------
    async def list_strategies(
        self,
        terminal_type: int | None = None,
        name: str | None = None,
        page_num: int = 1,
        page_size: int = 100,
    ) -> dict[str, Any]:
        """Query detection strategies / templates."""
        token = await self._ensure_token()
        data: dict[str, Any] = {
            "pageNum": page_num,
            "pageSize": page_size,
        }
        if terminal_type is not None:
            data["terminalType"] = terminal_type
        if name:
            data["name"] = name
        response = await self.client.post(
            "/detection/api/strategy/page",
            json=data,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    # ------------------------------------------------------------------
    # Detection Tasks
    # ------------------------------------------------------------------
    async def start_detection(
        self,
        assets_id: str,
        template_id: str | None = None,
        terminal_type: int = 1,
        callback: bool = False,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        """Start a detection task."""
        token = await self._ensure_token()
        data: dict[str, Any] = {
            "assetsId": assets_id,
            "terminalTypeEnum": terminal_type,
            "callback": callback,
        }
        if template_id:
            data["templateId"] = template_id
        if callback and callback_url:
            data["callbackUrl"] = callback_url

        response = await self.client.post(
            "/detection/api/detection/start",
            json=data,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    async def get_detection_status(self, document_id: str) -> dict[str, Any]:
        """Get detection task status."""
        token = await self._ensure_token()
        response = await self.client.get(
            f"/detection/api/detection/status/{document_id}",
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    async def get_task_detail(self, document_id: str, terminal_type: int = 1) -> dict[str, Any]:
        """Get task detail. Supports Android/SDK/HarmonyOS (1/7/10) and iOS (2/11)."""
        token = await self._ensure_token()
        if terminal_type in (2, 11):
            path = f"/detection/api/detection/v1/detail/{document_id}"
        else:
            path = f"/detection/api/detection/task/getTaskDetailNew/{document_id}"
        response = await self.client.get(path, headers=self._auth_headers(token))
        return self._parse_response(response)

    async def list_tasks(
        self,
        page_num: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Query detection task list."""
        token = await self._ensure_token()
        params = {"pageNum": page_num, "pageSize": page_size}
        response = await self.client.get(
            "/detection/api/detection/task/list",
            params=params,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    # ------------------------------------------------------------------
    # Vulnerabilities
    # ------------------------------------------------------------------
    async def get_vulnerabilities(
        self,
        document_id: str,
        terminal_type: int = 1,
        page_num: int = 1,
        page_size: int = 1000,
    ) -> dict[str, Any]:
        """Get vulnerability list. Supports Android/SDK/HarmonyOS (1/7/10) and iOS (2/11)."""
        token = await self._ensure_token()
        if terminal_type in (2, 11):
            data = {"documentId": document_id}
            response = await self.client.post(
                "/detection/api/detection/ios/resultItem",
                json=data,
                headers=self._auth_headers(token),
            )
        else:
            data = {"documentId": document_id}
            response = await self.client.post(
                "/detection/api/detection/task/getRiskDetailListNew",
                json=data,
                headers=self._auth_headers(token),
            )
        return self._parse_response(response)

    # ------------------------------------------------------------------
    # Task detail (rich: base info, permissions, SDKs, behaviors)
    # ------------------------------------------------------------------
    # Note: get_task_detail() is defined above and routes Android/SDK/HarmonyOS
    # to getTaskDetailNew and iOS to the v1/detail endpoint.

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------
    async def get_data_statistics(
        self,
        dimension: int = 3,
        terminal_type: int = 1,
        package_name: str | None = None,
    ) -> dict[str, Any]:
        """Aggregate statistics. dimension: 1=day, 2=week, 3=month."""
        token = await self._ensure_token()
        data: dict[str, Any] = {"dimension": str(dimension), "terminalType": str(terminal_type)}
        if package_name:
            data["packageName"] = package_name
        response = await self.client.post(
            "/detection/api/data/statistics/datastatistics",
            json=data,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    async def query_assets_statistics(
        self,
        terminal_type: int = 1,
        package_name: str | None = None,
    ) -> dict[str, Any]:
        """Query uploaded applications (asset list with metadata)."""
        token = await self._ensure_token()
        data: dict[str, Any] = {"terminalType": str(terminal_type)}
        if package_name:
            data["packageName"] = package_name
        response = await self.client.post(
            "/detection/api/data/statistics/queryAsset",
            json=data,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    # ------------------------------------------------------------------
    # Version history
    # ------------------------------------------------------------------
    async def find_all_versions(
        self,
        terminal_type: str | None = None,
        package_name: str | None = None,
        app_name: str | None = None,
        app_md5: str | None = None,
    ) -> dict[str, Any]:
        """List all detected versions of an application."""
        token = await self._ensure_token()
        data: dict[str, Any] = {}
        if terminal_type:
            data["terminalType"] = terminal_type
        if package_name:
            data["packageName"] = package_name
        if app_name:
            data["appName"] = app_name
        if app_md5:
            data["appMd5"] = app_md5
        response = await self.client.post(
            "/detection/api/version/versionManager/findAllVersion",
            json=data,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    async def summarize_detection_result(
        self,
        terminal_type: str | None = None,
        package_name: str | None = None,
        app_name: str | None = None,
        app_md5: str | None = None,
    ) -> dict[str, Any]:
        """Summarize version score/risk trend for an application."""
        token = await self._ensure_token()
        data: dict[str, Any] = {}
        if terminal_type:
            data["terminalType"] = terminal_type
        if package_name:
            data["packageName"] = package_name
        if app_name:
            data["appName"] = app_name
        if app_md5:
            data["appMd5"] = app_md5
        response = await self.client.post(
            "/detection/api/version/versionManager/summarizeDetectionResult",
            json=data,
            headers=self._auth_headers(token),
        )
        return self._parse_response(response)

    # ------------------------------------------------------------------
    # Reports
    # ------------------------------------------------------------------
    async def download_report(
        self,
        document_id: str,
        report_type: int = 1,
        terminal_type: int = 1,
    ) -> bytes:
        """Download detection report. report_type: 1=word, 2=pdf."""
        token = await self._ensure_token()
        data = {
            "documentId": document_id,
            "reportType": report_type,
        }
        response = await self.client.post(
            "/detection/api/detection/report",
            json=data,
            headers=self._auth_headers(token),
            follow_redirects=True,
        )
        ctype = response.headers.get("content-type", "")
        # Binary report (pdf/word/octet-stream) — but NOT a JSON error body,
        # which also starts with "application/".
        if response.status_code == 200 and ctype.startswith("application/") and "json" not in ctype:
            return response.content
        # Try to parse as JSON error
        self._parse_response(response)
        return response.content


# Singleton instance
_ijiami_client: IJiamiClient | None = None


def get_ijiami_client() -> IJiamiClient:
    global _ijiami_client
    if _ijiami_client is None:
        _ijiami_client = IJiamiClient()
    return _ijiami_client


def set_ijiami_client(client: IJiamiClient) -> None:
    global _ijiami_client
    _ijiami_client = client
