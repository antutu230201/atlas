import { expect, test, type Request } from '@playwright/test';

const email = `todo-e2e-${Date.now()}@example.com`;
const password = 'password123';

test.describe('阶段 3b · 待办与笔记模块', () => {
  test('注册 → 启用待办 → 创建/完成/筛选/回收站', async ({ page }) => {
    // 注册并进入外壳
    await page.goto('/register');
    await page.getByLabel('昵称').fill('待办验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    // 创建工作空间
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

    // 启用待办模块
    await page.goto('/settings');
    await page.getByRole('tab', { name: '模块', exact: true }).click();
    const todoCard = page.getByTestId('module-card-todo_notes');
    const enable = todoCard.getByRole('button', { name: '启用' });
    await expect(enable).toBeVisible({ timeout: 10_000 });
    await enable.click();
    await expect(todoCard.getByRole('button', { name: '停用', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // 进入待办列表页
    await page.goto('/m/todo_notes/list');
    await expect(page.getByPlaceholder('新待办，回车快速添加…')).toBeVisible({ timeout: 10_000 });

    // 创建三条（每次创建后等列表刷新）
    for (const title of ['写周报', '晨间跑步', '交房租']) {
      await page.getByLabel('新待办标题').fill(title);
      await page.getByRole('button', { name: '添加' }).click();
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
    }

    let latestListInput: { sort?: string; dir?: string } | null = null;
    const trackSortRequest = (request: Request) => {
      if (!request.url().includes('/todo_notes/call/list')) return;
      latestListInput = JSON.parse(request.postData() ?? '{}') as { sort?: string; dir?: string };
    };
    page.on('request', trackSortRequest);
    await page.getByRole('combobox', { name: '排序方式' }).click();
    await page.getByRole('option', { name: '优先级' }).click();
    await expect.poll(() => latestListInput?.sort).toBe('priority');
    await page.getByRole('button', { name: '切换为升序' }).click();
    await expect.poll(() => latestListInput?.dir).toBe('asc');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    page.off('request', trackSortRequest);

    // 命令面板异步搜到待办后，结果也可完整使用方向键与回车选择。
    await page.keyboard.press('Control+k');
    const commandSearch = page.getByRole('combobox', { name: '命令搜索' });
    await commandSearch.fill('晨间跑步');
    await expect(page.getByRole('status').filter({ hasText: '正在搜索待办' })).toBeVisible();
    const searchOption = page.getByRole('option', { name: /晨间跑步/ });
    await expect(searchOption).toBeVisible({ timeout: 10_000 });
    await commandSearch.press('ArrowDown');
    await commandSearch.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('晨间跑步').first()).toBeVisible();

    // 搜索快速输入时只发出一次请求；结果更新后筛选为唯一匹配项。
    let listRequests = 0;
    const trackListRequest = (request: Request) => {
      if (request.url().includes('/todo_notes/call/list')) listRequests += 1;
    };
    page.on('request', trackListRequest);
    await page.getByLabel('搜索标题').pressSequentially('晨间跑步', { delay: 25 });
    await expect.poll(() => listRequests, { timeout: 5_000 }).toBe(1);
    await expect(page.getByRole('button', { name: '删除' })).toHaveCount(1);
    page.off('request', trackListRequest);
    await page.getByLabel('搜索标题').fill('');
    await expect(page.getByRole('button', { name: '删除' })).toHaveCount(3);

    // 看板支持键盘切换状态，左右方向键可移动后再撤回。
    await page.getByRole('button', { name: '看板' }).click();
    const boardCard = page.getByRole('group', { name: /写周报，待办/ });
    await boardCard.focus();
    await page.keyboard.press('ArrowRight');
    const movedCard = page.getByRole('group', { name: /写周报，进行中/ });
    await expect(movedCard).toBeVisible();
    await movedCard.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('group', { name: /写周报，待办/ })).toBeVisible();
    await page.getByRole('button', { name: '列表' }).click();

    // 完成第一条（默认排最新在前），确认出现删除线
    const doneButton = page.getByLabel('设为已完成').first();
    await doneButton.click();
    await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // 筛选已完成：恰好 1 条
    await page.getByRole('button', { name: '已完成', exact: true }).click();
    await expect(page.getByRole('button', { name: '删除' })).toHaveCount(1);

    // 切回全部：3 条
    await page.getByRole('button', { name: '全部', exact: true }).click();
    await expect(page.getByRole('button', { name: '删除' })).toHaveCount(3);

    // 删除 → 回收站
    await page.getByRole('button', { name: '全部', exact: true }).click();
    await page.getByRole('button', { name: '删除' }).first().click();
    await expect(page.getByRole('button', { name: '删除' })).toHaveCount(2, { timeout: 5_000 });

    // 回收站恢复
    await page.goto('/m/todo_notes/trash');
    await expect(page.getByRole('button', { name: '恢复' })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '恢复' }).click();
    await expect(page.getByText('回收站是空的')).toBeVisible({ timeout: 5_000 });

    // 回到列表确认回来了
    await page.goto('/m/todo_notes/list');
    await expect(page.getByText('交房租')).toBeVisible({ timeout: 5_000 });

    // 永久删除需要二次确认；Escape 可取消确认状态。
    await page.getByRole('button', { name: '删除' }).first().click();
    await page.goto('/m/todo_notes/trash');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const purgeButton = page.getByRole('button', { name: /^永久删除 / }).first();
    await purgeButton.click();
    await expect(page.getByRole('button', { name: /^确认永久删除 / })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^永久删除 / }).first()).toBeVisible();
    await page
      .getByRole('button', { name: /^永久删除 / })
      .first()
      .click();
    await page.getByRole('button', { name: /^确认永久删除 / }).click();
    await expect(page.getByText('回收站是空的')).toBeVisible({ timeout: 5_000 });
    await page.setViewportSize({ width: 1280, height: 900 });
  });
});
