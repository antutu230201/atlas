import { expect, test } from '@playwright/test';

/**
 * 动效系统示例页（/design/motion）：16 种动效区块全部渲染；
 * prefers-reduced-motion 下降级：打字机/数字递增直接呈现终态（内容不因动画丢失）。
 */

const DEMO_NOS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
];

test.describe('动效系统示例页', () => {
  test('三原则 + 16 种动效区块全部渲染', async ({ page }) => {
    await page.goto('/design/motion');
    await expect(page.getByRole('heading', { name: '动效系统' })).toBeVisible();
    await expect(page.getByRole('region', { name: '动效三原则' })).toBeVisible();

    for (const no of DEMO_NOS) {
      await expect(page.locator(`[data-motion="${no}"]`)).toHaveCount(1);
    }

    // 打字机开始打出（光标挂载）；计数组件进入视口后显示终值
    await page.locator('[data-motion="12"]').scrollIntoViewIfNeeded();
    await expect(page.getByText('把每一次复盘')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-motion="10"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-motion="10"]')).toContainText('12,860', { timeout: 5_000 });
  });

  test('reduced-motion：打字机与数字递增直接呈现终态', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/design/motion');
    await expect(page.getByRole('heading', { name: '动效系统' })).toBeVisible();

    await page.locator('[data-motion="12"]').scrollIntoViewIfNeeded();
    await expect(page.getByText('把每一次复盘，都变成下一步的地基。')).toBeVisible({
      timeout: 3_000,
    });
    await page.locator('[data-motion="10"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-motion="10"]')).toContainText('12,860', { timeout: 3_000 });

    await context.close();
  });
});
