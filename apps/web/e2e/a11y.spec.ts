import { expect, test, type Page } from '@playwright/test';
import { describeViolations, scanPage, type AxeViolation } from './support/axe';

/**
 * 应用页面无障碍回归：覆盖真实路由、亮/暗主题、390px 与 1280px。
 * 只断言 serious/critical，minor/moderate 记录在 docs/plans 的审计结论里。
 */

const email = `a11y-e2e-${Date.now()}@example.com`;
const password = 'password123';

type Theme = 'light' | 'dark';

interface RouteCase {
  name: string;
  path: string;
  /** 页面可交互的就绪信号，避免扫到骨架屏 */
  ready: (page: Page) => Promise<unknown>;
  /** 需要先切换的设置页签 */
  tab?: string;
}

const ROUTES: RouteCase[] = [
  {
    name: '大屏',
    path: '/',
    ready: (page) => page.getByRole('heading', { name: '个人大屏' }).waitFor(),
  },
  {
    name: '听歌统计',
    path: '/m/dashboard/listening',
    ready: (page) => page.getByRole('heading', { name: '听歌统计' }).waitFor(),
  },
  {
    name: '习惯',
    path: '/m/habits/today',
    ready: (page) => page.getByRole('heading', { name: '今日打卡' }).waitFor(),
  },
  {
    name: '待办',
    path: '/m/todo_notes/list',
    ready: (page) => page.getByRole('heading', { name: '待办', exact: true }).waitFor(),
  },
  {
    name: '笔记',
    path: '/m/sample_note/list',
    ready: (page) => page.getByRole('heading', { name: '笔记', exact: true }).waitFor(),
  },
  {
    name: '笔记回收站',
    path: '/m/sample_note/trash',
    ready: (page) => page.getByRole('heading', { name: '笔记回收站' }).waitFor(),
  },
  {
    name: 'AI 助手',
    path: '/assistant',
    ready: (page) => page.getByRole('heading', { name: 'AI 成长助手' }).waitFor(),
  },
  {
    name: '通知',
    path: '/notifications',
    ready: (page) => page.getByRole('heading', { name: '通知' }).waitFor(),
  },
  {
    name: '设置',
    path: '/settings',
    ready: (page) => page.getByRole('heading', { name: '设置' }).waitFor(),
  },
  {
    name: '设置 · 审计',
    path: '/settings',
    tab: '审计日志',
    ready: (page) => page.getByRole('heading', { name: '设置' }).waitFor(),
  },
];

interface Finding {
  where: string;
  violations: AxeViolation[];
}

function label(route: RouteCase, theme: Theme, width: number): string {
  return `${route.name} · ${theme} · ${width}px`;
}

async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((value) => {
    window.localStorage.setItem('atlas-theme', value);
    document.documentElement.setAttribute('data-theme', value);
  }, theme);
  // 让依赖主题的图表/过渡完成一次渲染
  await page.waitForTimeout(150);
}

test.describe('应用页面无障碍审计', () => {
  test('登录/注册、模块页、设置与通知在亮暗与双视口下无严重 axe 问题', async ({ page }) => {
    test.setTimeout(600_000);
    const findings: Finding[] = [];
    const overflows: string[] = [];
    const skipped: string[] = [];

    /** 页面就绪最多等 15s，超时记为跳过而不是拖死整个用例 */
    const waitReady = async (route: RouteCase, timeout = 15_000): Promise<boolean> =>
      Promise.race([
        route.ready(page).then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeout)),
      ]);

    const scan = async (route: RouteCase, theme: Theme, width: number) => {
      const where = label(route, theme, width);
      const violations = await scanPage(page);
      if (violations.length > 0) findings.push({ where, violations });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (overflow) overflows.push(where);
      console.log(
        `[a11y] ${where}: ${violations.length === 0 ? 'ok' : describeViolations(violations)}`,
      );
    };

    /** 每条路由只导航一次：主题与视口原地切换，避免 4 次全页加载 */
    const matrix = async (route: RouteCase) => {
      const started = Date.now();
      const dialog = page.getByRole('dialog');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(route.path, { timeout: 20_000, waitUntil: 'domcontentloaded' });
      // 首启引导等模态会给背景加 aria-hidden：等它出现并关掉，再等页面内容
      await Promise.race([
        route.ready(page).catch(() => undefined),
        dialog.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined),
      ]);
      if (await dialog.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      }
      if (!(await waitReady(route))) {
        skipped.push(route.name);
        console.log(`[a11y] ${route.name}: 页面未就绪，跳过`);
        return;
      }
      if (route.tab) {
        const tab = page.getByRole('tab', { name: route.tab, exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
      }

      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        for (const theme of ['light', 'dark'] as Theme[]) {
          await setTheme(page, theme);
          // 等骨架屏与按钮 loading 结束，否则会把过渡态的 50% 透明按钮当成对比度缺陷
          await page
            .waitForFunction(() => !document.querySelector('[data-loading]'), null, {
              timeout: 5_000,
            })
            .catch(() => undefined);
          await page.waitForTimeout(160);
          await scan(route, theme, width);
        }
      }
      console.log(`[a11y] ${route.name} 用时 ${Date.now() - started}ms`);
    };

    // 未登录页面
    await matrix({ name: '注册', path: '/register', ready: (p) => p.getByLabel('邮箱').waitFor() });
    await matrix({ name: '登录', path: '/login', ready: (p) => p.getByLabel('邮箱').waitFor() });

    // 登录并启用模块，之后的页面都在应用外壳内
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/register');
    await page.getByLabel('昵称').fill('无障碍验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    await page
      .getByRole('dialog')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await page.keyboard.press('Escape');

    await page.goto('/settings');
    await page.getByRole('tab', { name: '模块', exact: true }).click();
    for (const moduleName of ['todo_notes', 'sample_note', 'habits']) {
      const card = page.getByTestId(`module-card-${moduleName}`);
      const enable = card.getByRole('button', { name: '启用', exact: true });
      if (await enable.isVisible().catch(() => false)) {
        await enable.click();
        await expect(card.getByRole('button', { name: '停用', exact: true })).toBeVisible({
          timeout: 10_000,
        });
      }
    }

    for (const route of ROUTES) {
      await matrix(route);
    }

    const detail = findings
      .map((finding) => `${finding.where}\n${describeViolations(finding.violations)}`)
      .join('\n\n');
    expect(findings.length, `严重/关键 axe 问题：\n${detail}`).toBe(0);
    expect(overflows, `390/1280 横向溢出：${overflows.join('、')}`).toEqual([]);
    expect(skipped, `页面未就绪而跳过的路由：${skipped.join('、')}`).toEqual([]);
  });
});
