# 后台管理平台能力说明(对标 RuoYi)

> 本文档记录 PTTechAI 后台管理域(系统设置)的能力矩阵、API 清单与安全策略,
> 作为对标主流后台平台(如 RuoYi)的能力说明书。多租户隔离细节见 [multi-tenant.md](./multi-tenant.md)。

## 1. 能力矩阵(vs RuoYi)

| 能力 | RuoYi | PTTechAI | 说明 |
|------|:-----:|:--------:|------|
| 用户管理 | ✅ | ✅ | 含 phone/avatar/remark/data_scope,租户/部门归属 |
| 角色管理 + 权限 | ✅ | ✅ | RBAC:角色-权限-资源映射,前后端双重校验 |
| 菜单管理 | ✅ | ✅ | DB 驱动动态菜单树,按权限过滤 |
| 部门管理 | ✅ | ✅ | 树形 + 成员管理(左树右详情),环引用防护 |
| 租户管理 | ✅(SaaS 版) | ✅ | 平台超管建/停租户,租户管理员管本租户 |
| 数据权限(data_scope) | ✅ 5 级 | ✅ 3 级 | self / department / tenant + 平台超管跨租户 |
| 操作日志 | ✅ | ✅ | audit_logs,租户级隔离 + CSV/JSON 导出 |
| 登录日志 | ✅ 独立 | ✅ | 统一在 audit(auth.login_* 动作) |
| 在线用户 + 强退 | ✅ | ✅ | 复用 user_tokens,列出活跃会话 + 强制下线 |
| 密码策略 | ✅ | ✅ | 长度 + 字符类别 + 常见密码黑名单 |
| 岗位管理 | ✅ | ➖ | 用部门(department)覆盖,未单列 post |
| 字典管理 | ✅ | ➖ | 本项目枚举较固定,暂未做 sys_dict |
| 参数配置 | ✅ | ➖ | 分散在各模块 settings,暂未集中 |
| 定时任务 | ✅ | ✅ | scheduler 模块(渗透扫描调度) |
| API Key | ➖ | ✅ | 面向程序化访问,RuoYi 无 |

## 2. 安全策略

### 2.1 密码策略(`backend/common/infra/password_policy.py`)
- 长度 8–72 字符(bcrypt 72 字节上限)
- 至少包含 小写/大写/数字/特殊字符 中的 **3 类**
- 拒绝常见弱密码黑名单;拒绝含邮箱本地名的密码
- 统一接入点:注册、管理员建用户、改密、重置密码、租户管理员建用户
  (服务账号/种子 admin 走 `get_password_hash` 绕过策略)
- 前端表单展示规则提示(`passwordPolicy.hint`)

### 2.2 会话与登录
- JWT access + refresh,DB 侧 `user_tokens` 支持吊销;单点登录(新登录吊销旧 token)
- **改密/重置密码后强制失效所有会话**(RuoYi 行为),记 `pwd_update_date`
- 登录失败:IP 级滑动窗口限流 + 渐进锁定(`rate_limiter.py`)
- 停用租户后,其用户登录被拒 + 既有会话失效(`get_current_user` 校验)

### 2.3 审计
- 记录 who/action/resource/IP/UA/details,敏感字段(password/token/secret)自动脱敏
- 携带 `tenant_id`,租户管理员只见本租户;超管可 `?tenant_id=` 收窄
- 导出 CSV/JSON(`audit:read` 权限)供合规归档

## 3. API 清单(系统设置域)

| 模块 | 方法 路径 | 权限 |
|------|-----------|------|
| 用户 | `GET/POST /system/users`,`GET/PUT/DELETE /system/users/{id}`,`POST /system/users/{id}/reset-password` | user:* |
| 个人资料 | `GET/PUT /system/profile/me`,`PUT /system/profile/change-password` | 登录用户 |
| 角色 | `GET/POST /system/roles`,`GET/PUT/DELETE /system/roles/{name}` | user:manage |
| 菜单 | `GET /menus/tree`,`GET/POST/PUT/DELETE /menus` | settings:manage |
| 部门 | `GET /organization/departments/tree`,`POST/PUT/DELETE /organization/departments` | org:manage |
| 租户 | `GET/POST/PUT/DELETE /organization/tenants`,`POST /organization/tenants/{id}/admins` | tenant:manage |
| 审计 | `GET /audit`,`GET /audit/export?format=csv\|json` | audit:read |
| 在线会话 | `GET /system/sessions`,`DELETE /system/sessions/{jti}` | session:manage |
| 监控 | `GET /monitor/health`,`GET /monitor/database` | settings:manage |

## 4. 权限 scope 一览

`SCAN/TARGET/REPORT/VULNERABILITY/DASHBOARD/SETTINGS/USER/API_KEY/PROVIDER/AGENT/`
`SCHEDULER/KNOWLEDGE/VULN_LIBRARY/APPTEST/TENANT/ORG/AUDIT/SESSION`

角色默认授权见 `backend/scripts/init_permissions.py` 的 `ROLE_PERMISSIONS`:
- `admin`(平台超管):全部
- `tenant_admin`:本租户 org/user/audit/session + 业务权限
- `user`:业务权限(受 data_scope 限制)
- `viewer`:只读
- `service`:API 服务账号

## 5. 迁移与部署

新增迁移:
- `20260701_0003` 审计 tenant_id + AUDIT 枚举
- `20260701_0004` 用户 phone/avatar/remark/pwd_update_date

> 枚举扩展(`ALTER TYPE permissionscope ADD VALUE 'AUDIT'/'SESSION'`)需单独执行,
> 不能与其它语句同事务。启动时 `init_permissions` 幂等补齐权限与资源映射。

部署与 RLS 非 superuser 角色要求见 [multi-tenant.md](./multi-tenant.md) 第 6 节。

## 6. 测试

- `tests/test_e2e_modules_detailed.py::TestSecurityHardening` — 密码策略拒弱密码、
  重置策略+失效、在线会话列出+强退、权限边界
- `TestAuditCompliance` — 审计租户隔离 + 导出
- 全部经 `docker compose run --rm` fresh 实例验证(本机 `up` 容器有陈旧代码 anomaly,
  见项目记忆);前端 Playwright 页面级验证
