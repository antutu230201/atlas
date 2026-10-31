import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // 阶段 2 验收标准（总体设计文档）：核心包测试覆盖率不低于 80%
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
