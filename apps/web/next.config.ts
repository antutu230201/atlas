import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 工作区包以 TS 源码形态直接参与编译（ADR-0004）
  transpilePackages: [
    '@atlas/ui',
    '@atlas/tokens',
    '@atlas/module-sample-note',
    '@atlas/module-todo-notes',
    '@atlas/module-dashboard',
    '@atlas/module-habits',
  ],
};

export default nextConfig;
