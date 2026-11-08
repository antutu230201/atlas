import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ModuleDefinition } from '@atlas/sdk';
import { ModuleActionError, moduleManifestSchema } from '@atlas/sdk';
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
  routes: [
    { path: 'list', title: '笔记', nav: { order: 10 } },
    { path: 'trash', title: '回收站', nav: { order: 20 } },
  ],
  settings: [{ key: 'maxNotes', label: '最大条数', type: 'number', default: 100 }],
  events: {
    publishes: ['note.created', 'note.deleted', 'note.restored', 'note.failing'],
    subscribes: [
      { event: 'note.created', handler: 'onNoteCreated' },
      { event: 'note.failing', handler: 'onFailing' },
    ],
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
          .where(and(eq(note.workspaceId, ctx.workspaceId), isNull(note.deletedAt)))
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
        if (!parsed.success) throw new ModuleActionError('输入不合法：id 必须是 uuid');
        const rows = await ctx.db
          .update(note)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(note.id, parsed.data.id),
              eq(note.workspaceId, ctx.workspaceId),
              isNull(note.deletedAt),
            ),
          )
          .returning({ id: note.id, title: note.title });
        const removed = rows[0];
        if (!removed) throw new ModuleActionError('笔记不存在或已在回收站');
        await ctx.events.publish('note.deleted', { noteId: removed.id, title: removed.title });
        return { removed: removed.id };
      },
    },

    listTrash: {
      permission: 'note:read',
      handler: async (ctx) => {
        const rows = await ctx.db
          .select()
          .from(note)
          .where(and(eq(note.workspaceId, ctx.workspaceId), isNotNull(note.deletedAt)))
          .orderBy(desc(note.deletedAt))
          .limit(100);
        return { notes: rows };
      },
    },

    restore: {
      permission: 'note:write',
      handler: async (ctx, input) => {
        const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
        if (!parsed.success) throw new ModuleActionError('输入不合法：id 必须是 uuid');
        const rows = await ctx.db
          .update(note)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(
            and(
              eq(note.id, parsed.data.id),
              eq(note.workspaceId, ctx.workspaceId),
              isNotNull(note.deletedAt),
            ),
          )
          .returning({ id: note.id, title: note.title });
        const restored = rows[0];
        if (!restored) throw new ModuleActionError('回收站中不存在该笔记');
        await ctx.events.publish('note.restored', { noteId: restored.id, title: restored.title });
        return { restored: restored.id };
      },
    },

    purge: {
      permission: 'note:write',
      handler: async (ctx, input) => {
        const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
        if (!parsed.success) throw new ModuleActionError('输入不合法：id 必须是 uuid');
        const rows = await ctx.db
          .delete(note)
          .where(
            and(
              eq(note.id, parsed.data.id),
              eq(note.workspaceId, ctx.workspaceId),
              isNotNull(note.deletedAt),
            ),
          )
          .returning({ id: note.id });
        if (!rows[0]) throw new ModuleActionError('回收站中不存在该笔记');
        return { purged: parsed.data.id };
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

    /** 事件订阅演示：note.created → 设置里自增计数 */
    onNoteCreated: {
      permission: 'note:read',
      handler: async (ctx) => {
        const current = await ctx.settings.get();
        const greeted = Number(current.greeted ?? 0) + 1;
        await ctx.settings.set({ greeted });
        return { greeted };
      },
    },

    /** 测试重试/死信路径：发布一个必然失败的事件 */
    emitFailing: {
      permission: 'note:write',
      handler: async (ctx) => {
        await ctx.events.publish('note.failing', { reason: '测试重试/死信' });
        return { published: true };
      },
    },

    onFailing: {
      permission: 'note:read',
      handler: async () => {
        throw new Error('故意失败（测试重试/死信路径）');
      },
    },
  },
};
