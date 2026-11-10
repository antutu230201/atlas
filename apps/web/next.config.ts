import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 允许并行开发服务与 E2E 服务使用独立构建目录，避免共享 .next/dev 锁与热更新缓存。
  distDir: process.env.ATLAS_NEXT_DIST_DIR ?? '.next',
  // 工作区包以 TS 源码形态直接参与编译（ADR-0004）
  transpilePackages: [
    '@atlas/ui',
    '@atlas/tokens',
    '@atlas/module-sample-note',
    '@atlas/module-todo-notes',
    '@atlas/module-dashboard',
    '@atlas/module-habits',
    '@atlas/module-goals',
  ],
};

export default nextConfig;
