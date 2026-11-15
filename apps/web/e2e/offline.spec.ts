import { expect, test } from '@playwright/test';

/**
 * 完整离线（P2 收口）：Service Worker 缓存壳 + 离线横幅。
 * SW 仅生产环境自动注册（dev 会干扰热更新），因此本 spec 在测试里
 * 显式注册同一份 public/sw.js 验证其缓存策略本身：
 * - 页面导航 Network-First → 离线命中缓存页（SSR HTML 仍可交互）
 * - API（/v1/**）永不缓存
 * - 横幅由 navigator.onLine / online 事件驱动
 */

test('离线：缓存壳可用 + 横幅出现，恢复网络后横幅消失', async ({ page, context }) => {
  await page.goto('/register');
  await expect(page.getByRole('button', { name: '创建账号' })).toBeVisible();

  // 显式注册 SW（生产环境由 PwaRegister 自动注册，dev 由测试代管）
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  // 预热：受 SW 控制的一次加载（静态 chunk 与页面 HTML 进入缓存）
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('button', { name: '创建账号' })).toBeVisible();

  // 断网 → 刷新：应命中缓存页（SSR 表单仍在，可交互）而非浏览器错误页
  await context.setOffline(true);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('button', { name: '创建账号' })).toBeVisible({ timeout: 10_000 });

  // 离线横幅（navigator.onLine=false → offline 事件 → data-testid）
  await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 10_000 });

  // API 层永不缓存：断网时 API 请求必须失败（防止敏感数据被 SW 缓存误导）
  const apiResult = await page.evaluate(async () => {
    try {
      const response = await fetch('/v1/auth/me', { credentials: 'include' });
      return response.ok ? 'unexpected-ok' : 'failed-as-expected';
    } catch {
      return 'failed-as-expected';
    }
  });
  expect(apiResult).toBe('failed-as-expected');

  // 恢复网络 → online 事件 → 横幅消失
  await context.setOffline(false);
  await expect(page.getByTestId('offline-banner')).toBeHidden({ timeout: 10_000 });
});
