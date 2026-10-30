import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createManagedDb } from '../../src/db/client';
import { workspace as workspaceTable } from '../../src/db/schema';

describe('调试：最小对照（raw vs drizzle insert）', () => {
  const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');
  const appDb = createManagedDb('postgres://atlas_app:atlas_app@localhost:5433/atlas');
  let userId = '';

  afterAll(async () => {
    await admin.db.execute(sql`delete from platform."user" where email = 'min@example.com'`);
    await admin.end();
    await appDb.end();
  });

  it('同一事务模式下的两种插入方式', async () => {
    const inserted = await admin.db.execute(sql`
      insert into platform."user" (email, password_hash, display_name)
      values ('min@example.com', 'x', '对照用户') returning id
    `);
    userId = (inserted.rows[0] as { id: string }).id;

    // A. raw sql insert
    await appDb.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.execute(
        sql`insert into platform.workspace (name, slug, created_by) values ('对照A', 'min-a', ${userId}::uuid)`,
      );
    });
    console.log('[min] raw insert 成功');

    // B. drizzle insert builder（服务路径）
    await appDb.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.insert(workspaceTable).values({ name: '对照B', slug: 'min-b', createdBy: userId });
    });
    console.log('[min] drizzle insert 成功');

    await admin.db.execute(sql`delete from platform.workspace where slug in ('min-a','min-b')`);
    expect(true).toBe(true);
  });
});
