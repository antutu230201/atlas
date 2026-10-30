import { describe, expect, it } from 'vitest';
import { assertCan, can, canModule, KERNEL_PERMISSIONS, ROLES } from '../src/rbac';

describe('can（内核权限点）', () => {
  it('owner 持全量通配', () => {
    for (const permission of KERNEL_PERMISSIONS) {
      expect(can('owner', permission)).toBe(true);
    }
    expect(can('owner', 'anything:else')).toBe(true);
  });

  it('admin 除删除工作空间外全量', () => {
    expect(can('admin', 'member:manage')).toBe(true);
    expect(can('admin', 'module:manage')).toBe(true);
    expect(can('admin', 'workspace:delete')).toBe(false);
  });

  it('member / guest 只有通知与设置权限', () => {
    expect(can('member', 'settings:write')).toBe(true);
    expect(can('member', 'member:manage')).toBe(false);
    expect(can('guest', 'audit:read')).toBe(false);
    expect(can('guest', 'notification:read')).toBe(true);
  });

  it('未知权限点对非 owner 一律拒绝', () => {
    expect(can('admin', 'todo:write')).toBe(false);
  });
});

describe('canModule（模块权限点）', () => {
  it('owner / admin 全量', () => {
    expect(canModule('owner', 'todo:write')).toBe(true);
    expect(canModule('admin', 'todo:delete')).toBe(true);
  });

  it('member 可读写', () => {
    expect(canModule('member', 'todo:write')).toBe(true);
    expect(canModule('member', 'todo:read')).toBe(true);
  });

  it('guest 只读：write/delete/create/update/invite 一律拒绝', () => {
    expect(canModule('guest', 'todo:read')).toBe(true);
    expect(canModule('guest', 'todo:write')).toBe(false);
    expect(canModule('guest', 'todo:delete')).toBe(false);
    expect(canModule('guest', 'todo:create')).toBe(false);
  });
});

describe('assertCan', () => {
  it('拒绝时抛出带角色与权限点的错误', () => {
    expect(() => assertCan('guest', 'member:manage')).toThrow(/权限不足.*guest.*member:manage/);
    expect(() => assertCan('owner', 'workspace:delete')).not.toThrow();
  });

  it('ROLES 覆盖四种角色', () => {
    expect(ROLES).toEqual(['owner', 'admin', 'member', 'guest']);
  });
});
