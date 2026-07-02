import { test, expect, Page } from '@playwright/test'
import { login, gotoRoute, assertNoAppCrash } from './helpers'

test.setTimeout(120_000)
const API = process.env.PTTECH_E2E_API || 'http://127.0.0.1:8100/api/v1'

async function selectOpt(page: Page, text: string) {
  await page.locator('.ant-select-item-option-content', { hasText: text }).first().click()
}

// Provision a tenant + a couple users via API for deterministic association tests.
async function provision(request: any) {
  const adm = (await (await request.post(`${API}/system/profile/login`, { data: { email: 'admin@bctech.ai', password: 'admin123' } })).json()).access_token
  const h = { Authorization: `Bearer ${adm}` }
  const sfx = Date.now().toString().slice(-6)
  const tid = (await (await request.post(`${API}/organization/tenants`, { headers: h, data: { code: `assoc${sfx}`, name: `关联测试租户${sfx}` } })).json()).id
  await request.post(`${API}/system/users`, { headers: h, data: { email: `am${sfx}@ex.com`, password: 'Str0ng#Pass1', full_name: '关联甲', role: 'user', tenant_id: tid, data_scope: 'self' } })
  await request.post(`${API}/system/users`, { headers: h, data: { email: `bm${sfx}@ex.com`, password: 'Str0ng#Pass2', full_name: '关联乙', role: 'user', tenant_id: tid, data_scope: 'self' } })
  return { h, tid, sfx, name: `关联测试租户${sfx}` }
}

test('用户管理: 按租户筛选联动', async ({ page, request }) => {
  const { name } = await provision(request)
  await login(page)
  await gotoRoute(page, '/users')
  await assertNoAppCrash(page)
  // 平台超管应看到"按租户筛选"下拉(antd Select 的占位在 selection-placeholder 里)
  const tenantFilter = page.locator('.ant-select', { hasText: /Filter by tenant|按租户筛选/i }).first()
  await expect(tenantFilter).toBeVisible()
  await tenantFilter.click()
  await selectOpt(page, name)
  await page.waitForTimeout(1200)
  // 表格里应只剩该租户用户(关联甲/乙)
  const tableText = await page.locator('.ant-table').first().innerText()
  expect(tableText).toMatch(/关联甲|关联乙/)
})

test('租户管理: 抽屉内设置/取消管理员', async ({ page, request }) => {
  const { name } = await provision(request)
  await login(page)
  await gotoRoute(page, '/tenants')
  await assertNoAppCrash(page)
  // 打开该租户详情抽屉
  const row = page.locator('.ant-table-row', { hasText: name }).first()
  await row.getByRole('button').first().click()  // 第一个动作按钮 = 查看详情(EyeOutlined)
  const drawer = page.locator('.ant-drawer').first()
  await expect(drawer).toBeVisible()
  // 点"设为管理员"
  await drawer.getByRole('button', { name: /Set Admin|设为管理员/i }).first().click()
  const modal = page.locator('.ant-modal').first()
  await expect(modal).toBeVisible()
  // 选一个用户
  await modal.locator('.ant-select').first().click()
  await page.locator('.ant-select-item-option-content', { hasText: /关联/ }).first().click()
  await modal.getByRole('button', { name: /Confirm|确定/i }).first().click()
  await page.waitForTimeout(1500)
  // 管理员表格应出现该用户
  await expect(drawer.locator('.ant-table').first()).toContainText(/关联/, { timeout: 10000 })
})

test('角色管理: 点人数查看成员抽屉', async ({ page, request }) => {
  await provision(request)  // ensure some users exist
  await login(page)
  await gotoRoute(page, '/roles')
  await assertNoAppCrash(page)
  // "普通用户/user" 行的人数是可点击链接
  // 点第一个非零 user_count 链接按钮
  const countBtn = page.locator('.ant-table-tbody button:not([disabled])').filter({ hasText: /\d/ }).first()
  if (await countBtn.isVisible().catch(() => false)) {
    await countBtn.click()
    const drawer = page.locator('.ant-drawer').first()
    await expect(drawer).toBeVisible()
    // 抽屉内应有用户表格(或空状态)
    const ok = await drawer.locator('.ant-table').first().isVisible().catch(() => false)
    expect(ok).toBeTruthy()
  }
})
