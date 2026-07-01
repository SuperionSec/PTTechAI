import { test, expect } from '@playwright/test'
import { login, gotoRoute, assertNoAppCrash } from './helpers'

test('smoke: login and reach dashboard', async ({ page }) => {
  await login(page)
  await assertNoAppCrash(page)
  // Sidebar / layout should be present after login
  await expect(page.locator('body')).toBeVisible()
  const url = page.url()
  expect(url).not.toContain('/login')
})
