import { defineConfig } from '@playwright/test';

const apiPort = 3001;
const webPort = 3000;

/**
 * 端到端测试：自带两个 dev server（API 会按需拉起内嵌 PostgreSQL，首次较慢，
 * 因此超时给足）。本地复用已运行的服务；CI 中必须全新启动。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @atlas/api dev',
      url: `http://localhost:${apiPort}/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter @atlas/web dev',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
