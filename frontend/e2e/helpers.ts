import { Page, expect } from '@playwright/test'

export const ADMIN_EMAIL = process.env.PTTECH_E2E_ADMIN || 'admin@bctech.ai'
export const ADMIN_PW = process.env.PTTECH_E2E_ADMIN_PW || 'admin123'

/** Log in through the UI and land on the dashboard. */
export async function login(page: Page, email = ADMIN_EMAIL, pw = ADMIN_PW) {
  await page.goto('/login')
  await page.getByRole('textbox').first().fill(email)          // email input
  await page.locator('input[type="password"]').fill(pw)
  await page.getByRole('button', { name: /登录|log ?in|sign in/i }).click()
  // Wait until we leave /login (token stored, redirected to /)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

/** Navigate to an in-app route and wait for network to settle. */
export async function gotoRoute(page: Page, route: string) {
  await page.goto(route)
  await page.waitForLoadState('networkidle').catch(() => {})
}

/** True if the page shows a hard error/blank crash (React error boundary or 404 shell). */
export async function assertNoAppCrash(page: Page) {
  const body = await page.locator('body').innerText().catch(() => '')
  expect(body).not.toMatch(/Something went wrong|Application error|Cannot read propert|Unexpected Application Error/i)
}
