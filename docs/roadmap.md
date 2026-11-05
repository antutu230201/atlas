# Atlas · Roadmap

更新：2026-11-05（阶段 0-4 基础上完成个人大屏模块；AI 助手页、玻璃态亮暗体系、打卡热力图已交付）

> **新机器 / 新 AI 会话开工先读**：[docs/guide/开发环境手册.md](./guide/开发环境手册.md)（冷启动三命令、端口与 CORS、踩坑清单）+ [AGENTS.md](../AGENTS.md)（宪法）+ 本文。

## 阶段总览

| 阶段 | 内容                                                              | 状态                                                                                                                                 |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | 脚手架与工程基线                                                  | ✅ 2026-10-30 完成                                                                                                                   |
| 1    | 设计系统                                                          | ✅ 2026-10-31 完成（晨白 Dawn，ADR-0004；tokens + 20 组件 + /design 示例页 + Storybook + axe 门禁 + 视觉回归）                       |
| 2    | 平台内核（账号 / 工作空间 / 模块系统 / 事件总线 / 审计 / 通知）   | ⬜ 未开始（下一步：先出数据模型与模块协议设计稿）                                                                                    |
| 3    | 应用外壳 + 第一个真实模块                                         | ⬜ 未开始（首模块已定为"待办与笔记"，见 ADR-0003；Drawer/Toast/命令面板外壳移入本阶段）                                              |
| 4    | 体验打磨（命令面板 / 全局搜索 / 导入导出 / 性能 / 离线 / 无障碍） | 🔨 2026-10-31：全局搜索 + 导出/导入 + Toast + 命令面板搜索 ✅；性能审计 / 离线 / 无障碍复查 ⬜（表格虚拟滚动移入本阶段）             |
| 5    | AI 能力层（模型适配器 / pgvector 检索 / 工具注册 / 用量）         | 🔨 2026-10-31：AIAdapter 接口 + MockAIProvider + ctx.ai.complete() + ai_usage 追踪表 ✅；真实供应商接入 ⬜（需 API 密钥）            |
| 6    | 质量与安全加固（OWASP / 备份演练 / 负载测试）                     | 🔨 2026-10-31：安全响应头 + RLS 两道防线 + 限流 + 输入校验 + 审计 ✅；OWASP 完整审计 / 负载测试 ⬜                                   |
| 7    | 多租户运营、计费与授权                                            | 🔨 2026-10-31：EntitlementService（hasFeature/getLimit）+ module_install/entitlement 表 ✅；支付回调 / 运营后台 ⬜（需支付通道决策） |
| 8    | 上线与商业化                                                      | ⬜ 需部署环境（云服务器 / 域名 / SSL）；可提前准备 Dockerfile                                                                        |

## 已定决策（大事记）

| 日期       | 决策                                                                                | 依据                         |
| ---------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| 2026-10-30 | 项目代号 Atlas；全 TS 单仓库                                                        | 总体设计文档 + ADR-0001      |
| 2026-10-30 | 免 Docker 本地栈（embedded-postgres + 进程内适配器），docker-compose 为备用完整形态 | 本机无 Docker/WSL + ADR-0002 |
| 2026-10-30 | TypeScript 锁定 5.x 稳定线（暂不追 TS 7）                                           | ADR-0001                     |
| 2026-10-30 | 阶段 3 第一个真实模块 = 待办与笔记                                                  | 用户选定 + ADR-0003          |
| 2026-10-31 | 视觉方向 = 晨白 Dawn；令牌命名与品牌覆盖机制                                        | 用户选定 + ADR-0004          |

## 阶段 0 验收记录（2026-10-31 实测）

