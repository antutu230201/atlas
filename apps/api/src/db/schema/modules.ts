import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './identity';
import { platform } from './platform';
import { workspace } from './workspace';

/** 工作空间启用的模块与版本（模块系统，2b 实现生命周期） */
export const moduleInstall = platform.table(
  'module_install',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    moduleName: text('module_name').notNull(),
    version: text('version').notNull(),
    status: text('status', { enum: ['enabled', 'disabled'] })
      .notNull()
      .default('disabled'),
    settings: jsonb('settings').notNull().default({}),
    installedBy: uuid('installed_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('module_install_workspace_name_unique').on(t.workspaceId, t.moduleName),
    index('module_install_workspace_idx').on(t.workspaceId),
  ],
);

/** 权益 = 特性开关 + 额度（业务代码只问 hasFeature，不写死套餐名） */
export const entitlement = platform.table(
  'entitlement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    featureKey: text('feature_key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    limitValue: integer('limit_value'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('entitlement_workspace_feature_unique').on(t.workspaceId, t.featureKey)],
);
