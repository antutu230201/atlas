# ZCode Sites 站点部署

Atlas 以"单容器多进程"形态部署到 ZCode Sites：一个包里同时装下 Next.js standalone（前台，`0.0.0.0:3000`）、NestJS API（后台，`127.0.0.1:3001`）与内嵌 PostgreSQL。浏览器只访问 3000 端口，`/v1/*` 由 Next rewrites 反代到 API——同源请求无 CORS，会话 Cookie 不受跨域限制。

```
浏览器 ──HTTPS──> ZCode 边缘 ──HTTP──> :3000 Next（/ 静态与 SSR；/v1/* 反代）
                                          └──> :3001 NestJS API ──> 内嵌 PostgreSQL（$DATA_DIR/pgdata）
```

## 平台限制（部署前必读）

| 限制                                    | 影响                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 数据不持久                              | `$DATA_DIR` 随实例回收清空：账号、笔记、习惯等全部数据在重启后丢失。这是**在线预览站**，不是数据归宿；正式数据以本地 / 自有服务器为准                  |
| 单实例 1 vCPU / 1 GB 内存 / 512 MB 磁盘 | 两 个 Node 进程各限 384 MB 堆；磁盘红线：解压 ≤ 400 MB、文件 ≤ 20000（组装脚本会核对）                                                                 |
| 无密钥注入                              | `.env` 不会被打包。AI 功能走 Mock（`AI_API_KEY` 为空）；网易云凭据密钥由 start.sh 实例内随机生成（重启后已加密数据不可解——与数据同生命周期，一致失效） |
| 公网开放注册                            | 任何拿到链接的人都可以注册账号                                                                                                                         |
| 反代所致                                | 审计日志里的 IP 显示为 127.0.0.1（未读取 X-Forwarded-For）                                                                                             |

## 涉及的仓库改动

- `apps/web/next.config.ts`：`ATLAS_SITE_DEPLOY=1` 时启用 `output: 'standalone'`、`/v1/:path*` 反代（目标默认 `127.0.0.1:3001`，可用 `ATLAS_SITE_API_ORIGIN` 覆盖）、并把 `NEXT_PUBLIC_API_URL` 内联为空串（前端走同源相对路径）。
- `apps/web/src/app/status/page.tsx`：服务端探测地址改读 `ATLAS_INTERNAL_API_URL`（Node fetch 不支持相对 URL），本地缺省行为不变。
- `turbo.json`：上述变量纳入 build 缓存键。
- `scripts/build-site-stage.mjs`：一键构建并组装 `.zcode-site/stage/`（含 start.sh 生成）。

## 部署步骤

```bash
# 0. 前置：pnpm install；zcode-site CLI 见其 skill 文档
# 1. 组装 stage（构建 API/Web + 交叉安装 linux-x64 依赖 + 生成 start.sh）
node scripts/build-site-stage.mjs

# 2. 本机验证（推荐先做，见下节），然后平台检查
zcode-site check .zcode-site/stage

# 3. 首次部署（之后重部署去掉 --new/--name/--prefix）
zcode-site deploy .zcode-site/stage --new --name "Atlas 个人成长系统" --prefix atlas-growth

# 4. 公网验收
curl https://<站点地址>/v1/health   # 应返回 {"data":{...,"status":"ok"}}
```

重新部署务必从干净 stage 开始（脚本每次全量重建），不要修补旧 stage。

## 本机验证（同拓扑实跑）

stage 里的 API 依赖按 linux-x64 交叉安装，本机跑不了；用仓库自身的 API 进程顶替，验证 Web 与反代链路：

```bash
# 1. 组装一个反代指向 3011 的 stage（避免与本机 3001 上的开发 API 混淆，
#    同时能证明前端确实走同源相对路径——若退回 localhost:3001 默认值会连不上）
node scripts/build-site-stage.mjs --api-origin http://127.0.0.1:3011

# 2. 启动隔离的 API（独立 PG 端口 5433 + 独立数据目录）
cd apps/api
PORT=3011 DATABASE_URL='postgres://atlas_app:atlas_app@localhost:5433/atlas' \
  DATABASE_URL_ADMIN='postgres://atlas:atlas@localhost:5433/atlas' \
  PG_DATA_DIR=.local/pgdata-site node dist/main.js

# 3. 启动 stage 的 Web（3000 被占用时换端口）
cd ../../.zcode-site/stage/web
PORT=3012 HOSTNAME=127.0.0.1 ATLAS_INTERNAL_API_URL=http://127.0.0.1:3011 node server.js

# 4. 浏览器打开 http://localhost:3012：注册 → 登录 → 进入应用；
#    http://localhost:3012/status 应显示各服务正常
```

验证通过后，重新执行不带 `--api-origin` 的组装得到正式 stage（反代目标 127.0.0.1:3001），再 `check` 与部署。

## 故障排查

- `WARMUP_FAILED`：`zcode-site logs <deploymentId>` 看启动日志。首启要跑 initdb + 迁移，1 vCPU 下约 20–40 s，在 90 s 健康窗口内；若超时考虑给 start.sh 加就绪等待。
- `PACKAGE_CHECK_FAILED`：按 `error.data.problems` 逐条修（体积/文件数/非 linux 二进制），脚本已内置红线核对。
- 云端 API 起不来：多为内嵌 PG 问题，看日志中 `[infra]` 前缀输出；内存不足（OOM）时把 start.sh 里两个 `--max-old-space-size=384` 调小，必要时给 `embedded-postgres` 传 `postgresFlags: ['-c', 'shared_buffers=48MB']`（需改 `apps/api/src/infra/embedded-postgres.ts`）。
- 前端请求 404/跨域：确认构建时 `ATLAS_SITE_DEPLOY=1` 生效（standalone 产物存在、无 localhost:3001 字面量出现在客户端请求里）。

## 与正式部署形态的关系

这是"把系统临时放到公网"的通道，不替代宪法规划中的 Docker + GitHub Actions 交付（docker-compose.yml 仍是完整形态备用）。数据持久化、密钥管理、多实例伸缩等仍以正式形态为准。
