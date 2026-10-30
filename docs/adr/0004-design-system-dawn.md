# ADR-0004：设计系统方向选定（晨白 Dawn）与令牌架构

- 状态：已接受
- 日期：2026-10-31
- 关联：ADR-0001；`packages/tokens`；`packages/ui`；`docs/design/visual-directions.html`

## 背景

阶段 1 第一步产出 3 套视觉方向（墨玉 Ink / 晨白 Dawn / 石青 Slate），用户于 2026-10-31 选定 **晨白 Dawn**（温暖纸感、靛蓝主色、8px 圆角、柔和阴影、全无衬线、200ms 动效）。

## 决策

### 令牌命名与分层（packages/tokens）

- **语义色**（禁止在业务代码出现任何写死色值）：`bg / surface / surface-hover / text / muted / border` 六个中性语义 + `primary / primary-hover / on-primary / primary-soft` 品牌组 + `ok / warn / err / info` 及对应 `-soft` 语义组。
- **形态**：`radius-xs|sm|md|lg`（4/8/12/16px）、`shadow-soft|md|lg`、间距沿用 4px 基数（Tailwind 默认刻度）。
- **动效**：`duration-fast|base|slow`（150/200/300ms）+ `ease-out-soft`；尊重 `prefers-reduced-motion`。
- **层级**：`z-dropdown/sticky/overlay/modal/toast`（1000–1400）。
- **主题三态**：`<html data-theme="light|dark|system">`；`system` 由 CSS `prefers-color-scheme` 媒体查询解析，首屏内联脚本防闪烁。
- **品牌覆盖接口**（为售卖期白标预留）：主题色只引用 `--atlas-brand-*` 变量层，企业客户改一组变量即整站换肤。

### 组件库（packages/ui）

- 基于 Radix UI 基元 + 上述令牌，React 组件以 TS 源码形态被 Next 直接编译（`transpilePackages`），零构建产物。
- 本次落地 20 个核心组件（含全部交互状态）；`Drawer / Toast / 命令面板外壳 / 表格虚拟滚动` 列入阶段 1 收尾。

### 偏差与缓办

- Storybook + axe 无障碍检查 + Playwright 视觉回归：列入阶段 1 收尾，本轮先以 `/design` 示例应用页作为验收面（它同时是文档要求的"设计系统自身的示例应用页"）。
- Inter / 思源黑体自托管：暂用系统字体栈（预览一致），自托管在体验打磨阶段（阶段 4）随性能预算一起做。

## 后果

- 全站样式只有一条合法来源：业务代码只允许 `bg-surface`、`text-muted` 这类语义工具类；CI 阶段可用"搜索十六进制色值"脚本守护（阶段 4 加进 CI）。
- 换风格 = 改 `packages/tokens/tokens.css` 一处；换品牌 = 改 `--atlas-brand-*` 一组。
