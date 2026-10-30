# @atlas/config

全仓库共享配置（非发布包，通过相对路径引用）：

- `tsconfig/base.json` —— 严格模式基线，所有 TS 项目的最终基座
- `tsconfig/nestjs.json` —— apps/api：装饰器元数据 + CommonJS 输出
- `tsconfig/library.json` —— packages/core、packages/sdk：CJS 库输出（dist + d.ts）
- `tsconfig/nextjs.json` —— apps/web：bundler 解析 + noEmit + Next 插件

根目录的 `eslint.config.mjs`、`.prettierrc.json`、`commitlint.config.mjs` 是全局唯一入口，不要在子包里再造配置。