- [x] `corepack enable` → `pnpm install` → `pnpm dev` 三条命令跑起全部服务
- [x] http://localhost:3000 浏览器实测：api / database / queue / cache / storage 五项全部"正常"（截图验收）
- [x] `pnpm format` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` 全部 exit 0
- [x] `pnpm e2e`：Playwright 通过（真实拉起 dev server + 内嵌 PG）
- [x] roadmap / README / ADR / AGENTS.md 就位；排障记录沉淀于 ADR-0002
- 超出原计划的额外收获：修复了本机全局 cmd AutoRun 对 `_popen` 输出的污染（详见 ADR-0002 排障记录）

## 阶段 1 验收记录（2026-10-31）

- [x] 第一步：3 套视觉方向产出并浏览器实测 → 用户选定 **晨白 Dawn**（ADR-0004）
- [x] `packages/tokens`：语义令牌（色彩/圆角/阴影/动效/层级）+ 亮暗系统三态 + `--atlas-brand-*` 品牌覆盖层 + `color-scheme` 跟随
- [x] `packages/ui`：20 个核心组件（Radix 基元），9 个组件测试通过
- [x] `apps/web`：首页换肤（消灭写死颜色）+ `/design` 设计系统示例页 + 主题切换器（防闪烁脚本）
- [x] 收尾：Storybook 9（18 个故事）+ axe 无障碍门禁（发现并修复 10 处对比度问题，语义色加深达标 WCAG AA）+ 视觉回归基线 29 张（按平台存放；CI 门禁待首次推送后启用）
- [x] e2e 3/3 通过（示例页分区渲染、三态主题切换、弹窗键盘关闭、首页健康状态）
- 说明：Drawer / Toast / 命令面板外壳移入阶段 3（随应用外壳落地），表格虚拟滚动移入阶段 4

## 阶段 2 总验收清点（2026-10-31）

对照 ADR-0005 §10 与总体设计文档阶段 2 验收标准：

- [x] 示例模块（modules/sample-note）零内核改动安装/启用/停用，停用后路由与入口消失、**数据保留**（集成测试锁定；前端路由挂载随阶段 3 外壳落地，已在 ADR-0005 §14 记录）
- [x] 越权测试：应用层一组（cross-tenant：非成员 404 / member 403 / 移除后失效）+ 数据库层一组（RLS 直连冒烟：无上下文不可见、设上下文可见）
- [x] 事件总线：同事务 outbox、派发 delivered、失败退避重试、耗尽死信、僵死回收；进程重启不丢事件（状态在库，派发器无内存态）
- [x] 审计日志覆盖全部写接口（全局 interceptor，敏感字段脱敏）
- [x] 核心包覆盖率 92.6%（≥80% 门槛已进 CI 门禁）；全仓库 73 测试 + 3 e2e 全绿
- [x] 《如何开发一个模块》文档：docs/guide/如何开发一个模块.md（目标 30 分钟上手）

## 下一步

1. **阶段 2d**：《如何开发一个模块》文档 + 示例模块完善 + 核心包覆盖率 ≥80% + 阶段 2 总验收。
2. 想法与杂念统一记到 `docs/ideas.md`，每周复盘时排期，不打断当前阶段。

## 阶段 3a 验收记录（2026-10-31）

- [x] 登录/注册页（错误态/加载态/已登录重定向）；会话经 HttpOnly Cookie + TanStack Query 管理
- [x] 应用外壳：侧边导航（工作空间切换/折叠/移动端抽屉）、顶栏（主题三态/通知/用户菜单/登出）
- [x] 首页今天：时段问候 + 模块快捷入口 + 零空间 onboarding + 零模块引导
- [x] 设置三页签：成员（邀请/角色/移除）、模块（启停）、审计日志
- [x] 模块动态挂载：/m/<module>/<route> + web 注册表装配点；sample-note 列表页全链路可用
- [x] e2e 5/5（含外壳全流程：注册→建空间→启用模块→模块页写笔记→登出保护）
- 依赖新增（宪法 §8 说明）：@tanstack/react-query ^5（服务端状态缓存/失效，设计文档 §3 指定）、zustand ^5（激活工作空间/侧栏折叠等 UI 状态）

## 阶段 3b 验收记录（2026-10-31）

- [x] packages/ui：Toast（Radix Toast + 三态变体）+ Drawer（侧滑面板）
- [x] 待办与笔记正式模块：CRUD / 状态流转 / 筛选搜索 / 拖拽排序 / 软删除回收站 / 事件 / widget
- [x] ModuleActionError 业务错误 → 400 映射（网关统一处理）
- [x] 首页 widget 聚合：manifest widgets → moduleWidgetRegistry → / 页渲染
- [x] 命令面板：Ctrl/Cmd+K 全局搜索导航
- [x] e2e 7/7（含外壳全流程 + 待办全流程 + widget 可见性 + 登出保护）
- [x] 全部七项质量门 exit 0（format/lint/typecheck/test/coverage/build/e2e）

## 阶段 4 部分验收记录（2026-10-31）

- [x] 全局搜索：todo 模块 search action + 命令面板 300ms 防抖搜索集成
- [x] 导出/导入：exportData / importData actions + 设置页导出按钮（JSON 下载）
- [x] ModuleActionError：模块业务错误统一映射 400（不再 500）
- [x] e2e 7/7 + 七项质量门 exit 0
- [x] Toast 反馈接入待办操作（创建/删除/错误）
- [x] Drawer 替代 Dialog 用于移动端导航（正确组件语义）
- [x] 命令面板集成待办搜索（300ms 防抖 + 结果导航）
- [ ] 性能审计（Lighthouse + 10 万数据压力测试）
- [ ] 离线支持（service worker）
- [ ] 无障碍复查（屏幕阅读器完整走查）

## 阶段 5-7 基础设施记录（2026-10-31）

- [x] 阶段 5 AI：AIAdapter 接口 + MockAIProvider + ctx.ai.complete() 注入 ModuleContext + ai_usage 追踪表
- [x] 阶段 6 安全：SecurityHeadersMiddleware（nosniff/DENY/Referrer-Policy/Permissions-Policy）+ RLS 两道防线 + 限流 + 输入校验 + 审计
- [x] 阶段 7 多租户：EntitlementService（hasFeature/getLimit）+ entitlement 表（设计稿预留）+ workspace 隔离
- [ ] 阶段 5 真实 AI 供应商接入 → 需用户提供 API 密钥（OpenAI/智谱等）
- [ ] 阶段 6 OWASP 完整审计 + 负载测试 → 需部署环境
- [ ] 阶段 7 支付回调 + 运营后台 → 需支付通道决策
- [ ] 阶段 8 上线 → 需云服务器/域名/SSL

## 个人大屏模块交付记录（2026-11-05，modules/dashboard）

第二个正式业务模块，"每天打开看的入口页"。数据源全部服务端直连（适配器隔离 + 落库缓存 + 过期回退），浏览器零 CORS。

- [x] 时钟区：秒级走时 + 农历/节气/节日/干支生肖（lunar-typescript，MIT，唯一新依赖）+ 时段问候
- [x] 天气卡：Open-Meteo 实时/逐时/4 天预报 + 空气质量 us_aqi；城市 IP 定位（ip-api 主源 + ipwho.is 备源）与搜索切换
- [x] 热榜×5：微博（完整浏览器头直连）/ 抖音 / B站 / 百度 / 头条，各源独立 TTL 缓存 + stale 回退 + 健康三态 + 排名变化箭头 + 可开关
- [x] 滚动头条 marquee（悬停暂停，reduced-motion 降级）、一言（hitokoto）、必应每日壁纸氛围背景（onError 降级极光渐变）
- [x] 倒计时/纪念日：CRUD + 置顶 + 软删除回收站（设置抽屉内恢复）；事件 dashboard.countdown.* 落 outbox
- [x] 沉浸模式：chromeHidden 全屏（侧栏/顶栏隐藏，命令面板仍可用）；成长打卡热力图 + 连续天数（订阅 todo.completed，模块间唯一数据通道）；AI 每日小结（ctx.ai，按天缓存，MockAI 下模板文案）
- [x] 大屏语义令牌（--screen-scrim/--screen-aurora-*）与玻璃工具类全部走 tokens，亮暗三态自动切换；业务代码零写死颜色
- [x] 数据模型：source_cache（数据源快照）/ countdown / activity 三表，全部 workspace_id + RLS；迁移 0000-0003
- [x] 验收：集成测试含假数据源模式（ATLAS_DASHBOARD_FAKE=1，e2e 零外网依赖）；浏览器实测亮/暗/手机宽/沉浸/定位/倒计时全流程（真实数据源直连成功）
- 说明：e2e 端口支持 E2E_API_PORT/E2E_WEB_PORT 覆盖（本机 3000/3001 常被其他实例占用）；web dev/start 脚本改为遵循 PORT 环境变量（默认 3000 不变）

### 体验修复与性能优化（2026-11-05 晚）

- [x] 侧栏被壁纸盖住修复：大屏背景/天气氛围层 `fixed inset-0` → `absolute`（限制在大屏容器内，app 外壳侧栏可见）；热榜区块上移至时钟+天气两大卡片正下方
- [x] 滚动卡顿修复（实测软渲染基准滚动 45→69-84 FPS）：滚动中 `data-scrolling` 仅对**持续循环动画**（跑马灯/时钟轨道/天气场景）`animation:none`——三个实测教训：`play-state:paused` 与 `visibility:hidden` 无效（动画存在合成器就每帧处理）；`*` 通配会让一次性入场动画在滚动停止后重播（用户感知为"整页刷新"，已收窄选择器修复）；hook 用 scroll+wheel 双事件 + 350ms 防抖防边界滚动状态闪烁。壁纸/天空层滚动隐藏实测仅值 ~8 FPS 且带来闪动感，不采用
- [x] 时钟即时渲染：加载中即可见（时钟/轨道为纯客户端组件，不等 snapshot），指标行/天气/热榜走骨架
- [x] `pnpm start:all`（build + api `node dist/main` + web `next start`）：日常使用生产模式，避开 dev 编译开销；手册补"日常使用"小节
- [x] 细滚动条主题化（tokens 驱动，暗色下不再是系统白条）

## 习惯打卡模块交付记录（2026-11-06，modules/habits）

第三个业务模块，"每天用"核心闭环（记 → 打卡 → 连续感）。完全按《如何开发一个模块》流程交付，零内核改动。

- [x] 数据模型：`modules.habits` 下 habit（软删除归档）+ habit_log（habit+day 唯一，一天一条）；迁移 0000 + 0001_rls（GRANT + RLS 租户隔离模板）
- [x] 动作：snapshot / createHabit / renameHabit / toggleCheck（幂等打卡与取消）/ archiveHabit / restoreHabit，全部返回新快照省一次往返
- [x] 连续天数与近 7 天热力格在服务端组装（本地时区 day 口径与 dashboard.activity 一致）
- [x] 事件：habit.created/renamed/checked/unchecked/archived/restored 落 outbox，供其他模块订阅（大屏衔接预留）
- [x] 前端：今日打卡视图（进度概览/习惯行/emoji 选择/归档区/空态/加载态/错误态），亮暗主题浏览器实测
- [x] 接线：api/web 依赖注册、next.config transpilePackages、module-registry 页面登记
- [x] 测试：集成测试 7 个（含 guest 只读、越权隔离、幂等语义）+ e2e 1 条（启用→创建→打卡→取消→归档→恢复），全套 10/10 通过

### 协同交付中修复的横切问题（2026-11-05，提交 1b84412 / 404c818 / 634552b）

- 玻璃态令牌化：`--glass-*` 亮暗变量 + @source 文件级 glob（此前模块类名全丢、暗色发白，详见手册 §5）
- `transpilePackages` 补登记 dashboard（缺失时全站 (app) 路由 404）
- 补 `platform.ai_usage` 迁移 0004（缺失时 AI 调用与摘要卡全部报错）
- 模块注册表发现失败可自动重试（不再负缓存，无需重启 API）
- 首页/侧边栏区分模块加载失败态与空态；全屏模式负 margin 横滚修复

### 已知问题与技术债

- [ ] 全量 `pnpm test` 在 dev 服务并存内嵌 PG 时有 ECONNRESET 假失败 → 干净环境复跑确认（环境问题，非断言失败）
- [ ] AI 小结为 MockAI 模板文案 → 阶段 5 接真实供应商（需密钥）
- [ ] 事件派发失败静默重试（只写 `platform.event.last_error` 不打日志）→ 建议加 console.error
- [ ] 打卡热力图历史数据仅从真实事件开始累积 → 可选：加"导入历史"动作
- [ ] 大屏 AI 摘要/热力图尚未入首页 widget 注册表（当前只在大屏页内）

### 大屏后续优化方向（按调研结论排序）

1. 首页 Bento 化：问候 hero 卡 + 今日焦点（最重要 1-3 件事）+ 连续打卡天数上首页
2. GitHub 式 365 天热力图（当前 26 周）+ 宽容型断签机制迭代（弹性检查点/断签恢复提示）
3. AI 能力升级：每日摘要接真实模型；AI 摘要卡支持"展开依据"（引用数据快照）；自然语言查询入口
4. 大屏卡片 widget 化输出到首页（manifest widgets），保持"新增功能 = 新增模块"铁律
5. 性能与体验：壁纸懒加载/降分辨率、热榜虚拟滚动、全屏模式轮播布局（ TV/平板挂墙场景）

## 大屏 Personal OS 视觉重构（2026-11-05）

- [x] 参考深色 Knowledge OS / 玻璃拟态仪表盘，建立独立于全站晨白主题的 `.dashboard-screen` 暗夜语义层；颜色、圆角、阴影、动效时长仍统一在 `packages/tokens/tokens.css`。
- [x] 重排为「顶部信号流 → 时间核心 + 天气 → AI 摘要 / 热力图 → 五源热榜 → 倒计时」的 Bento 层级；保留五源热榜、排名变化、健康状态、全屏、设置和城市引导等既有能力。
- [x] 动效：极光漂移、网格背景、时间轨道旋转 / 呼吸核心 / 脉冲环、卡片交错入场、天气曲线描边、热榜悬停位移；全局 `prefers-reduced-motion` 自动降级。
- [x] 新增纯 CSS/SVG 视觉组件，无新增前端依赖；天气逐时列表改为 SVG 曲线，热榜源增加彩色标识，倒计时空状态改为横向紧凑表单。
- [x] 验收：`pnpm typecheck` / `pnpm lint` / `pnpm --filter @atlas/web build`、适配器单测 7/7、大屏 e2e 2/2 通过；浏览器实测 1920×1080、全页、390px 手机宽、亮/暗/system 三态及 reduced-motion，桌面无横向溢出。

## 大屏性能 / 主题 / 天气联动（2026-11-05 第二轮）

用户反馈三件事：渲染比之前更卡、要保留亮暗切换、天气要能带动整页场景。逐项处理如下。

### 卡顿根因与修复

- 根因：3 个 `filter: blur(100px)` 极光层常驻漂移 + 天气/AI/时间核心的 `blur-2xl/3xl` 光斑 + 12 张大阴影卡片，`backdrop-filter` 虽被支持但被 Tailwind 类覆盖。
- 处理：**全部实时模糊清零**（`blur()` 元素数 6 → 0），改用预柔化径向渐变 `screen-sky`；`screen-card` 去掉 `backdrop-filter` 并加 `contain: paint style`；`transition` 不再动 `box-shadow`；常驻动画从 26 个降到 ~9 个（其余为一次性入场）；保留 `will-change: transform` 只给天气层。
- 实测（1920×1080、Chromium、5 秒采样）：静止稳定 58–60fps，DOM 内 `blur=0`、`backdrop=0`。

### 滚动掉帧（第二轮下半场，真正的卡顿主因）

首轮只测了「静止 fps」，漏了「滚动 fps」，所以误判为已解决。补测后复现了用户的真实体感：

| 指标（滚动 3 秒） | 修复前 | 修复后（dev） | 修复后（prod） |
| ----------------- | ------ | ------------- | -------------- |
| fps               | 37     | 60            | 60             |
| p95 帧耗时        | 49.6ms | 18.5ms        | 17.4ms         |
| 超时帧（>33ms）   | 40     | 0             | 0              |
| Layout            | 60ms   | 43ms          | 51ms           |
| RecalcStyle       | 56ms   | 37ms          | 59ms           |
| Script            | 69ms   | 39ms          | 41ms           |

- 根因：`screen-sky` / `screen-grid` / `screen-weather` 三层全屏层都是 `position: absolute`，跟着文档流滚，**每滚动一帧就要重绘整屏渐变 + 整屏网格 + 雨雪瓦片**。
- 修复：三层改 `position: fixed`（背景容器 `fixed inset-0`，`.screen-weather` 同步改 fixed）。滚动时只需合成已缓存的光栅层，不再重绘。
- 教训：动效类页面的性能门禁必须包含**滚动采样**，只测静止 fps 会漏掉画布重绘成本。

### 主题三态（light / dark / system）

- `packages/tokens/tokens.css` 改为**亮色默认** + `[data-theme='dark']` 与 `@media (prefers-color-scheme: dark) { [data-theme='system'] }` 两份暗夜覆盖；`.dashboard-screen` 只做语义映射，不再强制 `color-scheme: dark`。
- 三态持久化沿用 `atlas-theme`（`THEME_INIT_SCRIPT` 首屏防闪烁）；大屏头部在沉浸态提供一份 `ThemeToggle`，非沉浸态复用外壳顶栏的那一份，避免同一页面出现两个相同开关。

### 天气联动场景

- 新增 `modules/dashboard/src/web/weather-atmosphere.tsx`：`sun/partly/overcast/fog/drizzle/rain/heavy-rain/snow/sleet/thunder` → `clear | partly | cloudy | fog | rain | snow | storm` 七种场景。
- 背景层：晴空光晕、云层漂移、薄雾横向流动；前景层（仅雨/雪/雷雨）：雨丝、雪点、闪电泛光横跨内容，透明度压到 0.38–0.5 保证可读。
- 实现只用重复线性/径向渐变 + `transform` 动画，不引入 Canvas / rAF 常驻引擎，也不产生新的 `blur` 开销。
- 雪点用三层互不成倍数的小瓦片（137×149 / 211×173 / 97×263）+ 前后景不同时长（11s / 19s 带横向摆动），消除单瓦片平铺的规则点阵感；雨分近远两层同向下落（1.15s / 2.4s）形成纵深，避免两层对穿。

### 同轮附带的密度修复

- 热力图空格原本用 `--screen-panel-hover`，与卡片底色几乎同值导致整片格子"消失"；新增 `--screen-cell` 令牌 + `screen-cell` 工具类，格子改为 `aspect-square` 自适应铺满卡片宽度（约 85%）。
- 一言卡改横向满宽排版（大号「+ 右列 DAILY QUOTE/HITOKOTO 元信息），并与 AI 摘要卡一起撑满左栏，使左右两栏底边齐平。

### 验收

- `pnpm typecheck` 14/14、`pnpm lint`、`pnpm format:check`、`pnpm --filter @atlas/web build`、大屏 e2e 2/2 全绿。
- 浏览器实测 8 个组合（晴/雨/雪/雾/雷雨 × 亮暗 + 390px 移动端 + reduced-motion）：`blur=0`、`backdrop=0`、无横向溢出、无控制台报错、60fps；reduced-motion 下动画时长降至 0.01ms（等效停播）。

### 环境教训：不要把假数据源留在日常实例上

- 排障时用 `ATLAS_DASHBOARD_FAKE=1` 起过 API，之后忘记摘掉，导致用户看到「热搜全是测试热搜」「定位返回杭州假坐标」。
- 现在区分两套环境：
  - 日常实例：`3001`，**不带** `ATLAS_DASHBOARD_FAKE`，走微博/抖音/B站/百度/头条真实源 + open-meteo 天气 + ip-api/ipwho.is 定位。
  - E2E 实例：`3011`（API）+ `3010`（web），带 fake，`E2E_API_PORT=3011 E2E_WEB_PORT=3010` 跑；因为 e2e 断言的是「测试热搜第 N 条」，拿真实源跑必然失败。
- 改完数据源要顺手验一遍：`POST .../dashboard/call/detectLocation` 返回的城市、`snapshot.hot.*.payload[0].title` 是否为真实标题。

## 每周复盘记录

- 2026-10-30：项目启动。阶段 0 交付；待办：选定视觉方向。
- 2026-10-31：阶段 0、1 全部完成验收。技术债：无已知高优项；待办：推送远端仓库启用 CI 与视觉门禁。
- 2026-11-05：个人大屏模块交付验收。技术债：module-events 全量跑偶发排队失败已通过"spec 排空事件队列"修复；AI 小结待真实供应商密钥。
- 2026-11-05（协同会话）：双 agent 并行开发收尾——玻璃态亮暗体系、@source/transpilePackages/ai_usage 三处环境级修复、打卡热力图 + AI 摘要 + 全屏落地并推送远端；沉淀《开发环境手册》。待办：干净环境复跑全量测试与 e2e。
