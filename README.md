# Atlas · 个人成长系统

平台内核 + 可插拔模块的个人长期成长型系统。设计全文见 `docs/design/总体设计（原始）.md`，项目宪法见 [AGENTS.md](./AGENTS.md)，当前进度见 [docs/roadmap.md](./docs/roadmap.md)。

## 快速开始（三条命令）

```bash
corepack enable            # 启用 pnpm（已装过可跳过）
pnpm install               # 安装依赖（含自动下载 PostgreSQL 本地二进制）
pnpm dev                   # 一条命令启动 web + api + 内嵌 PostgreSQL
```

启动后打开 **http://localhost:3000**，应看到四个服务全部"正常"。

> 国内网络若 corepack 下载慢：`COREPACK_NPM_REGISTRY=https://registry.npmmirror.com corepack enable`

## 端口

| 服务       | 地址                            | 说明                                                                            |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------- |
| Web        | http://localhost:3000           | Next.js 前端                                                                    |
| API        | http://localhost:3001/v1/health | NestJS 后端，健康检查                                                           |
| PostgreSQL | localhost:5432                  | embedded-postgres 按需拉起（数据在 `apps/api/.local/pgdata`，可整目录删除重置） |

## 常用脚本（仓库根目录执行）

| 命令               | 作用                                                 |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | 并行启动 web + api（首次自动 initdb + 迁移）         |
| `pnpm build`       | 全仓库构建（Turborepo 增量）                         |
| `pnpm typecheck`   | TypeScript 严格检查                                  |
| `pnpm lint`        | ESLint                                               |
| `pnpm test`        | Vitest 单元测试                                      |
| `pnpm e2e`         | Playwright 端到端（自带 dev server，可复用已启动的） |
| `pnpm db:generate` | 由 schema 生成 Drizzle 迁移文件                      |
| `pnpm format`      | Prettier 格式化                                      |

## 本地基础设施（免 Docker，ADR-0002）

- **PostgreSQL**：`embedded-postgres` 由 API 进程按需拉起（`EMBEDDED_PG=true` 默认开启）；端口已被占用时自动复用现有实例；连接外部 PG 时设 `EMBEDDED_PG=false`。
- **队列 / 缓存**：进程内实现（`packages/core`），接口与 Redis/BullMQ 形态一致。
- **存储**：本地磁盘实现，目录 `apps/api/.local/storage`。
- **docker-compose.yml**：完整形态备用，安装 Docker Desktop 后 `docker compose up -d` + `EMBEDDED_PG=false` 即可切换。

## 目录结构

```
apps/web       Next.js 前端（阶段 3 起为应用外壳）
apps/api       NestJS 后端（阶段 2 起长出平台内核）
packages/tokens  设计令牌（阶段 1 落地）
packages/ui      组件库（阶段 1 落地）
packages/core    内核适配器接口与内置实现
packages/sdk     对外契约类型与模块 SDK
packages/config  共享 tsconfig 等工程配置
modules/         业务模块（阶段 3 起填充，每个模块独立目录）
docs/adr/        架构决策记录（重大改动必读必写）
docs/design/     视觉方向展示页 + 原始设计文档
```

## 环境变量

复制 `.env.example` 为 `apps/api/.env` 与 `apps/web/.env.local`（均可选，默认值可直接跑）。**密钥只放环境变量，仓库里只有 .env.example。**
