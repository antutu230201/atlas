import { expect, test } from '@playwright/test';

test.describe('阶段 0 · 验收首页', () => {
  test('展示健康状态且全部服务正常', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '个人成长系统' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '系统健康状态' })).toBeVisible();

    // 骨架屏之后应出现四个服务行，且全部为"正常"
    for (const service of ['API 服务', '数据库', '任务队列', '文件存储']) {
      const row = page.getByRole('listitem').filter({ hasText: service });
      await expect(row).toBeVisible();
      await expect(row.getByText('正常', { exact: true })).toBeVisible();
    }

    await expect(page.getByText('全部正常', { exact: true })).toBeVisible();
  });
});
