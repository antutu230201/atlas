import { describe, expect, it } from 'vitest';
import { moduleManifestSchema } from '../src/module';

describe('moduleManifestSchema（模块协议校验）', () => {
  it('接受合法 manifest', () => {
    const parsed = moduleManifestSchema.safeParse({
      name: 'todo_notes',
      version: '1.0.0',
      title: '待办与笔记',
      description: '示例',
      permissions: ['todo:read', 'todo:write'],
      dependsOn: [],
      routes: [{ path: 'list', title: '列表', nav: { order: 1 } }],
      events: { publishes: ['todo.created'], subscribes: [{ event: 'todo.*', handler: 'x' }] },
    });
    expect(parsed.success).toBe(true);
  });

  it('拒绝非法模块名 / 坏 semver / 空标题', () => {
    const base = {
      version: '1.0.0',
      title: 'T',
      description: 'D',
      permissions: ['x:read'],
      dependsOn: [],
      routes: [],
      events: { publishes: [], subscribes: [] },
    };
    expect(moduleManifestSchema.safeParse({ ...base, name: 'BadName' }).success).toBe(false);
    expect(
      moduleManifestSchema.safeParse({ ...base, name: 'ok_name', version: 'v1' }).success,
    ).toBe(false);
    expect(moduleManifestSchema.safeParse({ ...base, name: 'ok_name', title: '' }).success).toBe(
      false,
    );
    expect(
      moduleManifestSchema.safeParse({ ...base, name: 'ok_name', permissions: ['no-colon'] })
        .success,
    ).toBe(false);
  });

  it('事件订阅支持通配符写法', () => {
    const parsed = moduleManifestSchema.safeParse({
      name: 'ok_name',
      version: '1.0.0',
      title: 'T',
      description: 'D',
      permissions: [],
      dependsOn: [],
      routes: [],
      events: { publishes: [], subscribes: [{ event: '*', handler: 'h' }] },
    });
    expect(parsed.success).toBe(true);
  });
});
