# 多租户组织管理 (Multi-Tenant Organization)

> 面向"系统交付给不同公司/部门使用"的场景,提供 **租户(Tenant)→ 部门(Department)→ 用户** 三级组织体系,
> 以及 **租户级 + 部门/个人级** 的双重数据隔离。

## 1. 概念模型

```
平台超级管理员 (admin, tenant_id = NULL)
  ├── 跨租户可见所有数据
  └── 管理租户、平台角色、全局设置
租户 (Tenant) —— 一个客户公司
  ├── 租户管理员 (tenant_admin)         → 管理本租户部门/人员,可见全租户数据
  └── 普通用户 (user / viewer)          → 按 data_scope 访问
        ├── self       仅本人创建的数据
        ├── department 本部门数据
        └── tenant     全租户数据
```

- **用户单一归属**:一个用户属于一个租户下的一个部门(`users.tenant_id` / `users.department_id`)。
- `tenant_id = NULL` 的用户是平台级用户(超管 / service),跨租户可见。
- **漏洞库(vulnerability_library)保持全局共享**:CVE/CWE 是公共知识,`vuln_code` 全局唯一,不做租户隔离。

## 2. 隔离机制(三层)

| 层 | 实现 | 作用 |
|----|------|------|
| 应用层 · 自动查询过滤 | `backend/common/infra/tenant_query.py` 的 `do_orm_execute` 事件 + `with_loader_criteria` | 所有租户表 SELECT(含关联加载、`func.count()`)自动注入 `tenant_id = 当前租户` |
| 应用层 · 写入自动填充 | `backend/common/infra/tenant_mixin.py` 的 `before_flush` 事件 | 新建对象自动带入当前租户,业务代码无需手动传 `tenant_id` |
| 数据库层 · RLS 兜底 | `migrations/versions/20260701_0002_enable_rls.py` 的 Row-Level Security 策略 | 即使应用层遗漏过滤,PostgreSQL 也按 `app.current_tenant_id` 拒绝越权行 |
| 应用层 · 租户内细粒度 | `restrict_to_own_records()` + `apply_data_scope()` | 在租户隔离之上叠加 self/department/tenant 可见性 |

### 租户上下文
`backend/common/infra/tenant_context.py` 用 `ContextVar` 保存每个请求的
`TenantContextData(user_id, tenant_id, department_id, data_scope, is_platform_admin, is_tenant_admin)`。

上下文在认证时自动设置——`get_current_user` / API-key 认证 / optional 认证三条路径都调用
`_activate_tenant_context(user)`,因此 **所有现有 `Depends(get_current_user)` 的端点自动获得隔离,无需逐个改造**。

平台超管(`admin` 且 `tenant_id = NULL`)的上下文 `is_platform_admin = True`,过滤器直接跳过 → 跨租户可见。

### 涉及的租户表(`TENANT_SCOPED_TABLES`)
`apptest_tasks, scans, targets, reports, endpoints, vulnerabilities, agent_tasks, vulnerability_tests, vuln_lab_challenges, departments`
每张表的 ORM 模型都带 `tenant_id: Mapped[Optional[str]]` 字段(自动过滤/填充依赖此字段存在)。

## 3. 分层权限

| 角色 | 平台/租户 | 关键权限 |
|------|----------|---------|
| `admin` | 平台 | `tenant:manage` + `org:manage` + 全部 |
| `tenant_admin` | 租户 | `org:manage` + 用户管理(限本租户) |
| `user` | 租户 | 业务权限,受 data_scope 限制 |
| `viewer` | 租户 | 只读 |
| `service` | 平台 | API 服务账号 |

新增权限 scope:`PermissionScope.TENANT`(`tenant:manage`)、`PermissionScope.ORG`(`org:manage` / `org:read`)。

`restrict_to_own_records(user)`(`backend/common/infra/rbac/access_helpers.py`)统一判定租户内可见性:
- 平台超管 / 租户管理员 / `data_scope=tenant` → `False`(看全租户)
- 其它(self/department)→ `True`(仅本人 `user_id`/`created_by`)

pentest / apptest 模块的 ~38 处可见性判断已从 `is_admin_role()` 迁移到 `restrict_to_own_records()`。

## 4. API

组织管理 `/api/v1/organization`(注册于 `SYSTEM_ROUTERS`):
- 租户(仅 `tenant:manage`):`GET/POST/PUT/DELETE /tenants`、`POST /tenants/{id}/admins`
- 部门(`org:manage`,自动限定本租户;超管可 `?tenant_id=` 查看指定租户):
  `GET /departments/tree`、`POST/PUT/DELETE /departments`

用户管理 `/api/v1/system/users` 扩展:`UserCreate/UserUpdate` 支持 `tenant_id` / `department_id` / `data_scope`;
租户管理员创建/修改用户时被强制锁定在自己的租户内(`_resolve_org_assignment`)。

## 5. 前端
- `pages/system/TenantManagementPage.tsx` —— 租户 CRUD(仅平台超管)
- `pages/system/DepartmentManagementPage.tsx` —— 树形部门管理(超管可切租户)
- `UserManagementPage.tsx` —— 增加租户/部门列、创建时选择租户/部门/数据范围
- 路由:`/tenants`(`tenant:manage`)、`/departments`(`org:manage`),group `system`
- 访问位 `canTenantManage` / `canOrgManage` / `canOrgRead`

## 6. ⚠️ 部署要求(重要)

