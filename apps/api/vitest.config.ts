import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // 集成测试共享一个内嵌 PostgreSQL（5433），串行执行；单测也会随全局装置一起跑
    globalSetup: ['./test/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
