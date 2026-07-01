import { test, expect } from '@playwright/test'
import { login, gotoRoute, assertNoAppCrash } from './helpers'

// Interactive functional flows through the UI (create/search/filter/modal),
// focused on the modules touched by the multi-tenant work + core CRUD.
test.beforeEach(async ({ page }) => {
  await login(page)
})

const rid = Date.now().toString().slice(-6)

test.describe('系统设置 · 租户管理 交互', () => {
  test('打开新建租户弹窗并创建租户', async ({ page }) => {
    await gotoRoute(page, '/tenants')
    await assertNoAppCrash(page)
    // Toolbar "New Tenant" button lives in the ProCard extra slot.
    const createBtn = page.getByRole('button', { name: /新建租户|新增|创建|新建|new tenant|create|add/i }).first()
    await expect(createBtn).toBeVisible()
    await createBtn.click()
    const modal = page.locator('.ant-modal, .ant-drawer').first()
    await expect(modal).toBeVisible()
    // code field has placeholder "acme-corp", name field "Acme Corp"
    await modal.getByPlaceholder('acme-corp').fill(`uicode${rid}`)
    await modal.getByPlaceholder('Acme Corp').fill(`UI Tenant ${rid}`)
    await modal.getByRole('button', { name: /确定|保存|提交|创建|ok|save|submit|create/i }).first().click()
    await expect(page.locator('.ant-table').first()).toContainText(`UI Tenant ${rid}`, { timeout: 15000 })
  })
})

test.describe('系统设置 · 部门管理 交互', () => {
  test('部门管理页加载租户选择/树结构', async ({ page }) => {
    await gotoRoute(page, '/departments')
    await assertNoAppCrash(page)
    // Platform admin should get a tenant selector or a tree region
    const ok = await page.locator('.ant-select, .ant-tree, .ant-empty, table').first().isVisible().catch(() => false)
    expect(ok).toBeTruthy()
  })
})

test.describe('系统设置 · 用户管理 交互', () => {
  test('用户表格渲染且新建按钮打开表单(含租户/部门/数据范围)', async ({ page }) => {
    await gotoRoute(page, '/users')
    await expect(page.locator('.ant-table').first()).toBeVisible()
    const createBtn = page.getByRole('button', { name: /新建|新增|创建|添加|create|add|new/i }).first()
    await expect(createBtn).toBeVisible()
    await createBtn.click()
    const modal = page.locator('.ant-modal, .ant-drawer').first()
    await expect(modal).toBeVisible()
    // form fields present (email/password + selects for role/tenant/scope)
    expect(await modal.locator('input').count()).toBeGreaterThan(1)
    expect(await modal.locator('.ant-select').count()).toBeGreaterThanOrEqual(1)
    // close without saving
    await page.keyboard.press('Escape')
  })
})

test.describe('漏洞库 · 条目 交互', () => {
  test('条目列表分页/搜索控件可用', async ({ page }) => {
    await gotoRoute(page, '/vulnerability-library/entries')
    await expect(page.locator('.ant-table').first()).toBeVisible()
    // ProTable query button renders as "查 询" (spaced) — match loosely.
    const searchBtn = page.getByRole('button', { name: /查\s*询|搜索|search/i }).first()
    const hasSearch = await searchBtn.isVisible().catch(() => false)
    expect(hasSearch).toBeTruthy()
    if (hasSearch) {
      await searchBtn.click()
      await page.waitForLoadState('networkidle').catch(() => {})
      await assertNoAppCrash(page)
      // table still present after querying
      await expect(page.locator('.ant-table').first()).toBeVisible()
    }
  })
})

test.describe('Web安全 · 新建扫描 交互', () => {
  test('新建扫描表单可填写目标', async ({ page }) => {
    await gotoRoute(page, '/scan/new')
    await assertNoAppCrash(page)
    // Single-URL target input carries a stable placeholder.
    const urlInput = page.getByPlaceholder('https://example.com').first()
    await expect(urlInput).toBeVisible()
    await urlInput.fill('https://example.com')
    await expect(urlInput).toHaveValue('https://example.com')
    // a submit/start button should exist
    const startBtn = page.getByRole('button', { name: /deploy|开始|启动|创建|扫描|提交|start|create|scan|submit|launch/i }).first()
    expect(await startBtn.isVisible().catch(() => false)).toBeTruthy()
  })
})

test.describe('权限边界 · 租户管理员登录', () => {
  test('租户管理员看不到租户管理入口/被拦截', async ({ page, request }) => {
    // Provision a tenant + tenant_admin via API, then log in as them.
    const api = process.env.PTTECH_E2E_API || 'http://127.0.0.1:8100/api/v1'
    const admLogin = await request.post(`${api}/system/profile/login`, { data: { email: 'admin@bctech.ai', password: 'admin123' } })
    const admTok = (await admLogin.json()).access_token
    const th = { Authorization: `Bearer ${admTok}` }
    const tCreate = await request.post(`${api}/organization/tenants`, { headers: th, data: { code: `uib${rid}`, name: `UIB ${rid}` } })
    const tenantId = (await tCreate.json()).id
    const email = `uita${rid}@ex.com`
    await request.post(`${api}/system/users`, { headers: th, data: { email, password: 'e2ePassw0rd!', full_name: 'ta', role: 'tenant_admin', tenant_id: tenantId, data_scope: 'tenant' } })

    // Log in as tenant admin through the UI
    await page.context().clearCookies()
    await page.goto('/login')
    await page.evaluate(() => localStorage.clear())
    await login(page, email, 'e2ePassw0rd!')

    // Directly visiting /tenants must not show tenant data (redirect / 403 / empty)
    await gotoRoute(page, '/tenants')
    await assertNoAppCrash(page)
    // The tenant-management table (which lists ALL tenants) must NOT contain other tenants.
    // Accept either: redirected away, or an access-denied/empty state.
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const leaked = bodyText.includes('Default Tenant') || /admin@bctech/.test(bodyText)
    expect(leaked).toBeFalsy()

    // cleanup
    await request.delete(`${api}/organization/tenants/${tenantId}`, { headers: th })
  })
})
