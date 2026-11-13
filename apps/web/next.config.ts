import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * ZCode Sites 部署形态（docs/deploy/zcode-site.md）：
 * ATLAS_SITE_DEPLOY=1 构建时产出 standalone 服务，并把 /v1 反代到同容器内的 API。
 * 前端经 env 置空的 NEXT_PUBLIC_API_URL 走同源相对路径 /v1/...，由该反代转发——
 * 同源请求无 CORS，会话 Cookie 不受跨域限制。
 */
const siteDeploy = process.env.ATLAS_SITE_DEPLOY === '1';
const siteApiOrigin = process.env.ATLAS_SITE_API_ORIGIN ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  // 允许并行开发服务与 E2E 服务使用独立构建目录，避免共享 .next/dev 锁与热更新缓存。
  distDir: process.env.ATLAS_NEXT_DIST_DIR ?? '.next',
  ...(siteDeploy
    ? {
        output: 'standalone' as const,
        // pnpm monorepo 下 Turbopack 的依赖追踪默认从 app 目录起算，会漏掉提升到
        // 工作区根的 node_modules（standalone 产物缺 react/@next/env 等运行时依赖）；
        // 显式指定追踪根为仓库根让产物带上完整依赖闭包。
        outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
        env: { NEXT_PUBLIC_API_URL: '' },
      }
    : {}),
  async rewrites() {
    return siteDeploy ? [{ source: '/v1/:path*', destination: `${siteApiOrigin}/v1/:path*` }] : [];
  },
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
