import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 全模块数据导入（2026-11-15）——宪法 §4 备份恢复闭环：
 * 导出 → 篡改/追加 → 导入的往返测试。统一语义：保留原 id 幂等合并（冲突跳过）、
 * 文件里的 workspaceId 一律忽略（强制当前工作空间，防跨租户投放）、悬空引用跳过。
 */

let app: TestApp;
let cookie: string;

const call = (slug: string, module: string, action: string, body?: unknown) =>
  apiFetch(app.url, `/modules/workspaces/${slug}/${module}/call/${action}`, {
    method: 'POST',
    cookie,
    body: body ?? {},
  });

const setup = async (slug: string, module: string) => {
  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie,
    body: { name: `${slug} 空间`, slug },
  });
  const enabled = await apiFetch(app.url, `/modules/workspaces/${slug}/${module}/enable`, {
    method: 'POST',
    cookie,
  });
  expect(enabled.status).toBe(201);
};

/** 在导出 JSON 里追加一行伪造数据（新 id + 伪造的 workspaceId），返回原导出与追加行 */
const forge = <T extends { id?: string }>(rows: T[], extra: Partial<T>): T[] => {
  const forgedWorkspaceId = randomUUID();
  return [...rows, { ...extra, id: randomUUID(), workspaceId: forgedWorkspaceId } as T];
};

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'import-e2e@example.com', '导入验收');
  cookie = (await login(app.url, 'import-e2e@example.com')).cookie!;
});

afterAll(async () => {
  await app.close();
});

