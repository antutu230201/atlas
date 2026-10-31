'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@atlas/ui';
import { api, ApiError } from '@/lib/api';
import { useActiveWorkspace } from '@/hooks/use-workspace';

type Tab = 'members' | 'modules' | 'audit';

interface MemberRow {
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
}

interface AuditRow {
  id: number;
  action: string;
  objectType: string;
  objectId: string;
  actorType: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { workspace, user } = useActiveWorkspace();
  const [tab, setTab] = useState<Tab>('members');

  if (!workspace) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">工作空间设置</h1>
        <p className="mt-1 text-sm text-muted">「{workspace.name}」的管理页。</p>
      </header>

      <nav aria-label="设置分区" className="flex gap-2">
        {(
          [
            ['members', '成员'],
            ['modules', '模块'],
            ['audit', '审计日志'],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? 'primary' : 'secondary'}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </nav>

      {tab === 'members' ? <MembersTab slug={workspace.slug} me={user?.id ?? ''} /> : null}
      {tab === 'modules' ? <ModulesTab slug={workspace.slug} /> : null}
      {tab === 'audit' ? <AuditTab slug={workspace.slug} /> : null}
    </div>
  );
}

function MembersTab({ slug, me }: { slug: string; me: string }) {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ['members', slug],
    queryFn: () => api<MemberRow[]>(`/workspaces/${slug}/members`),
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      api(`/workspaces/${slug}/members/invite`, { method: 'POST', json: { email, role } }),
    onSuccess: () => {
      setError(null);
      setEmail('');
      void queryClient.invalidateQueries({ queryKey: ['members', slug] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      api(`/workspaces/${slug}/members/${input.userId}`, {
        method: 'PATCH',
        json: { role: input.role },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['members', slug] }),
  });

  const remove = useMutation({
    mutationFn: (userId: string) =>
      api(`/workspaces/${slug}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['members', slug] }),
  });

  if (members.isPending) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>成员管理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <THead>
            <TR>
              <TH>成员</TH>
              <TH>角色</TH>
              <TH>操作</TH>
            </TR>
          </THead>
          <TBody>
            {(members.data ?? []).map((row) => (
              <TR key={row.userId}>
                <TD>
                  <span className="font-medium">{row.displayName}</span>
                  <span className="ml-2 text-xs text-muted">{row.email}</span>
                </TD>
                <TD>
                  <Badge variant={row.role === 'owner' ? 'primary' : 'neutral'}>{row.role}</Badge>
                </TD>
                <TD>
                  {row.role !== 'owner' && row.userId !== me ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => changeRole.mutate({ userId: row.userId, role: 'admin' })}
                      >
                        设为 admin
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(row.userId)}>
                        移除
                      </Button>
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <div className="space-y-3 rounded-sm border border-border p-4">
          <p className="text-sm font-semibold">邀请成员</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
            <Field id="invite-email" label="邮箱">
              <Input id="invite-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field id="invite-role" label="角色">
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="角色"
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 text-sm"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="guest">guest</option>
              </select>
            </Field>
            <div className="flex items-end">
              <Button loading={invite.isPending} onClick={() => invite.mutate()}>
                发送邀请
              </Button>
            </div>
          </div>
          {error ? <p className="text-xs text-err">{error}</p> : null}
          <p className="text-xs text-muted">
            本地开发：邀请令牌会出现在响应与审计日志中，收件人登录后在
            <code className="mx-1 rounded-xs bg-surface-hover px-1">/auth/invitations/accept</code>
            接受。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface ModuleStatus {
  name: string;
  version: string;
  title: string;
  description: string;
  enabled: boolean;
  installed: boolean;
}

function ModulesTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const modules = useQuery({
    queryKey: ['modules-status', slug],
    queryFn: () => api<ModuleStatus[]>(`/modules/workspaces/${slug}`),
  });

  const toggle = useMutation({
    mutationFn: (input: { name: string; enable: boolean }) =>
      api(`/modules/workspaces/${slug}/${input.name}/${input.enable ? 'enable' : 'disable'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['modules-status', slug] });
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
  });

  if (modules.isPending) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      {(modules.data ?? []).map((m) => (
        <Card key={m.name}>
          <CardHeader>
            <div>
              <CardTitle>
                {m.title}{' '}
                <span className="ml-2 text-xs font-normal text-muted">
                  {m.name} · v{m.version}
                </span>
              </CardTitle>
              <p className="mt-1 text-xs text-muted">{m.description}</p>
            </div>
            <Button
              size="sm"
              variant={m.enabled ? 'secondary' : 'primary'}
              onClick={() => toggle.mutate({ name: m.name, enable: !m.enabled })}
              disabled={toggle.isPending}
            >
              {m.enabled ? '停用' : '启用'}
            </Button>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function AuditTab({ slug }: { slug: string }) {
  const audit = useQuery({
    queryKey: ['audit', slug],
    queryFn: () => api<AuditRow[]>(`/workspaces/${slug}/audit`),
    retry: false,
  });

  if (audit.isPending) return <Skeleton className="h-40 w-full" />;
  const err = audit.error;
  if (err instanceof ApiError && err.status === 403) {
    return (
      <Card>
        <CardContent className="text-sm text-muted">
          需要 admin 及以上角色才能查看审计日志。
        </CardContent>
      </Card>
    );
  }

  const rows = audit.data ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-sm text-muted">暂无审计记录。</CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>时间</TH>
          <TH>动作</TH>
          <TH>对象</TH>
          <TH>触发者</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD className="text-xs text-muted">
              {new Date(row.createdAt).toLocaleString('zh-CN')}
            </TD>
            <TD>{row.action}</TD>
            <TD className="text-xs">
              {row.objectType}
              {row.objectId ? ` · ${row.objectId.slice(0, 12)}` : ''}
            </TD>
            <TD>
              <Badge variant={row.actorType === 'user' ? 'neutral' : 'info'}>{row.actorType}</Badge>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
