import { expect, test } from '@playwright/test';

const password = 'password123';

test.describe('目标与年度计划模块', () => {
  test('启用 → 新建目标 → 数值/达成关键结果 → 进度 → 归档恢复', async ({ page }) => {
    test.setTimeout(90_000);
    const email = `goal-e2e-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('目标验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

    await page.goto('/settings');
    await page.getByRole('tab', { name: '模块', exact: true }).click();
    const card = page.getByTestId('module-card-goals');
    await card.getByRole('button', { name: '启用' }).click({ timeout: 10_000 });

    // 侧栏出现"目标"入口，进入列表页
    await page.goto('/m/goals/list');
    await expect(page.getByRole('heading', { name: '目标', exact: true })).toBeVisible();
    await expect(page.getByText('还没有目标')).toBeVisible();

    // 新建目标（默认年度周期，选 📚 图标）
    await page.getByLabel('目标标题').fill('2026 读 12 本书');
    await page.getByRole('button', { name: '图标 📚' }).click();
    await page.getByRole('button', { name: '创建目标' }).click();
    await expect(page.getByRole('heading', { name: '2026 读 12 本书', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const objectiveCard = page.getByRole('article', { name: '目标 2026 读 12 本书' });
    await expect(objectiveCard).toContainText('0%');
    await expect(objectiveCard).toContainText(/年度/);

    // 数值型关键结果：读完 12 本书（0 → 12 本）
    await page.getByRole('button', { name: '＋ 添加关键结果' }).click();
    await page.getByLabel('关键结果标题').fill('读完 12 本书');
    await page.getByLabel('起点数值').fill('0');
    await page.getByLabel('目标数值').fill('12');
    await page.getByLabel('数值单位').fill('本');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(objectiveCard).toContainText('0 本 / 12 本');

    // 输入当前值 6 → 进度 50%
    const currentInput = page.getByRole('spinbutton', { name: '读完 12 本书 当前进度' });
    await currentInput.fill('6');
    await currentInput.blur();
    await expect(objectiveCard).toContainText('50%');

    // 步进 ＋（步长 1.2）→ 7.2/12 = 60%
    await page.getByRole('button', { name: '增加 读完 12 本书 当前进度' }).click();
    await expect(objectiveCard).toContainText('60%');

    // 达成型关键结果：写一篇年度书单
    await page.getByRole('button', { name: '＋ 添加关键结果' }).click();
    await page.getByLabel('关键结果标题').fill('写一篇年度书单');
    await page.getByRole('combobox', { name: '关键结果类型' }).click();
    await page.getByRole('option', { name: '达成型' }).click();
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(objectiveCard.getByText('写一篇年度书单')).toBeVisible({ timeout: 10_000 });

    // 标记达成 → 目标进度 (0.6 + 1) / 2 = 80%
    await page.getByRole('button', { name: '标记达成' }).click();
    await expect(page.getByRole('button', { name: '已达成 ✓' })).toBeVisible({ timeout: 10_000 });
    await expect(objectiveCard).toContainText('80%');

    // 概览指标同步
    const banner = page.getByRole('status', { name: '目标概览' });
    await expect(banner).toContainText('80');
    await expect(banner).toContainText('1/2');

    // 归档 → 空态 + 归档区；恢复 → 进度与关键结果保留
    await page.getByRole('button', { name: '归档目标 2026 读 12 本书' }).click();
    await expect(page.getByText('还没有目标')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('已归档')).toContainText('2026 读 12 本书');
    await page.getByRole('button', { name: '恢复' }).click();
    await expect(page.getByRole('heading', { name: '2026 读 12 本书', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(objectiveCard).toContainText('80%');
    await expect(objectiveCard.getByText('写一篇年度书单')).toBeVisible();
  });
});
