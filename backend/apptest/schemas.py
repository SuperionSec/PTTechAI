"""Pydantic schemas for apptest module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ------------------------------------------------------------------
# Terminal Type Enum Helpers
# ------------------------------------------------------------------
TERMINAL_TYPES: dict[int, str] = {
    1: "Android",
    2: "iOS",
    3: "公众号",
    4: "小程序",
    7: "SDK",
    8: "IoT",
    9: "AAB",
    10: "鸿蒙",
    11: "iOS SDK",
    12: "H5",
    14: "HarmonyOS",
}

DETECTION_STATUS: dict[int, str] = {
    1: "未开始",
    2: "检测中",
    3: "检测中断",
    4: "检测完成",
}


def get_terminal_type_name(value: int) -> str:
    return TERMINAL_TYPES.get(value, f"未知({value})")


def get_detection_status_name(value: int) -> str:
    return DETECTION_STATUS.get(value, f"未知({value})")


# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
class AppTestConfig(BaseModel):
    base_url: str = "https://rundet.ijiami.cn"
    client_id: str = ""
    client_secret: str = ""
    username: str = ""
    password: str = ""  # stored plaintext in DB, masked in responses


class AppTestConfigResponse(BaseModel):
    base_url: str = ""
    client_id: str = ""
    client_secret: str = ""  # masked
    username: str = ""
    password: str = ""  # masked
    connected: bool = False


class AppTestConfigUpdate(BaseModel):
    base_url: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    username: str | None = None
    password: str | None = None


class AppTestConnectionTestResponse(BaseModel):
    connected: bool = False
    message: str = ""


# ------------------------------------------------------------------
# Strategy
# ------------------------------------------------------------------
class AppTestStrategy(BaseModel):
    id: int | None = None
    name: str = ""
    template_id: int | None = None
    terminal_type: int | None = None
    terminal_type_name: str = ""
    detection_item_count: int = 0
    use_count: int = 0
    status: int = 1
    remark: str = ""
    create_time: str | None = None

    model_config = {"extra": "allow"}


class AppTestStrategiesResponse(BaseModel):
    strategies: list[AppTestStrategy] = Field(default_factory=list)
    total: int = 0


# ------------------------------------------------------------------
# Asset
# ------------------------------------------------------------------
class AppTestAsset(BaseModel):
    assets_id: str | None = None
    name: str = ""
    version: str = ""
    package: str = ""
    md5: str = ""
    size: str = ""
    terminal_type: int | None = None
    terminal_type_name: str = ""
    detection_count: int = 0
    detection_score: str = ""
    logo: str | None = None
    create_time: str | None = None

    model_config = {"extra": "allow"}


class AppTestAssetsResponse(BaseModel):
    assets: list[AppTestAsset] = Field(default_factory=list)
    total: int = 0


# ------------------------------------------------------------------
# Task
# ------------------------------------------------------------------
class AppTestTaskCreate(BaseModel):
    name: str
    terminal_type: int = 1
    template_id: str | None = None
    template_name: str | None = None
    callback: bool = False
    callback_url: str | None = None


class AppTestTaskSummary(BaseModel):
    id: str
    name: str
    terminal_type: int
    terminal_type_name: str
    template_name: str | None = None
    status: str
    progress: float
    score: int | None = None
    vuln_high: int
    vuln_mid: int
    vuln_low: int
    vuln_danger: int
    file_name: str | None = None
    file_size: str | None = None
    package_name: str | None = None
    version: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    created_by: str | None = None


class AppTestTaskResponse(BaseModel):
    id: str
    name: str
    assets_id: str | None = None
    document_id: str | None = None
    terminal_type: int
    terminal_type_name: str
    template_id: str | None = None
    template_name: str | None = None
    status: str
    progress: float
    score: int | None = None
    file_name: str | None = None
    file_size: str | None = None
    md5: str | None = None
    package_name: str | None = None
    version: str | None = None
    vuln_high: int
    vuln_mid: int
    vuln_low: int
    vuln_danger: int
    report_type: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    created_by: str | None = None


class AppTestTaskListResponse(BaseModel):
    tasks: list[AppTestTaskSummary]
    total: int


class AppTestTaskStatusResponse(BaseModel):
    id: str
    document_id: str | None = None
    status: str
    progress: float
    score: int | None = None
    detection_status: int | None = None
    apk_detection_status: int | None = None
    message: str | None = None


# ------------------------------------------------------------------
# Vulnerability
# ------------------------------------------------------------------
class AppTestVulnerability(BaseModel):
    id: str | None = None
    detection_item_id: str | None = None
    name: str = ""
    purpose: str = ""
    grade: str = ""
    grade_value: int | None = None
    harm: str = ""
    solution: str = ""
    result: str = ""
    result_detail: str = ""
    describe: str = ""
    type_name: str = ""
    detail_pre: str = ""
    detection_item_type: str = ""
    terminal_type: int | None = None
    order_no: int | None = None
    item_no: str | None = None
    platform: str | None = None
    is_dynamic: bool = False

    model_config = {"extra": "allow"}


class AppTestVulnsResponse(BaseModel):
    vulnerabilities: list[AppTestVulnerability]
    total: int
    high_count: int = 0
    mid_count: int = 0
    low_count: int = 0


# ------------------------------------------------------------------
# Report
# ------------------------------------------------------------------
class AppTestReportRequest(BaseModel):
    report_type: int = 1  # 1=word, 2=pdf


# ------------------------------------------------------------------
# Statistics (data overview dashboard)
# ------------------------------------------------------------------
class AppTestStatOverview(BaseModel):
    app_num: int = 0
    task_num: int = 0
    version_num: int = 0
    assets_num: int = 0
    detection_num: int = 0
    flaw_num: int = 0
    flaw_high_num: int = 0
    flaw_middle_num: int = 0
    flaw_low_num: int = 0


class AppTestStatTrend(BaseModel):
    date_list: list[str] = Field(default_factory=list)
    score_list: list[list[int]] = Field(default_factory=list)
    score_type: list[str] = Field(default_factory=list)


class AppTestStatRiskItem(BaseModel):
    name: str = ""
    grade: str = ""
    risk_num: int = 0
    rate: float | str | None = None
    type_name: str = ""

    model_config = {"extra": "allow"}


class AppTestStatRiskType(BaseModel):
    name: str = ""
    count: int = 0

    model_config = {"extra": "allow"}


class AppTestStatisticsResponse(BaseModel):
    overview: AppTestStatOverview
    trend: AppTestStatTrend
    risk_top10: list[AppTestStatRiskItem] = Field(default_factory=list)
    risk_types: list[AppTestStatRiskType] = Field(default_factory=list)


# ------------------------------------------------------------------
# Rich task detail (base info, permissions, SDKs, behaviors)
# ------------------------------------------------------------------
class AppTestBaseInfo(BaseModel):
    app_name: str = ""
    package_name: str = ""
    apk_size: str = ""
    version_name: str = ""
    apk_md5: str = ""
    sign_md5: str = ""
    sign_detail: str = ""
    encrypt_detail: str = ""
    manufacturer: str | None = None

    model_config = {"extra": "allow"}


class AppTestPermission(BaseModel):
    permission_name: str = ""
    permission_describe: str = ""
    permission_grade: str = ""
    permission_type: str | None = None
    is_sensitive: str = ""
    is_abuse: str = ""

    model_config = {"extra": "allow"}


class AppTestSDK(BaseModel):
    name: str = ""
    vendor: str = ""
    descript: str = ""
    type_name: str = ""
    description: str = ""

    model_config = {"extra": "allow"}


class AppTestAppAction(BaseModel):
    name: str = ""
    action_function: str = ""
    action_function_position: str = ""

    model_config = {"extra": "allow"}


class AppTestTaskDetailResponse(BaseModel):
    is_sdk_detection: int = 0
    base_info: AppTestBaseInfo
    permissions: list[AppTestPermission] = Field(default_factory=list)
    sdks: list[AppTestSDK] = Field(default_factory=list)
    app_actions: list[AppTestAppAction] = Field(default_factory=list)
    item_types: list[str] = Field(default_factory=list)
    permission_count: int = 0
    sdk_count: int = 0
    sensitive_permission_count: int = 0


# ------------------------------------------------------------------
# Version history
# ------------------------------------------------------------------
class AppTestVersionScore(BaseModel):
    version: str = ""
    score: int | None = None
    create_time: str = ""


class AppTestVersionRisk(BaseModel):
    app_name: str = ""
    version: str = ""
    apk_highrisk_count: int = 0
    apk_middlerisk_count: int = 0
    apk_lowrisk_count: int = 0
    score: int | None = None
    create_time: str = ""

    model_config = {"extra": "allow"}


class AppTestVersionHistoryResponse(BaseModel):
    scores: list[AppTestVersionScore] = Field(default_factory=list)
    risks: list[AppTestVersionRisk] = Field(default_factory=list)
    versions: list[dict[str, Any]] = Field(default_factory=list)

