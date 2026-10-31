# @atlas/sdk

模块开发 SDK 与共享契约类型。

- 当前（阶段 0）：`HealthReport` 等平台对外契约，前端与后端共用。
- 阶段 2 起：模块 manifest schema（moduleManifestSchema / ModuleContext / ModuleDefinition）。
- 开发新模块请看：**docs/guide/如何开发一个模块.md**（以 modules/sample-note 为活教材）。

规则：只放契约与类型，不放业务逻辑；破坏性变更必须升版本（见 AGENTS.md 架构铁律）。
