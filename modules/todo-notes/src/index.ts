import { and, asc, desc, eq, ilike, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { ModuleActionError, type ModuleDefinition } from '@atlas/sdk';
import { moduleManifestSchema } from '@atlas/sdk';
import { todo } from './db/schema';

/**
 * 待办与笔记（ADR-0003）：第一个正式业务模块。
 * 能力：CRUD、状态流转、筛选/搜索/排序、拖拽排序、软删除回收站、事件、首页 widget。
 */

const manifest = moduleManifestSchema.parse({
  name: 'todo_notes',
  version: '0.1.0',
  title: '待办与笔记',
  description: '记录待办、追踪状态、回收站与首页小组件。',
  permissions: ['todo:read', 'todo:write'],
  dependsOn: [],
  routes: [
    { path: 'list', title: '待办', nav: { order: 10 } },
    { path: 'trash', title: '回收站', nav: { order: 20 } },
  ],
  widgets: [{ id: 'today', title: '今日待办', component: 'TodayWidget', span: 2 }],
  settings: [{ key: 'showCompleted', label: '列表中显示已完成', type: 'boolean', default: false }],
  events: {
    publishes: ['todo.created', 'todo.completed', 'todo.deleted', 'todo.restored'],
    subscribes: [],
  },
  migrations: 'migrations',
});

const STATUSES = ['open', 'doing', 'done'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;

const createSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(120),
  notes: z.string().max(5000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
  notes: z.string().max(5000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: z.string().nullable().optional(),
});

const idSchema = z.object({ id: z.string().uuid() });
const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

function bad(message: string): never {
  throw new ModuleActionError(`输入不合法：${message}`);
}

export const definition: ModuleDefinition = {
  manifest,
  actions: {
    /** 列表：软删过滤 + 状态筛选 + 标题搜索 + 排序（created/due/priority × 方向） */
    list: {
      permission: 'todo:read',
      handler: async (ctx, input) => {
        const query = (input ?? {}) as {
          status?: string;
          q?: string;
          sort?: string;
          dir?: string;
        };
        const conditions: SQL[] = [eq(todo.workspaceId, ctx.workspaceId), isNull(todo.deletedAt)];
        if (query.status && (STATUSES as readonly string[]).includes(query.status)) {
          conditions.push(eq(todo.status, query.status as (typeof STATUSES)[number]));
        }
        if (query.q && query.q.trim().length > 0) {
          conditions.push(ilike(todo.title, `%${query.q.trim()}%`));
        }
        const sortColumn =
          query.sort === 'due'
            ? todo.dueDate
            : query.sort === 'priority'
              ? sql`case ${todo.priority} when 'high' then 0 when 'normal' then 1 else 2 end`
              : todo.createdAt;
        const direction = query.dir === 'asc' ? asc : desc;
        const primaryOrder = direction(sortColumn);
        const rows = await ctx.db
          .select()
          .from(todo)
          .where(and(...conditions))
          .orderBy(
            query.sort === 'due' ? sql`${primaryOrder} nulls last` : primaryOrder,
            asc(todo.sortOrder),
          )
          .limit(200);
        return { todos: rows };
      },
    },

    create: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = createSchema.safeParse(input);
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const maxRows = await ctx.db
          .select({ max: sql<number>`coalesce(max(${todo.sortOrder}), 0)` })
          .from(todo)
          .where(and(eq(todo.workspaceId, ctx.workspaceId), isNull(todo.deletedAt)));
        const rows = await ctx.db
          .insert(todo)
          .values({
            workspaceId: ctx.workspaceId,
            title: parsed.data.title,
            notes: parsed.data.notes ?? '',
            priority: parsed.data.priority ?? 'normal',
            dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
            createdBy: ctx.userId,
            sortOrder: Number(maxRows[0]?.max ?? 0) + 1,
          })
          .returning();
        const created = rows[0]!;
        await ctx.events.publish('todo.created', { todoId: created.id, title: created.title });
        return created;
      },
    },

    update: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const { id, dueDate, ...rest } = parsed.data;
        const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
        if (
          dueDate !== undefined &&
          dueDate !== null &&
          Number.isNaN(new Date(dueDate).getTime())
        ) {
          bad('dueDate 不是合法时间');
        }
        if (dueDate !== undefined) patch.dueDate = dueDate === null ? null : new Date(dueDate);
        const rows = await ctx.db
          .update(todo)
          .set(patch)
          .where(
            and(eq(todo.id, id), eq(todo.workspaceId, ctx.workspaceId), isNull(todo.deletedAt)),
          )
          .returning();
        const updated = rows[0];
        if (!updated) bad('待办不存在或已删除');
        return updated;
      },
    },

    /** 状态流转：done 时记录 completedAt 并发布完成事件 */
    setStatus: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = z
          .object({ id: z.string().uuid(), status: z.enum(STATUSES) })
          .safeParse(input);
        if (!parsed.success) bad('status 必须是 open/doing/done');
        const completedAt = parsed.data.status === 'done' ? new Date() : null;
        const rows = await ctx.db
          .update(todo)
          .set({ status: parsed.data.status, completedAt, updatedAt: new Date() })
          .where(
            and(
              eq(todo.id, parsed.data.id),
              eq(todo.workspaceId, ctx.workspaceId),
              isNull(todo.deletedAt),
            ),
          )
          .returning();
        const updated = rows[0];
        if (!updated) bad('待办不存在或已删除');
        if (parsed.data.status === 'done') {
          await ctx.events.publish('todo.completed', { todoId: updated.id, title: updated.title });
        }
        return updated;
      },
    },

    /** 拖拽排序：按传入顺序写 sortOrder（仅限本工作空间行） */
    reorder: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = reorderSchema.safeParse(input);
        if (!parsed.success) bad('ids 必须是 uuid 数组');
        for (const [index, id] of parsed.data.ids.entries()) {
          await ctx.db
            .update(todo)
            .set({ sortOrder: index + 1, updatedAt: new Date() })
            .where(
              and(eq(todo.id, id), eq(todo.workspaceId, ctx.workspaceId), isNull(todo.deletedAt)),
            );
        }
        return { reordered: parsed.data.ids.length };
      },
    },

    /** 软删除 → 回收站 */
    remove: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input);
        if (!parsed.success) bad('id 必须是 uuid');
        const rows = await ctx.db
          .update(todo)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(todo.id, parsed.data.id),
              eq(todo.workspaceId, ctx.workspaceId),
              isNull(todo.deletedAt),
            ),
          )
          .returning({ id: todo.id, title: todo.title });
        const removed = rows[0];
        if (!removed) bad('待办不存在或已在回收站');
        await ctx.events.publish('todo.deleted', { todoId: removed.id, title: removed.title });
        return { removed: removed.id };
      },
    },

    listTrash: {
      permission: 'todo:read',
      handler: async (ctx) => {
        const rows = await ctx.db
          .select()
          .from(todo)
          .where(and(eq(todo.workspaceId, ctx.workspaceId), isNotNull(todo.deletedAt)))
          .orderBy(desc(todo.deletedAt))
          .limit(100);
        return { todos: rows };
      },
    },

    restore: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input);
        if (!parsed.success) bad('id 必须是 uuid');
        const rows = await ctx.db
          .update(todo)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(
            and(
              eq(todo.id, parsed.data.id),
              eq(todo.workspaceId, ctx.workspaceId),
              isNotNull(todo.deletedAt),
            ),
          )
          .returning();
        const restored = rows[0];
        if (!restored) bad('回收站中不存在该待办');
        await ctx.events.publish('todo.restored', { todoId: restored.id, title: restored.title });
        return restored;
      },
    },

    /** 回收站永久删除（不可恢复） */
    purge: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input);
        if (!parsed.success) bad('id 必须是 uuid');
        const rows = await ctx.db
          .delete(todo)
          .where(
            and(
              eq(todo.id, parsed.data.id),
              eq(todo.workspaceId, ctx.workspaceId),
              isNotNull(todo.deletedAt),
            ),
          )
          .returning({ id: todo.id });
        if (rows.length === 0) bad('回收站中不存在该待办');
        return { purged: parsed.data.id };
      },
    },

    /** 首页小组件：未完成计数 + 今日到期 + 最近五条 */
    widgetToday: {
      permission: 'todo:read',
      handler: async (ctx) => {
        const base = and(eq(todo.workspaceId, ctx.workspaceId), isNull(todo.deletedAt));
        const openRows = await ctx.db
          .select({
            id: todo.id,
            title: todo.title,
            status: todo.status,
            dueDate: todo.dueDate,
            priority: todo.priority,
          })
          .from(todo)
          .where(and(base, sql`${todo.status} <> 'done'`))
          .orderBy(asc(todo.sortOrder))
          .limit(5);
        const countRows = await ctx.db
          .select({ n: sql<number>`count(*)` })
          .from(todo)
          .where(and(base, sql`${todo.status} <> 'done'`));
        return {
          openCount: Number(countRows[0]?.n ?? 0),
          recent: openRows,
        };
      },
    },

    /** 全文搜索：标题 + 正文模糊匹配 */
    search: {
      permission: 'todo:read',
      handler: async (ctx, input) => {
        const parsed = z.object({ q: z.string().min(1).max(200) }).safeParse(input);
        if (!parsed.success) return { results: [] };
        const term = `%${parsed.data.q.trim()}%`;
        const rows = await ctx.db
          .select({
            id: todo.id,
            title: todo.title,
            status: todo.status,
            priority: todo.priority,
          })
          .from(todo)
          .where(
            and(
              eq(todo.workspaceId, ctx.workspaceId),
              isNull(todo.deletedAt),
              sql`(${todo.title} ILIKE ${term} OR ${todo.notes} ILIKE ${term})`,
            ),
          )
          .limit(20);
        return {
          results: rows.map((row) => ({
            label: row.title,
            hint: row.status === 'done' ? '已完成' : row.status === 'doing' ? '进行中' : '待办',
            href: `/m/todo_notes/list`,
          })),
        };
      },
    },

    /** 导出全部待办为 JSON（含已删除） */
    exportData: {
      permission: 'todo:read',
      handler: async (ctx) => {
        const rows = await ctx.db.select().from(todo).where(eq(todo.workspaceId, ctx.workspaceId));
        return {
          exportedAt: new Date().toISOString(),
          moduleName: 'todo_notes',
          count: rows.length,
          todos: rows,
        };
      },
    },

    /** 导入：接受导出格式的 JSON，跳过已存在的 id，返回导入计数 */
    importData: {
      permission: 'todo:write',
      handler: async (ctx, input) => {
        const parsed = z
          .object({
            todos: z.array(
              z.object({
                id: z.string().uuid().optional(),
                title: z.string().min(1).max(120),
                notes: z.string().optional(),
                status: z.enum(STATUSES).optional(),
                priority: z.enum(PRIORITIES).optional(),
                dueDate: z.string().nullable().optional(),
              }),
            ),
          })
          .safeParse(input);
        if (!parsed.success) bad('导入数据格式不正确');
        let imported = 0;
        for (const item of parsed.data.todos) {
          // 有 id 时检查是否已存在（跳过重复），无 id 直接插入
          if (item.id) {
            const exists = await ctx.db
              .select({ id: todo.id })
              .from(todo)
              .where(eq(todo.id, item.id))
              .limit(1);
            if (exists.length > 0) continue;
          }
          await ctx.db.insert(todo).values({
            workspaceId: ctx.workspaceId,
            title: item.title,
            notes: item.notes ?? '',
            status: item.status ?? 'open',
            priority: item.priority ?? 'normal',
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            createdBy: ctx.userId,
          });
          imported += 1;
        }
        return { imported, skipped: parsed.data.todos.length - imported };
      },
    },
  },
};
