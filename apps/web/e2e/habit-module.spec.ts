import { expect, test } from '@playwright/test';

const password = 'password123';

test.describe('习惯打卡模块', () => {
  test('启用 → 新建习惯 → 打卡/取消 → 归档恢复', async ({ page }) => {
    test.setTimeout(60_000);
    const email = `habit-e2e-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('习惯验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

    await page.goto('/settings');
    await page.getByRole('button', { name: '模块', exact: true }).click();
    const card = page.getByTestId('module-card-habits');
    await card.getByRole('button', { name: '启用' }).click({ timeout: 10_000 });

    // 侧栏出现"习惯"入口，进入今日打卡页
    await page.goto('/m/habits/today');
    await expect(page.getByRole('heading', { name: '今日打卡' })).toBeVisible();
    await expect(page.getByText('还没有习惯')).toBeVisible();

    // 新建习惯（默认图标）
    await page.getByLabel('习惯名称').fill('读书 10 分钟');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('读书 10 分钟', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('0/1')).toBeVisible();

    // 打卡 → 已打卡 ✓ + 进度 1/1 + 连续 1 天
    await page.getByRole('button', { name: '打卡', exact: true }).click();
    await expect(page.getByText('已打卡 ✓')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1/1')).toBeVisible();
    await expect(page.getByText(/连续 1 天/)).toBeVisible();

    // 取消打卡 → 回到未打卡
    await page.getByRole('button', { name: '已打卡 ✓' }).click();
    await expect(page.getByRole('button', { name: '打卡', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('0/1')).toBeVisible();

    // 归档 → 空态 + 归档区出现 → 恢复
    await page.getByRole('button', { name: '归档习惯 读书 10 分钟' }).click();
    await expect(page.getByText('还没有习惯')).toBeVisible({ timeout: 10_000 });
    const archivedSection = page.getByRole('region', { name: '已归档' });
    await expect(archivedSection).toBeVisible();
    await archivedSection.getByRole('button', { name: '恢复' }).click();
    await expect(page.getByText('读书 10 分钟', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(archivedSection).toHaveCount(0);
  });
});
