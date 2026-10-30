import { defineConfig } from '@playwright/test';

const storybookUrl = 'http://localhost:6006';

/**
 * 组件级质量门（ADR-0004 阶段 1 收尾）：
 * - a11y 项目：遍历全部 Story 跑 axe，serious/critical 必须为零；
 * - visual 项目：为每个 Story 截图并与基线对比（基线按平台分目录存放）。
 * 两者共享一个自动启动的 Storybook dev server。
 */
export default defineConfig({
  testMatch: ['a11y/**/*.spec.ts', 'visual/**/*.spec.ts'],
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  use: {
    viewport: { width: 800, height: 600 },
  },
  webServer: {
    command: 'pnpm exec storybook dev --port 6006 --no-open --ci',
    url: `${storybookUrl}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  projects: [
    { name: 'a11y', testMatch: /a11y\/.*\.spec\.ts/ },
    { name: 'visual', testMatch: /visual\/.*\.spec\.ts/ },
  ],
});
