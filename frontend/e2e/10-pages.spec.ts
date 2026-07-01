import { test, expect, Page } from '@playwright/test'
import { login, gotoRoute, assertNoAppCrash } from './helpers'

// Every test logs in as platform admin first (full access to all modules).
test.beforeEach(async ({ page }) => {
  await login(page)
})

/** A page is "functional" if it renders without crash and shows real content
 *  (a table, cards, form, or headings) rather than a blank/error shell. */
async function assertPageRenders(page: Page, route: string) {
  await gotoRoute(page, route)
  await assertNoAppCrash(page)
  expect(page.url()).toContain(route.split('?')[0])
  // At least one meaningful UI region present
  const hasContent = await page
    .locator('table, .ant-table, .ant-card, form, .ant-form, .ant-tabs, .ant-empty, .ant-list, .ant-tree, h1, h2, .ant-page-header, .ant-statistic')
    .first()
    .isVisible()
    .catch(() => false)
  expect(hasContent, `route ${route} should render content`).toBeTruthy()
}

test.describe('模块: Web安全测试 (pentest)', () => {
  test('Dashboard 首页', async ({ page }) => {
    await assertPageRenders(page, '/')
  })
  test('新建扫描页 (AI Agent)', async ({ page }) => {
    await assertPageRenders(page, '/scan/new')
    // form inputs present
    expect(await page.locator('input, textarea').count()).toBeGreaterThan(0)
  })
  test('自动渗透页', async ({ page }) => {
    await assertPageRenders(page, '/auto')
  })
  test('报告列表页', async ({ page }) => {
    await assertPageRenders(page, '/reports')
  })
  test('漏洞靶场页', async ({ page }) => {
    await assertPageRenders(page, '/vuln-lab')
  })
  test('任务库页', async ({ page }) => {
    await assertPageRenders(page, '/tasks')
  })
  test('调度器页', async ({ page }) => {
    await assertPageRenders(page, '/scheduler')
  })
})

test.describe('模块: App安全检查 (apptest)', () => {
  test('App 检测列表页', async ({ page }) => {
    await assertPageRenders(page, '/apptest')
  })
  test('App 新建任务页', async ({ page }) => {
    await assertPageRenders(page, '/apptest/new')
    // Multi-step wizard: step 0 selects terminal type, upload appears at step 1.
    await expect(page.locator('.ant-steps').first()).toBeVisible()
    // Terminal-type option cards should be present on the first step.
    const hasTypeCards = await page.locator('.ant-card, .ant-radio, .ant-select').first().isVisible().catch(() => false)
    expect(hasTypeCards).toBeTruthy()
  })
  test('App 统计页', async ({ page }) => {
    // statistics calls iJiami (may 502); page itself must still render (error state ok)
    await gotoRoute(page, '/apptest/statistics')
    await assertNoAppCrash(page)
    expect(page.url()).toContain('/apptest/statistics')
  })
  test('App 平台配置页', async ({ page }) => {
    await assertPageRenders(page, '/apptest/config')
  })
})

test.describe('模块: 漏洞库 (vulnerability-library)', () => {
  test('漏洞库概览页', async ({ page }) => {
    await assertPageRenders(page, '/vulnerability-library/overview')
  })
  test('漏洞条目列表页', async ({ page }) => {
    await assertPageRenders(page, '/vulnerability-library/entries')
    // table should be present
    await expect(page.locator('.ant-table, table').first()).toBeVisible()
  })
  test('漏洞制品页', async ({ page }) => {
    await assertPageRenders(page, '/vulnerability-library/artifacts')
  })
  test('漏洞标识符页', async ({ page }) => {
    await assertPageRenders(page, '/vulnerability-library/identifiers')
  })
  test('漏洞分类页', async ({ page }) => {
    await assertPageRenders(page, '/vulnerability-library/categories')
  })
})

test.describe('模块: 系统设置 (system)', () => {
  test('用户管理页', async ({ page }) => {
    await assertPageRenders(page, '/users')
    await expect(page.locator('.ant-table, table').first()).toBeVisible()
  })
  test('角色权限页', async ({ page }) => {
    await assertPageRenders(page, '/roles')
  })
  test('租户管理页 (新)', async ({ page }) => {
    await assertPageRenders(page, '/tenants')
    await expect(page.locator('.ant-table, table').first()).toBeVisible()
  })
  test('部门管理页 (新)', async ({ page }) => {
    await assertPageRenders(page, '/departments')
    // tree or empty state
    const ok = await page.locator('.ant-tree, .ant-empty, .ant-spin, table').first().isVisible().catch(() => false)
    expect(ok).toBeTruthy()
  })
  test('菜单管理页', async ({ page }) => {
    await assertPageRenders(page, '/menus')
  })
  test('审计日志页', async ({ page }) => {
    await assertPageRenders(page, '/audit')
  })
  test('系统监控页', async ({ page }) => {
    await assertPageRenders(page, '/monitor')
  })
  test('语言管理页', async ({ page }) => {
    await assertPageRenders(page, '/languages')
  })
  test('个人资料页', async ({ page }) => {
    await assertPageRenders(page, '/profile')
  })
})
