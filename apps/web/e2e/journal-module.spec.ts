import { expect, test } from '@playwright/test';

const password = 'password123';

test.describe('复盘日记模块', () => {
  test('启用 → 日记保存/编辑/删除/恢复 → 周复盘草稿 → 390px 无溢出', async ({ page }) => {
    test.setTimeout(90_000);
    const email = `journal-e2e-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('复盘验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    await page.goto('/settings');
    await page.getByRole('tab', { name: '模块', exact: true }).click();
    const card = page.getByTestId('module-card-journal');
    await card.getByRole('button', { name: '启用' }).click({ timeout: 10_000 });

    await page.goto('/m/journal/review');
    await expect(page.getByRole('heading', { name: '复盘', exact: true })).toBeVisible();
    await expect(page.getByText('还没有复盘')).toBeVisible();

    // 日记：心情 + 内容 → 保存 → 月列表出现
    await page.getByRole('tab', { name: '日记' }).click();
    await page.getByRole('button', { name: '心情 不错' }).click();
    await page
      .getByLabel('日记内容')
      .fill('今天的三件好事：交付了复盘模块。\n卡住的地方：无。\n明天最重要的一件事：写周复盘。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const list = page.getByRole('region', { name: '本月复盘' });
    await expect(list).toBeVisible({ timeout: 10_000 });
    await expect(list).toContainText('今天的三件好事');

    // 列表点击载入编辑器 → 追加内容保存（upsert）
    await list.getByRole('button').first().click();
    const content = page.getByLabel('日记内容');
    await expect(content).toContainText('交付了复盘模块');
    await content.fill('今天的三件好事：交付了复盘模块并验收。\n卡住的地方：无。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(list).toContainText('交付了复盘模块并验收', { timeout: 10_000 });

    // 删除 → 归档区 → 恢复
    await page.getByRole('button', { name: '删除本条' }).click();
    await expect(page.getByText('还没有复盘')).toBeVisible({ timeout: 10_000 });
    const archived = page.getByRole('region', { name: '已归档' });
    await expect(archived).toContainText('交付了复盘模块并验收');
    await archived.getByRole('button', { name: '恢复' }).click();
    await expect(page.getByRole('region', { name: '本月复盘' })).toBeVisible({ timeout: 10_000 });

    // 周复盘：本地草稿（模块未启用时优雅降级）→ 保存
    await page.getByRole('tab', { name: '周复盘' }).click();
    await page.getByRole('button', { name: '生成本地草稿' }).click();
    await expect(page.getByLabel('周复盘内容')).toContainText('做得好的：', { timeout: 10_000 });
    await page.getByRole('button', { name: '心情 一般' }).click();
    await page.getByLabel('周复盘内容').fill('本周收尾了复盘模块。做得好的：节奏稳。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('region', { name: '本月复盘' })).toContainText(
      '本周收尾了复盘模块',
      {
        timeout: 10_000,
      },
    );

    // 概览指标
    const overview = page.getByRole('status', { name: '复盘概览' });
    await expect(overview).toContainText('周报 1');

    // 390px 无横向溢出
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