describe('模块数据导入（备份恢复闭环）', () => {
  it('todo_notes：导出→追加伪造→导入 1 跳 1→重导入全跳；伪造 workspaceId 被忽略', async () => {
    await setup('import-todo', 'todo_notes');
    await call('import-todo', 'todo_notes', 'create', { title: '已有待办' });
    const exported = (await call('import-todo', 'todo_notes', 'exportData')).body.data as {
      todos: Array<{ id: string; title: string }>;
    };
    expect(exported.todos).toHaveLength(1);

    const payload = {
      ...exported,
      todos: forge(exported.todos, { title: '伪造待办' }),
    };
    const first = (await call('import-todo', 'todo_notes', 'importData', payload)).body.data as {
      imported: number;
      skipped: number;
    };
    expect(first).toEqual({ imported: 1, skipped: 1 });
    // 重导入：全部跳过（保留原 id 的幂等性）
    const second = (await call('import-todo', 'todo_notes', 'importData', payload)).body.data as {
      imported: number;
    };
    expect(second.imported).toBe(0);
    // 伪造行落入当前工作空间（workspaceId 被忽略）
    const list = (await call('import-todo', 'todo_notes', 'list')).body.data as {
      todos: Array<{ title: string }>;
    };
    expect(list.todos.some((row) => row.title === '伪造待办')).toBe(true);
  });

  it('sample_note：往返导入含软删除状态', async () => {
    await setup('import-note', 'sample_note');
    await call('import-note', 'sample_note', 'create', { title: '已有笔记', body: '内容' });
    const exported = (await call('import-note', 'sample_note', 'exportData')).body.data as {
      notes: Array<{ id: string; title: string; deletedAt: string | null }>;
    };
    // 软删一条再导出 → 备份里应包含软删状态
    await call('import-note', 'sample_note', 'remove', { id: exported.notes[0]!.id });
    const afterDelete = (await call('import-note', 'sample_note', 'exportData')).body.data as {
      notes: Array<{ deletedAt: string | null }>;
    };
    const payload = {
      ...afterDelete,
      notes: forge(afterDelete.notes, { title: '伪造笔记', body: 'x' }),
    };
    const result = (await call('import-note', 'sample_note', 'importData', payload)).body.data as {
      imported: number;
      skipped: number;
    };
    // 已有笔记（软删状态保留 id）跳过，伪造行导入
    expect(result.imported).toBe(1);
    const restored = (
      await call('import-note', 'sample_note', 'restore', {
        id: exported.notes[0]!.id,
      })
    ).status;
    expect(restored).toBe(200); // 软删行以原 id 回来后可被恢复——软删状态随备份存活
    const list = (await call('import-note', 'sample_note', 'list')).body.data as {
      notes: Array<{ title: string }>;
    };
    expect(list.notes.some((row) => row.title === '伪造笔记')).toBe(true);
  });

  it('journal：同 (kind, day) 活跃条目冲突整行跳过，绝不覆盖', async () => {
    await setup('import-journal', 'journal');
    await call('import-journal', 'journal', 'saveEntry', {
      kind: 'daily',
      day: new Date().toISOString().slice(0, 10),
      content: '今天的原文',
    });
    const exported = (await call('import-journal', 'journal', 'exportData')).body.data as {
      entries: Array<{ id: string; kind: string; day: string; content: string }>;
    };
    expect(exported.entries).toHaveLength(1);
    const day = exported.entries[0]!.day;

    // 同日同 kind、不同 id 的新条目 → 冲突跳过；伪造 workspaceId 被忽略
    const payload = {
      ...exported,
      entries: [
        ...exported.entries,
        {
          id: randomUUID(),
          kind: 'daily',
          day,
          content: '企图覆盖今天',
          deletedAt: null,
          workspaceId: randomUUID(),
        },
      ],
    };
    const result = (await call('import-journal', 'journal', 'importData', payload)).body.data as {
      imported: number;
      skipped: number;
    };
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(2);
    const snapshot = (await call('import-journal', 'journal', 'snapshot')).body.data as {
      entries: Array<{ content: string }>;
    };
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]!.content).toContain('今天的原文');
  });

  it('goals：目标+关键结果导入；悬空 objectiveId 的关键结果被跳过', async () => {
    await setup('import-goals', 'goals');
    await call('import-goals', 'goals', 'createObjective', { title: '已有目标', period: 'year' });
    const exported = (await call('import-goals', 'goals', 'exportData')).body.data as {
      objectives: Array<{ id: string; title: string }>;
      keyResults: Array<{ id: string; objectiveId: string }>;
    };
    expect(exported.objectives).toHaveLength(1);
    const realObjectiveId = exported.objectives[0]!.id;

    const payload = {
      objectives: forge(exported.objectives, {
        title: '伪造目标',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }),
      keyResults: [
        {
          id: randomUUID(),
          objectiveId: realObjectiveId,
          title: '挂靠已有目标的关键结果',
          workspaceId: randomUUID(),
        },
        {
          id: randomUUID(),
          objectiveId: randomUUID(), // 悬空引用 → 跳过
          title: '悬空关键结果',
          workspaceId: randomUUID(),
        },
      ],
    };
    const result = (await call('import-goals', 'goals', 'importData', payload)).body.data as {
      imported: number;
      skipped: number;
      dangling: number;
    };
    expect(result.imported).toBe(2); // 伪造目标 + 挂靠关键结果
    expect(result.dangling).toBe(1);
    const snapshot = (await call('import-goals', 'goals', 'snapshot')).body.data as {
      objectives: Array<{ title: string; keyResults: Array<{ title: string }> }>;
    };
    expect(snapshot.objectives.some((row) => row.title === '伪造目标')).toBe(true);
    // 关键结果嵌在目标视图里；悬空的不会被导入
    const allKrTitles = snapshot.objectives.flatMap((row) => row.keyResults.map((kr) => kr.title));
    expect(allKrTitles).toContain('挂靠已有目标的关键结果');
    expect(allKrTitles).not.toContain('悬空关键结果');
  });

  it('habits：习惯+打卡导入；悬空 habitId 的打卡被跳过', async () => {
    await setup('import-habits', 'habits');
    await call('import-habits', 'habits', 'createHabit', { name: '已有习惯' });
    const exported = (await call('import-habits', 'habits', 'exportData')).body.data as {
      habits: Array<{ id: string; name: string }>;
      habitLogs: Array<{ id: string; habitId: string }>;
    };
    expect(exported.habits).toHaveLength(1);

    // 伪造习惯（forge 会给它一个新 id）+ 其打卡引用该 id；另一条打卡悬空引用随机 id
    const forgedHabits = forge(exported.habits, { name: '伪造习惯' });
    const forgedHabitId = forgedHabits[forgedHabits.length - 1]!.id as string;
    const payload = {
      habits: forgedHabits,
      habitLogs: [
        { id: randomUUID(), habitId: forgedHabitId, day: '2026-11-10', workspaceId: randomUUID() },
        { id: randomUUID(), habitId: randomUUID(), day: '2026-11-11', workspaceId: randomUUID() }, // 悬空
      ],
    };
    const result = (await call('import-habits', 'habits', 'importData', payload)).body.data as {
      imported: number;
      skipped: number;
      dangling: number;
    };
    expect(result.imported).toBe(2); // 伪造习惯 + 其打卡
    expect(result.dangling).toBe(1);
    const snapshot = (await call('import-habits', 'habits', 'snapshot')).body.data as {
      habits: Array<{ name: string }>;
      logs?: Array<{ day: string }>;
    };
    expect(snapshot.habits.some((row) => row.name === '伪造习惯')).toBe(true);
  });

  it('dashboard：倒计时往返导入，伪造 workspaceId 被忽略', async () => {
    await setup('import-dash', 'dashboard');
    await call('import-dash', 'dashboard', 'createCountdown', {
      title: '已有纪念日',
      targetDate: '2026-12-01',
    });
    const exported = (await call('import-dash', 'dashboard', 'exportData')).body.data as {
      countdowns: Array<{ id: string; title: string }>;
    };
    const payload = {
      ...exported,
      countdowns: forge(exported.countdowns, { title: '伪造纪念日', targetDate: '2027-01-01' }),
    };
    const result = (await call('import-dash', 'dashboard', 'importData', payload)).body.data as {
      imported: number;
      skipped: number;
    };
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    const snapshot = (await call('import-dash', 'dashboard', 'snapshot')).body.data as {
      countdowns: Array<{ title: string }>;
    };
    expect(snapshot.countdowns.some((row) => row.title === '伪造纪念日')).toBe(true);
  });

  it('校验拒绝：坏格式整批拒绝（400）', async () => {
    const bad1 = await call('import-todo', 'todo_notes', 'importData', { todos: [{ title: '' }] });
    expect(bad1.status).toBe(400);
    const bad2 = await call('import-journal', 'journal', 'importData', {
      entries: [{ day: 'not-a-date', content: 'x' }],
    });
    expect(bad2.status).toBe(400);
    const bad3 = await call('import-dash', 'dashboard', 'importData', {
      countdowns: [{ title: 'x', targetDate: '2026-13-99' }],
    });
    expect(bad3.status).toBe(400);
  });

  it('guest 只读：导入写操作被拒', async () => {
    await register(app.url, 'import-guest@example.com', '访客导入');
    const guestCookie = (await login(app.url, 'import-guest@example.com')).cookie!;
    const invite = await apiFetch(app.url, '/workspaces/import-habits/members/invite', {
      method: 'POST',
      cookie,
      body: { email: 'import-guest@example.com', role: 'guest' },
    });
    await apiFetch(app.url, '/auth/invitations/accept', {
      method: 'POST',
      cookie: guestCookie,
      body: { token: invite.body.data.token },
    });
    const denied = await apiFetch(
      app.url,
      '/modules/workspaces/import-habits/habits/call/importData',
      { method: 'POST', cookie: guestCookie, body: { habits: [] } },
    );
    expect(denied.status).toBe(403);
  });
});
