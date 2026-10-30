import { expect, test } from '@playwright/test';

test.describe('阶段 1 · 设计系统示例页', () => {
  test('渲染全部组件分区并支持三态主题切换', async ({ page }) => {
    await page.goto('/design');

    await expect(page.getByRole('heading', { name: '设计系统 · 晨白 Dawn' })).toBeVisible();
    for (const section of ['按钮', '输入与表单', '标签与徽标', '反馈与浮层', '表格']) {
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible();
    }

    // 三态主题切换写到 <html data-theme>（防闪烁脚本的同一机制）
    await page.getByRole('radio', { name: '暗' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: '亮' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('radio', { name: '跟随' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  });

  test('弹窗可打开且可键盘关闭', async ({ page }) => {
    await page.goto('/design');
    await page.getByRole('button', { name: '打开弹窗' }).click();
    await expect(page.getByText('确认归档？')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('确认归档？')).toBeHidden();
  });
});
