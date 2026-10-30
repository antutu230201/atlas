/**
 * RBAC 权限点模型（ADR-0005 §6）。
 *
 * 规则：代码里只问 can(role, 'todo:write')，禁止散落 if(role===...) 判断。
 * 权限点字符串 = <资源>:<动作>。内核点在 KERNEL_PERMISSIONS；
 * 模块点由模块 manifest 声明，按模块约定（guest 只读、member 读写）判定。
 */

export type Role = 'owner' | 'admin' | 'member' | 'guest';

export const ROLES: Role[] = ['owner', 'admin', 'member', 'guest'];

export const KERNEL_PERMISSIONS = [
  'workspace:manage',
  'workspace:delete',
  'member:manage',
  'module:manage',
  'audit:read',
  'notification:read',
  'settings:write',
] as const;

/** 各角色的内核权限集合；owner 持 '*'（全量，含 workspace:delete） */
export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  owner: ['*'],
  admin: [
    'workspace:manage',
    'member:manage',
    'module:manage',
    'audit:read',
    'notification:read',
    'settings:write',
  ],
  member: ['notification:read', 'settings:write'],
  guest: ['notification:read'],
};

/** 内核权限点判定 */
export function can(role: Role, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes('*') || permissions.includes(permission);
}

/**
 * 模块权限点判定（模块自定义 <module>:<action>）：
 * owner/admin 全量；member 读写；guest 只读（动作非 write/delete 即只读可过）。
 */
export function canModule(role: Role, modulePermission: string): boolean {
  if (role === 'owner' || role === 'admin') return true;
  const readOnlyAction = /:(write|delete|create|update|invite)$/.test(modulePermission);
  if (role === 'member') return true;
  return role === 'guest' ? !readOnlyAction : false;
}

export function assertCan(role: Role, permission: string): void {
  if (!can(role, permission)) {
    throw new Error(`权限不足：角色 ${role} 缺少 ${permission}`);
  }
}
