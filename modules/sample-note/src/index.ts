import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ModuleDefinition } from '@atlas/sdk';
import { moduleManifestSchema } from '@atlas/sdk';
import { note } from './db/schema';

/**
 * 阶段 2b 验收示例模块（ADR-0005 §7 / ADR-0003）：
 * 一张 note 表 + 三个动作。启用/停用/调用全部经内核网关，内核代码零改动。
 */

const manifest = moduleManifestSchema.parse({
  name: 'sample_note',
  version: '0.1.0',
  title: '示例笔记',
  description: '阶段 2b 验收模块：每工作空间一张 note 表，验证模块协议全链路。',
  permissions: ['note:read', 'note:write'],
  dependsOn: [],
  routes: [{ path: 'list', title: '笔记', nav: { order: 10 } }],
  settings: [{ key: 'maxNotes', label: '最大条数', type: 'number', default: 100 }],
  events: {
    publishes: ['note.created'],
    subscribes: [],
  },
  migrations: 'migrations',
});

const createSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(120),
  body: z.string().max(5000).optional(),
});

export const definition: ModuleDefinition = {
  manifest,
  actions: {
    list: {
      permission: 'note:read',
      handler: async (ctx) => {
        const rows = await ctx.db
          .select()
          .from(note)
          .where(eq(note.workspaceId, ctx.workspaceId))
          .orderBy(desc(note.createdAt))
          .limit(100);
        return { notes: rows };
      },
    },

    create: {
      permission: 'note:write',
      handler: async (ctx, input) => {
        const parsed = createSchema.safeParse(input);
        if (!parsed.success) {
          const detail = parsed.error.issues.map((i) => i.message).join('; ');
          throw new Error(`输入不合法：${detail}`);
        }
        const rows = await ctx.db
          .insert(note)
          .values({
            workspaceId: ctx.workspaceId,
            title: parsed.data.title,
            body: parsed.data.body ?? '',
          })
          .returning();
        const created = rows[0]!;
        await ctx.events.publish('note.created', {
          noteId: created.id,
          title: created.title,
        });
        return created;
      },
    },

    remove: {
      permission: 'note:write',
      handler: async (ctx, input) => {
        const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
        if (!parsed.success) throw new Error('输入不合法：id 必须是 uuid');
        await ctx.db.delete(note).where(eq(note.id, parsed.data.id));
        return { removed: parsed.data.id };
      },
    },

    settingsDemo: {
      permission: 'note:read',
      handler: async (ctx, input) => {
        // 演示 ModuleContext.settings 读写
        if (input && typeof input === 'object' && 'maxNotes' in input) {
          await ctx.settings.set(input as Record<string, unknown>);
        }
        const current = await ctx.settings.get();
        return { settings: current };
      },
    },
  },
};
