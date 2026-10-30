# ADR-0001：技术栈选型

- 状态：已接受
- 日期：2026-10-30
- 关联：总体设计文档第三节；AGENTS.md §3

## 背景

全新个人平台项目，目标"自用 → 打磨 → 售卖"三层演进，要求长期可维护、类型安全、模块可插拔。开发机器为 Windows（无 Docker / WSL），npm 走国内镜像。

## 决策

沿用总体设计文档的默认选型：

| 层          | 选型                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| 单仓库      | pnpm + Turborepo                                                       |
| 前端        | Next.js（App Router）+ React + Tailwind CSS（组件基元后续用 Radix UI） |
| 前端数据    | TanStack Query + Zustand（阶段 3 引入）                                |
| 后端        | NestJS                                                                 |
| 数据库      | PostgreSQL + Drizzle ORM（drizzle-kit 迁移）                           |
| 队列 / 缓存 | 适配器接口（packages/core），实现见 ADR-0002                           |
| 测试        | Vitest + Playwright                                                    |
| 交付        | Docker + GitHub Actions（CI 已就位，Docker 待装机）                    |

版本基线（2026-10-30）：pnpm 12.16、Next 16.4、React 19.3、NestJS 12.3、Tailwind 4.3、Drizzle 0.45、Vitest 5、Turbo 2.11。

**TypeScript 特意锁定 5.x 稳定线**（^5.9），不追刚发布的 TS 7（Go 重写版）：Nest 装饰器、typescript-eslint 与 Next 生态对 TS 7 的支持尚未成熟；平台项目求稳优先。升级 TS 7 单独立项。

## 后果

- 前后端共用 TS 类型，模块契约放 packages/sdk，编译期发现跨链路错误。
- Windows + 中文路径（`D:\个人成长系统`）为主要环境风险；如个别工具链不兼容，预案是把仓库迁到 ASCII 路径 `D:\atlas` 并同步文档。
