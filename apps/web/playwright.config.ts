import { defineConfig } from '@playwright/test';

/**
 * 端口可经环境变量覆盖（E2E_API_PORT / E2E_WEB_PORT）。
 * 本机 3000/3001/3002 常被其他实例占用（apps/api/.env 有说明），本地跑 e2e 时：
 *   E2E_API_PORT=3011 E2E_WEB_PORT=3010 pnpm e2e
 * API 的内嵌 PostgreSQL 在 5432 已有实例时会直接复用（见 infra/embedded-postgres.ts）。
 */
const apiPort = Number(process.env.E2E_API_PORT ?? 3001);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);

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
      env: {
        PORT: String(apiPort),
        // e2e 注入假数据源：大屏模块不依赖外网（ATLAS_DASHBOARD_FAKE 仅作用于 dashboard 适配器）
        ATLAS_DASHBOARD_FAKE: '1',
        // web dev server 将跑在 webPort，CORS 放行
        CORS_ORIGIN: `http://localhost:${webPort}`,
      },
    },
    {
      command: 'pnpm --filter @atlas/web dev',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: String(webPort),
        NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
      },
    },
  ],
});
