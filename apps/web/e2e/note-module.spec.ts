import { expect, test } from '@playwright/test';

const email = `note-e2e-${Date.now()}@example.com`;
const password = 'password123';

/** 100 条混合数据：1/3 空正文、偶数条长正文、其余短正文 */
function buildNotes() {
  const longBody = '这是一段用于验证动态行高的长正文，展开后行高要重新测量。'.repeat(30);
  return Array.from({ length: 100 }, (_, index) => ({
    id: `virtual-note-${index}`,
    title: `虚拟笔记 ${index + 1}`,
    body: index % 3 === 0 ? '' : index % 2 === 0 ? longBody : `第 ${index + 1} 条笔记的短正文。`,
    deletedAt: null,
    createdAt: new Date(Date.UTC(2026, 10, 8, 12, 0, 100 - index)).toISOString(),
  }));
}

test.describe('笔记长列表虚拟化', () => {
  test('100 篇混合笔记：按需挂载、展开重测、删除与焦点归位', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('昵称').fill('笔记验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    await page
      .getByRole('dialog')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await page.keyboard.press('Escape');

    // 启用示例笔记模块
    await page.goto('/settings');
    await page.getByRole('tab', { name: '模块', exact: true }).click();
    const moduleCard = page.getByTestId('module-card-sample_note');
    await moduleCard.getByRole('button', { name: '启用', exact: true }).click();
    await expect(moduleCard.getByRole('button', { name: '停用', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // 用可变的 mock 数据替换真实列表，删除与恢复按调用结果更新
    let notes = buildNotes();
    let trash = Array.from({ length: 3 }, (_, index) => ({
      id: `trash-note-${index}`,
      title: `回收站笔记 ${index + 1}`,
      body: '',
      deletedAt: new Date(Date.UTC(2026, 10, 8, 10, 0, index)).toISOString(),
      createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, index)).toISOString(),
    }));
    const json = (data: unknown) => ({
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
    await page.route('**/sample_note/call/list', (route) => route.fulfill(json({ notes })));
    await page.route('**/sample_note/call/listTrash', (route) =>
      route.fulfill(json({ notes: trash })),
    );
    let removedId: string | null = null;
    await page.route('**/sample_note/call/remove', async (route) => {
      removedId = (JSON.parse(route.request().postData() ?? '{}') as { id?: string }).id ?? null;
      notes = notes.filter((note) => note.id !== removedId);
      await route.fulfill(json({ removed: removedId }));
    });
    await page.route('**/sample_note/call/restore', async (route) => {
      const id = (JSON.parse(route.request().postData() ?? '{}') as { id?: string }).id;
      trash = trash.filter((note) => note.id !== id);
      await route.fulfill(json({ restored: id }));
    });

    // 手机宽度：首屏只挂载可视区附近的行
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/m/sample_note/list');
    await expect(page.getByText('虚拟笔记 1', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('list', { name: '笔记列表' })).toBeVisible();
    await expect(page.getByTestId('note-row').first()).toHaveAttribute('aria-posinset', '1');
    expect(await page.getByTestId('note-row').count()).toBeLessThan(30);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // 展开长正文：行高实测后撑开，下一行不重叠
    const firstExpandable = page
      .getByTestId('note-row')
      .filter({ has: page.getByRole('button', { name: '展开全文' }) })
      .first();
    const expandIndex = Number(await firstExpandable.getAttribute('data-index'));
    const expandRow = page.locator(`[data-testid="note-row"][data-index="${expandIndex}"]`);
    const collapsedHeight = (await expandRow.boundingBox())?.height ?? 0;
    await expandRow.getByRole('button', { name: '展开全文' }).click();
    await expect(expandRow.getByRole('button', { name: '收起' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect
      .poll(async () => (await expandRow.boundingBox())?.height ?? 0)
      .toBeGreaterThan(collapsedHeight);
    const expandedBox = await expandRow.boundingBox();
    const nextBox = await page
      .locator(`[data-testid="note-row"][data-index="${expandIndex + 1}"]`)
      .boundingBox();
    if (expandedBox && nextBox) {
      expect(nextBox.y).toBeGreaterThanOrEqual(expandedBox.y + expandedBox.height - 2);
    }
    await expandRow.getByRole('button', { name: '收起' }).click();
    await expect
      .poll(async () => (await expandRow.boundingBox())?.height ?? 0)
      .toBeLessThanOrEqual(collapsedHeight + 2);

    // 滚到末尾：仍只挂载少量行，并能访问第 100 条
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText('虚拟笔记 100', { exact: true })).toBeVisible();
    const lastRow = page.getByTestId('note-row').last();
    await expect(lastRow).toHaveAttribute('aria-posinset', '100');
    expect(await page.getByTestId('note-row').count()).toBeLessThan(30);

    // 键盘删除最后一条：请求正确、列表变 99、焦点留在列表内
    await lastRow.getByRole('button', { name: '删除 虚拟笔记 100' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => removedId).toBe('virtual-note-99');
    await expect(page.getByText('虚拟笔记 100', { exact: true })).toHaveCount(0, {
      timeout: 5_000,
    });
    await expect(page.getByTestId('note-row').last()).toHaveAttribute('aria-posinset', '99');
    await expect(page.getByTestId('note-row').last().getByRole('button').first()).toBeFocused();

    // 桌面宽度无横向溢出
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByText('虚拟笔记 1', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await page.getByTestId('note-row').count()).toBeLessThan(30);

    // 回收站：恢复一条后列表减一
    await page.goto('/m/sample_note/trash');
    await expect(page.getByText('回收站笔记 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '恢复' }).first().click();
    await expect(page.getByText('笔记已恢复', { exact: true })).toBeVisible();
    await expect(page.getByText('回收站笔记 1', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '恢复' })).toHaveCount(2);
  });
});
