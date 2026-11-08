import { expect, test } from '@playwright/test';

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
    await page.getByRole('button', { name: '模块', exact: true }).click();
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

    // 完成第一条（默认排最新在前），确认出现删除线
    const doneButton = page.getByLabel('设为 done').first();
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
  });
});