### 6.1 数据库迁移
业务模型新增了 `tenant_id` 列,**正式环境必须走 Alembic 迁移**,不要用 `create_all`:
```bash
alembic upgrade heads
```
迁移链:
- `20260701_0001` 建 tenants/departments 表、users 加 3 列、9 张业务表加 `tenant_id`、创建默认租户 `default` 并回填(现有非平台用户归入 default,业务数据按 `created_by → user.tenant_id` 回填)。
- `20260701_0002` 对业务表启用 RLS + `tenant_isolation_*` 策略。

启动时 `init_permissions` 会自动补齐 `tenant_admin` 角色与 `tenant:manage`/`org:*` 权限及其资源映射。

### 6.2 RLS 生效的前提:应用必须用非 superuser 角色连接 ⚠️
**PostgreSQL superuser(及 `BYPASSRLS` 角色)永远绕过 RLS,`FORCE ROW LEVEL SECURITY` 也无效。**
默认的 `pttechai` 账号在多数安装中是 superuser,若应用用它连接,则 RLS 兜底形同虚设(应用层过滤仍有效,但失去数据库层保险)。

生产环境应创建专用应用角色:
```sql
CREATE ROLE pttech_app LOGIN PASSWORD '***' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO pttech_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pttech_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pttech_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pttech_app;
```
然后让 `DATABASE_URL` 使用 `pttech_app`。RLS 策略把 GUC 为空视为放行,因此 DDL / 迁移仍可用 owner 账号执行。

RLS 的会话变量在认证时由 `_set_db_tenant_guc_safe()` 通过 `SELECT set_config('app.current_tenant_id', <tenant>, true)` 设置(事务级,平台超管为空 → 放行)。

## 7. 测试

### 7.1 后端(pytest)
| 文件 | 类型 | 覆盖 |
|------|------|------|
| `tests/test_tenant_isolation.py` | SQLite 内存单测(无需后端) | 自动过滤、写入填充、data_scope、`restrict_to_own_records` 矩阵 |
| `tests/test_e2e_multitenant.py` | 端到端(需运行的后端,否则 skip) | 租户开通 → 部门 → 用户分配 → 跨租户 apptest/scans 隔离 → 平台超管 → 权限边界(9 用例) |
| `tests/test_e2e_modules_detailed.py` | 端到端 · 逐功能(需后端) | 漏洞库 9 + 系统设置 6 + App安全 8 = **23 用例**,基于源码逐功能验证 |

运行(对运行中的后端):
```bash
PTTECH_E2E_BASE_URL=http://127.0.0.1:8100 pytest \
  tests/test_e2e_multitenant.py tests/test_e2e_modules_detailed.py tests/test_tenant_isolation.py -v
```

`test_e2e_modules_detailed.py` 覆盖的具体功能:
- **漏洞库**:条目全生命周期(自动 vuln_code / 软删除)、标识符 CRUD + 主标识互斥、标识符 `(source,identifier)` 全局唯一(409)、制品 has_poc 联动、分类 CRUD、多维过滤 + 排序、导入导出(JSON/CSV)、统计、全局共享可见性。
- **系统设置**:租户生命周期 + 自动根部门 + 重名拒绝、部门嵌套树 + 删除守卫、用户归属 + 租户管理员提升、角色 + 权限、菜单 CRUD、租户管理员权限边界。
- **App安全**:配置读取 + 密钥脱敏、配置更新连接守卫(离线 400)、外部 iJiami 端点(200/502)、任务创建/列表/详情、空文件拒绝、跨租户隔离(404)。

### 7.2 前端(Playwright,页面级)
| 文件 | 覆盖 |
|------|------|
| `frontend/e2e/00-smoke.spec.ts` | UI 登录 → dashboard |
| `frontend/e2e/10-pages.spec.ts` | 四大模块 25 个页面渲染无崩溃 |
| `frontend/e2e/20-interactions.spec.ts` | 租户创建流、部门树、用户表单、漏洞库搜索、新建扫描、租户管理员边界(6 交互) |

运行(需前端 + 后端已启动):
```bash
cd frontend
PTTECH_E2E_WEB=http://127.0.0.1:3100 PTTECH_E2E_API=http://127.0.0.1:8100/api/v1 npx playwright test
```

### 7.3 已验证结论(真实 PostgreSQL 16 环境)
- apptest 强隔离:租户 A 建任务 → A 可见 / B 列表为空 / B 直接访问 404 / 超管 200 ✅
- scans 三层矩阵:self 用户各看自己 / 租户管理员看全租户 / 他租户 0 / 超管全见 ✅
- `func.count()` 计数查询同样隔离(total 不泄露)✅
- RLS 兜底(以非 superuser 角色):GUC=A 仅见 A、GUC=B 仅见 B、GUC 空放行 ✅
- 后端 38 用例 + 前端 32 用例全通过,连续两次运行幂等无 flaky ✅

## 8. 本地 Docker 快速启动(开发/验证)

避开 5432/8000/3000 端口冲突时,可用端口重映射的 override 文件启动整栈:
```bash
cd deploy
docker compose -p pttechai -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
# 前端 http://127.0.0.1:3100 · 后端 http://127.0.0.1:8100 · PostgreSQL 127.0.0.1:5433
```
`deploy/docker-compose.e2e.yml` 用 `ports: !override` 把宿主端口改为 3100/8100/5433(容器内仍是 80/8000/5432)。
后端首启自动执行 `init_db + init_admin + init_permissions`;默认管理员 `admin@bctech.ai / admin123`。

> 注:容器镜像只 COPY 了 `backend/`,未含 `alembic.ini`/`migrations`,首启走 `create_all`。
> 若要启用 RLS,需在容器 PG 内手动应用 `20260701_0002` 的策略 SQL,并让应用改用非 superuser 角色(见 6.2)。
