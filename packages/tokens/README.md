# @atlas/tokens

全站唯一视觉来源（ADR-0004）。方向：**晨白 Dawn**。

- `tokens.css` —— Tailwind v4 `@theme` 令牌 + 暗色主题 + 品牌覆盖层。应用侧 `@import '@atlas/tokens/tokens.css';` 一次引入。
- `src/index.ts` —— 主题切换的结构与行为（`ThemePreference`、防闪烁脚本、`applyTheme`），不含视觉值。

规则：业务代码只允许引用语义令牌工具类（`bg-surface` / `text-muted` / `border-border` / `rounded-md` / `shadow-soft`），禁止写死色值。暗色下大多数组件无需 `dark:` 变体 —— 变量自动切换。
