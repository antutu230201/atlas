import { expect, test } from '@playwright/test';

const password = 'password123';

test.describe('个人大屏模块（假数据源）', () => {
  test('启用 → 首启引导选城市 → 时钟/天气/热榜/滚动头条可见', async ({ page }) => {
    test.setTimeout(60_000);
    const email = `dash-e2e-a-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('大屏验收A');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    await page.getByRole('button', { name: '+ 新建工作空间' }).click();
    await page.getByLabel('工作空间名称').fill('大屏验收空间A');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('大屏验收空间A').first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/settings');
    await page.getByRole('button', { name: '模块', exact: true }).click();
    const card = page.getByTestId('module-card-dashboard');
    await card.getByRole('button', { name: '启用' }).click({ timeout: 10_000 });

    await page.goto('/m/dashboard/screen');

    // 未设置城市 → 设置抽屉自动弹出引导（模态抽屉会 aria-hidden 页面其余部分，
    // 因此页面标题等断言统一放到抽屉关闭之后）
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible({ timeout: 15_000 });

    // 定位失败也可搜索：假数据源返回杭州
    await drawer.getByLabel('搜索城市').fill('杭州');
    await drawer.getByRole('button', { name: '搜索' }).click();
    await drawer.getByRole('button', { name: /杭州/ }).first().click();

    // 抽屉关闭，天气卡出现（假数据：晴间多云）
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: '个人大屏' })).toBeVisible();
    await expect(page.getByText('杭州').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('晴间多云').first()).toBeVisible({ timeout: 10_000 });

    // 时钟走时（role=timer）
    await expect(page.getByRole('timer', { name: '当前时间' })).toBeVisible();

    // 热榜卡片（假数据源 ×5）
    await expect(page.getByText('微博热搜').first()).toBeVisible();
    await expect(page.getByText('抖音热搜').first()).toBeVisible();
    await expect(page.getByText('测试热搜第 1 条').first()).toBeVisible();

    // 滚动头条
    await expect(page.getByRole('marquee', { name: '滚动头条' })).toBeVisible();

    // 一言
    await expect(page.getByText(/「.+」/).first()).toBeVisible();
  });

  test('倒计时增删 + 数据源开关立即生效', async ({ page }) => {
    test.setTimeout(60_000);
    const email = `dash-e2e-b-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('大屏验收B');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    await page.getByRole('button', { name: '+ 新建工作空间' }).click();
    await page.getByLabel('工作空间名称').fill('大屏验收空间B');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('大屏验收空间B').first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/settings');
    await page.getByRole('button', { name: '模块', exact: true }).click();
    const card = page.getByTestId('module-card-dashboard');
    await card.getByRole('button', { name: '启用' }).click({ timeout: 10_000 });

    await page.goto('/m/dashboard/screen');

    // 先等自动弹出的设置抽屉（模态期间页面其余部分 aria-hidden），关掉它再断言页面
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: '个人大屏' })).toBeVisible();

    // 创建倒计时（置顶星）
    await page.getByLabel('倒计时名称').fill('项目上线');
    await page.getByLabel('目标日期').fill('2030-12-31');
    await page.getByRole('button', { name: '添加倒计时' }).click();
    await expect(page.getByText('项目上线')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/还有 \d+ 天/).first()).toBeVisible();

    // 删除 → 卡片消失
    await page.getByLabel('删除 项目上线').click();
    await expect(page.getByText('项目上线')).toHaveCount(0, { timeout: 10_000 });

    // 设置抽屉：关掉抖音源 → 卡片消失；回收站里有刚删除的倒计时
    await page.getByRole('button', { name: '设置' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('项目上线')).toBeVisible();
    await drawer.getByLabel('启用或停用抖音热搜').click();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(page.getByText('抖音热搜')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('微博热搜').first()).toBeVisible();
  });
});
