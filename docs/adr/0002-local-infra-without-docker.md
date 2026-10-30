# ADR-0002：免 Docker 的本地基础设施

- 状态：已接受（2026-10-30，含当日排障记录）
- 关联：ADR-0001；`apps/api/src/infra/`；`packages/core`；根目录 `docker-compose.yml`

## 背景

总体设计规定本地用 docker-compose 跑 PostgreSQL + Redis + MinIO 三件套，但本机未安装 Docker 与 WSL。安装 Docker Desktop 需要管理员权限、启用 WSL2、可能重启与 BIOS 设置，属于用户手工操作且可能失败；为了"今天就能开工"，需要免 Docker 的替代路径，且不能牺牲架构原则（外部依赖必须隔在适配器后）。

## 决策

**用嵌入式 / 进程内实现顶替三件套，接口按"终态形态"设计，未来平滑换回。**

| 组件   | 阶段 0 实现                                                                                                             | 终态实现（未来） | 接口位置                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------ |
| 数据库 | `embedded-postgres@18.4.0-beta.17`（锁精确版本）：API 进程按需拉起真实 PostgreSQL 18，数据目录 `apps/api/.local/pgdata` | Docker / 云 PG   | 直连（DATABASE_URL）           |
| 队列   | `InMemoryQueueAdapter`（重试 + 死信，无持久化）                                                                         | Redis + BullMQ   | `packages/core` QueueAdapter   |
| 缓存   | `InMemoryCacheAdapter`（TTL）                                                                                           | Redis            | `packages/core` CacheAdapter   |
| 存储   | `LocalDiskStorageAdapter`（`apps/api/.local/storage`）                                                                  | S3 / MinIO       | `packages/core` StorageAdapter |

行为细节：

- `EMBEDDED_PG=false` 时 API 直连 `DATABASE_URL` 指向的外部 PG（含 docker-compose 形态）。
- 内嵌启动前先探测端口：已有实例在监听则复用（dev watch 重启 / 遗留实例自愈）。
- 初始化参数固定 `initdbFlags: ['--locale=C', '--encoding=SQL_ASCII']`（原因见下）。
- 相对路径（数据目录 / 存储目录 / .env）一律以 `process.cwd()`（即 apps/api）为锚，避免 dist 输出层级变化导致漂移。
- 迁移用 drizzle-kit 生成文件 + 启动时执行，禁止手改库。

## 2026-10-30 排障记录（重要，勿重蹈）

1. **cmd AutoRun 污染 `_popen` 输出**：本机 HKLM 注册表 `SOFTWARE\Microsoft\Command Processor\AutoRun = "chcp 936"`，导致每个 cmd 进程启动都先输出一行"活动代码页: 936"。initdb 内部用 `_popen`（`cmd /c`，无 `/d`）执行 `postgres -V` 并**只读第一行**做版本比对 → 永远报"not the same version as initdb"。**已删除该注册表值**（中文系统默认代码页本就是 936，该设置冗余）。如需恢复：
   `reg add "HKLM\SOFTWARE\Microsoft\Command Processor" /v AutoRun /t REG_SZ /d "chcp 936" /f`（需管理员）。
   排查心法：node 的 `execSync` 走 `cmd /d /s /c`（跳过 AutoRun）所以"看起来正常"，与 `_popen` 行为不一致 —— 遇到"输出流多了一行"类怪问题先查 AutoRun。
2. **中文 Windows 上 initdb 的 UTF8 FATAL**：即使 `--locale=C --encoding=UTF8`、ASCII 数据目录，post-bootstrap 阶段仍报 `invalid byte sequence for encoding "UTF8": 0xb8`（该二进制 post-bootstrap 会写入 GBK 字节的系统串）。改用 `--encoding=SQL_ASCII`（不做编码校验、字节透传）后完全正常。客户端（node-pg）以 UTF8 存取中文不受影响；代价是排序按字节序、无服务端编码防护 —— 开发库可接受。
3. **中文项目路径（`D:\个人成长系统`）不是问题**：PG 二进制在中文路径下可正常运行（上述两个问题都与路径无关）。此前"必要时迁往 ASCII 路径"的预案暂不需要。
4. `pnpm install` 在 pnpm 12 下会因"未审批的依赖构建脚本"退出 1；已在 `pnpm-workspace.yaml` 的 `allowBuilds` 放行 `@embedded-postgres/windows-x64` 与 `esbuild`。

## 后果

- 正面：`pnpm dev` 一条命令零依赖跑通全链路；CI（ubuntu）同样适用；接口不换，业务代码零感知。
- 取舍：该包版本号为 beta 号（其发布惯例是跟随 PG 小版本），故锁精确版本；队列无持久化 —— outbox 模式落库属于阶段 2 事件总线的职责，Redis 在那之前无不可替代性。
- 已知代价：内嵌 PG 与 api 进程同生命周期；Ctrl+C 异常终止可能遗留 postgres 子进程，下次启动端口探测会自动复用它，如需清理 `taskkill /IM postgres.exe /F`。
- SQL_ASCII 开发库 → 未来切到 UTF8 生产库时，pg_dump 导出为原始字节（内容实为 UTF8），恢复进 UTF8 库可直接使用；在阶段 5（AI / pgvector）或接入 Docker 前重新评估。
- 根治方案（可选，未执行）：系统设置"Beta: 使用 Unicode UTF-8 提供全球语言支持"（ACP=65001，需重启），可让 UTF8 initdb 直接可用。
- pgvector：推迟到阶段 5（AI 能力层）再解决（届时用 Docker 或手动装扩展二进制），本阶段不引入。
