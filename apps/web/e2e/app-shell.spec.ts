import { expect, test } from '@playwright/test';

const email = `shell-e2e-${Date.now()}@example.com`;
const password = 'password123';

test.describe('阶段 3 · 应用外壳与模块挂载', () => {
  test('注册（自动个人空间+大屏）→ 启用示例模块 → 模块页写笔记', async ({ page }) => {
    // 注册（测试用户独立邮箱；全局装置会清库，重跑幂等）。
    // 注册即自动开通个人工作空间并启用大屏（ADR-0008），落地根路径即个人大屏。
    await page.goto('/register');
    await page.getByLabel('昵称').fill('外壳验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: '个人大屏' })).toBeVisible({ timeout: 15_000 });
    // 未设城市 → 首启引导抽屉以模态弹出，先关掉
    await page
      .getByRole('dialog')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await page.keyboard.press('Escape');

    let aiCalls = 0;
    await page.route('**/v1/ai/chat', async (route) => {
      aiCalls += 1;
      if (aiCalls === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'ai.unavailable', message: 'AI 服务暂不可用' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { text: '已保存的回复' } }),
      });
    });
    await page.goto('/assistant');
    const assistantInput = page.getByLabel('AI 助手消息');
    await assistantInput.fill('请帮我安排今天');
    await assistantInput.press('Enter');
    await expect(page.locator('[role="alert"]').filter({ hasText: '回复失败' })).toBeVisible();
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByText('已保存的回复')).toBeVisible();
    await expect(page.getByText('请帮我安排今天', { exact: true })).toHaveCount(1);
    await page.reload();
    await expect(page.getByText('请帮我安排今天', { exact: true })).toBeVisible();
    await expect(page.getByText('已保存的回复')).toBeVisible();
    await page.getByRole('button', { name: '清空对话' }).click();
    await expect(page.getByText('有什么想聊的？')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '搜索页面和待办' }).click();
    await expect(page.getByRole('combobox', { name: '命令搜索' })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: '通知' })).toBeVisible();
    await expect(page.getByText('暂无通知')).toBeVisible();
    await page.getByRole('checkbox', { name: '只看未读' }).check();
    await expect(page.getByText('没有未读通知')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 启用示例模块（设置 → 模块页签；按 testid 定位，不依赖模块卡片顺序）
    await page.goto('/settings');
    const moduleTab = page.getByRole('tab', { name: '模块' });
    await expect(moduleTab).toHaveAttribute('aria-selected', 'true');
    await moduleTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '审计日志' })).toBeFocused();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(moduleTab).toBeFocused();
    const sampleCard = page.getByTestId('module-card-sample_note');
    const enableButton = sampleCard.getByRole('button', { name: '启用', exact: true });
    await expect(enableButton).toBeVisible({ timeout: 10_000 });
    await enableButton.click();
    await expect(sampleCard.getByRole('button', { name: '停用', exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'AI 配置' }).click();
    const timeoutInput = page.getByLabel('超时毫秒');
    await expect(timeoutInput).toHaveValue(/\d+/);
    await timeoutInput.fill('999');
    await expect(page.getByText('超时必须是 1000–120000 的整数。')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await timeoutInput.fill('30000');
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();

    // 动态模块页直达（导航入口会在挂载重取后出现）
    await page.goto('/m/sample_note/list');
    const navLink = page.getByRole('link', { name: '笔记' }).first();
    await expect(navLink).toBeVisible({ timeout: 10_000 });

    // 模块页：创建一条笔记并回显
    await page.getByLabel('标题').fill('外壳验收笔记');
    const longBody = '每天完成一个小目标，让进步可以被看见。'.repeat(24);
    await page.getByLabel('正文').fill(longBody);
    await page.getByRole('button', { name: '保存笔记' }).click();
    await expect(page.getByText('外壳验收笔记')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '展开全文' }).click();
    await expect(page.getByText(longBody, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '删除 外壳验收笔记' }).click();
    await expect(page.getByText('还没有笔记')).toBeVisible();
    await page.goto('/m/sample_note/trash');
    await expect(page.getByText('外壳验收笔记')).toBeVisible();
    await page.getByRole('button', { name: '恢复' }).click();
    await expect(page.getByText('笔记已恢复', { exact: true })).toBeVisible();
    await page.goto('/m/sample_note/list');
    await expect(page.getByText('外壳验收笔记')).toBeVisible();
  });

  test('登出后访问受保护页面跳转登录', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('昵称').fill('登出验收');
    await page.getByLabel('邮箱').fill(`logout-e2e-${Date.now()}@example.com`);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    // 未设城市 → 首启引导抽屉会弹出并拦截顶栏点击，先关掉
    await page
      .getByRole('dialog')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '用户菜单' }).click();
    await page.getByRole('menuitem', { name: '登出' }).click();
    await page.waitForURL('/login');

    await page.goto('/');
    await page.waitForURL(/\/login/);
  });
});
