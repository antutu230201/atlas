import { expect, test } from '@playwright/test';

const email = `shell-e2e-${Date.now()}@example.com`;
const password = 'password123';

test.describe('阶段 3 · 应用外壳与模块挂载', () => {
  test('注册 → 登录 → 建空间 → 启用示例模块 → 模块页写笔记', async ({ page }) => {
    // 注册（测试用户独立邮箱；全局装置会清库，重跑幂等）
    await page.goto('/register');
    await page.getByLabel('昵称').fill('外壳验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    // 首页：零工作空间 → onboarding 创建表单
    await expect(page.getByText('还没有工作空间')).toBeVisible();
    await page.getByRole('button', { name: '+ 新建工作空间' }).click();
    await page.getByLabel('工作空间名称').fill('外壳验收空间');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('当前在「外壳验收空间」')).toBeVisible({ timeout: 10_000 });

    // 启用示例模块（设置 → 模块页签；按 testid 定位，不依赖模块卡片顺序）
    await page.goto('/settings');
    await page.getByRole('button', { name: '模块', exact: true }).click();
    const sampleCard = page.getByTestId('module-card-sample_note');
    const enableButton = sampleCard.getByRole('button', { name: '启用', exact: true });
    await expect(enableButton).toBeVisible({ timeout: 10_000 });
    await enableButton.click();
    await expect(sampleCard.getByRole('button', { name: '停用', exact: true })).toBeVisible();

    // 动态模块页直达（导航入口会在挂载重取后出现）
    await page.goto('/m/sample_note/list');
    const navLink = page.getByRole('link', { name: '笔记' }).first();
    await expect(navLink).toBeVisible({ timeout: 10_000 });

    // 模块页：创建一条笔记并回显
    await page.getByLabel('标题').fill('外壳验收笔记');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('外壳验收笔记')).toBeVisible({ timeout: 10_000 });
  });

  test('登出后访问受保护页面跳转登录', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('昵称').fill('登出验收');
    await page.getByLabel('邮箱').fill(`logout-e2e-${Date.now()}@example.com`);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    await page.getByRole('button', { name: '用户菜单' }).click();
    await page.getByRole('menuitem', { name: '登出' }).click();
    await page.waitForURL('/login');

    await page.goto('/');
    await page.waitForURL(/\/login/);
  });
});
