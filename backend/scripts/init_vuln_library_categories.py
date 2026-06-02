"""Initialize default vulnerability library categories."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.vulnerability_library.models import VulnLibraryCategory

DEFAULT_CATEGORIES = [
    ("web_app", "Web 应用", None, 10),
    ("sql_injection", "SQL 注入", "web_app", 10),
    ("xss", "XSS", "web_app", 20),
    ("ssrf", "SSRF", "web_app", 30),
    ("file_upload", "文件上传", "web_app", 40),
    ("auth_bypass", "认证绕过", "web_app", 50),
    ("network_service", "网络服务", None, 20),
    ("rce", "远程代码执行", "network_service", 10),
    ("weak_password", "弱口令", "network_service", 20),
    ("unauthorized_access", "未授权访问", "network_service", 30),
    ("middleware", "中间件", None, 30),
    ("database", "数据库", None, 40),
    ("os", "操作系统", None, 50),
    ("cloud_native", "云原生/容器", None, 60),
    ("mobile", "移动端", None, 70),
    ("iot", "工控/IoT", None, 80),
    ("misconfiguration", "配置错误", None, 90),
    ("information_disclosure", "信息泄露", None, 100),
    ("supply_chain", "供应链", None, 110),
]


async def init_vuln_library_categories(db: AsyncSession) -> int:
    existing = await db.execute(select(VulnLibraryCategory))
    by_code = {category.code: category for category in existing.scalars().all()}
    created_count = 0

    for code, name, parent_code, sort_order in DEFAULT_CATEGORIES:
        parent_id = by_code[parent_code].id if parent_code and parent_code in by_code else None
        category = by_code.get(code)
        if category:
            category.name = name
            category.parent_id = parent_id
            category.sort_order = sort_order
            category.is_active = True
            continue
        category = VulnLibraryCategory(
            id=str(uuid.uuid4()),
            code=code,
            name=name,
            parent_id=parent_id,
            sort_order=sort_order,
            is_active=True,
        )
        db.add(category)
        await db.flush()
        by_code[code] = category
        created_count += 1

    await db.commit()
    return created_count
