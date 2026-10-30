# 业务模块目录

业务功能只存在于这里，内核永远不知道有哪些模块（AGENTS.md 架构铁律）。

每个模块是独立目录，标准结构：

```
modules/<module-name>/
├─ manifest.ts     名称、版本、所需权限、依赖、路由、菜单项、设置项
├─ server/         后端实现
├─ web/            前端实现
├─ migrations/     模块自己的数据库迁移
└─ tests/          模块测试
```

当前没有业务模块 —— 这是刻意的：阶段 0 只搭地基，阶段 2 建内核与模块协议，
阶段 3 落地第一个模块"待办与笔记"（见 docs/adr/0003-first-module-todo-notes.md）。

候选池（想法不丢，排期进 docs/ideas.md）：习惯打卡追踪、目标与年度计划、复盘日记。
