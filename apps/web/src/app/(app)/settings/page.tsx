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
  useToast,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@atlas/ui';
import { api, ApiError } from '@/lib/api';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { PwaInstall } from '@/components/pwa-install';

type Tab = 'modules' | 'audit' | 'ai';

interface AuditRow {
  id: number;
  action: string;
  objectType: string;
  objectId: string;
  actorType: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { workspace } = useActiveWorkspace();
  const [tab, setTab] = useState<Tab>('modules');

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
        <h1 className="text-2xl font-semibold">设置</h1>
        <p className="mt-1 text-sm text-muted">个人大屏「{workspace.name}」。</p>
      </header>

      <nav aria-label="设置分区" className="flex gap-2">
        {(
          [
            ['modules', '模块'],
            ['audit', '审计日志'],
            ['ai', 'AI 配置'],
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

      {tab === 'modules' ? (
        <>
          <ModulesTab slug={workspace.slug} />
          <PwaInstall />
        </>
      ) : null}
      {tab === 'audit' ? <AuditTab slug={workspace.slug} /> : null}
      {tab === 'ai' ? <AiConfigTab /> : null}
    </div>
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
    queryKey: ['module-status', slug],
    queryFn: () => api<ModuleStatus[]>(`/modules/workspaces/${slug}`),
  });

  const toggle = useMutation({
    mutationFn: (input: { name: string; enable: boolean }) =>
      api(`/modules/workspaces/${slug}/${input.name}/${input.enable ? 'enable' : 'disable'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['module-status', slug] });
    },
  });

  const exportData = useMutation({
    mutationFn: () =>
      api<{ todos: Array<{ title: string; status: string; priority: string }> }>(
        `/modules/workspaces/${slug}/todo_notes/call/exportData`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todo_notes_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  if (modules.isPending) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      {(modules.data ?? []).map((m) => (
        <Card key={m.name} data-testid={`module-card-${m.name}`}>
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
      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="secondary"
          loading={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          导出待办 JSON
        </Button>
      </div>
    </div>
  );
}

function AuditTab({ slug }: { slug: string }) {
  const audit = useQuery({
    queryKey: ['audit', slug],
    queryFn: () => api<AuditRow[]>(`/workspaces/${slug}/audit`),
    retry: false,
  });
  const [days, setDays] = useState<'7' | '30' | 'all'>('30');
  const [keyword, setKeyword] = useState('');

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
  const cutoff = days === 'all' ? 0 : Date.now() - Number(days) * 86_400_000;
  const query = keyword.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (cutoff && new Date(row.createdAt).getTime() < cutoff) return false;
    if (!query) return true;
    return `${row.action} ${row.objectType} ${row.objectId} ${row.actorType}`
      .toLowerCase()
      .includes(query);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="审计时间范围">
          {(
            [
              { key: '7', label: '近 7 天' },
              { key: '30', label: '近 30 天' },
              { key: 'all', label: '全部' },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={days === option.key}
              onClick={() => setDays(option.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                days === option.key
                  ? 'border-primary/40 bg-primary-soft text-primary'
                  : 'border-border bg-surface/60 text-muted hover:text-text'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索动作 / 对象 / 触发者"
          aria-label="搜索审计日志"
          className="ml-auto w-full sm:w-60"
        />
      </div>

      <p className="text-xs text-muted">
        {filtered.length} / {rows.length} 条
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted">
            {rows.length === 0 ? '暂无审计记录。' : '没有匹配的审计记录。'}
          </CardContent>
        </Card>
      ) : (
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
            {filtered.map((row) => (
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
                  <Badge variant={row.actorType === 'user' ? 'neutral' : 'info'}>
                    {row.actorType}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

/* ---------------- AI 配置 ---------------- */

interface AiConfigView {
  source: 'db' | 'env' | 'mock';
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keyMasked: string | null;
}

const SOURCE_LABELS: Record<AiConfigView['source'], string> = {
  db: '界面配置',
  env: '环境变量',
  mock: '未配置（本地 Mock）',
};

function AiConfigTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api<AiConfigView>('/ai/config'),
  });

  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [timeoutMs, setTimeoutMs] = useState('30000');
  const [initialized, setInitialized] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // 首次加载后用服务端当前值初始化表单（后续重置不再覆盖用户输入）
  if (config.data && !initialized) {
    setBaseUrl(config.data.baseUrl);
    setModel(config.data.model);
    setTimeoutMs(String(config.data.timeoutMs));
    setInitialized(true);
  }

  const save = useMutation({
    mutationFn: () =>
      api<AiConfigView>('/ai/config', {
        method: 'PUT',
        json: {
          baseUrl,
          model,
          // 留空 = 保持现有 key 不变（服务端 apiKey undefined 语义）
          apiKey: apiKey.length > 0 ? apiKey : undefined,
          timeoutMs: Number(timeoutMs) || 30000,
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['ai-config'], data);
      setApiKey('');
      setTestResult(null);
      toast({ title: 'AI 配置已保存，立即生效', variant: 'ok' });
    },
    onError: (e: Error) => toast({ title: '保存失败', description: e.message, variant: 'err' }),
  });

  const test = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; error?: string; model?: string; sample?: string }>('/ai/config/test', {
        method: 'POST',
        json: {
          baseUrl,
          model,
          apiKey: apiKey.length > 0 ? apiKey : undefined,
          timeoutMs: Number(timeoutMs) || 30000,
        },
      }),
    onSuccess: (data) => {
      setTestResult(
        data.ok
          ? { ok: true, text: `连接成功（${data.model}）：${data.sample ?? ''}` }
          : { ok: false, text: data.error ?? '连接失败' },
      );
    },
    onError: (e: Error) => setTestResult({ ok: false, text: e.message }),
  });

  if (config.isPending) {
    return <Skeleton className="h-64 w-full rounded-md" />;
  }
  if (config.isError) {
    return (
      <p className="rounded-md border border-err/30 bg-err-soft p-4 text-sm text-err" role="alert">
        AI 配置加载失败：{config.error instanceof Error ? config.error.message : '请重试'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI 供应商</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted">
            当前来源：
            <Badge variant={config.data.source === 'mock' ? 'neutral' : 'info'}>
              {SOURCE_LABELS[config.data.source]}
            </Badge>
            {config.data.hasKey ? (
              <span className="ml-2">
                Key{' '}
                <code className="rounded-xs bg-surface-hover px-1">{config.data.keyMasked}</code>
              </span>
            ) : null}
            。适配任意 OpenAI 兼容服务（TokenRhythm / DeepSeek / OpenAI / 智谱等）；保存后立即生效，
            无需重启。密钥仅存数据库与后端内存，界面与审计日志只显示掩码。
          </p>

          <Field id="ai-base-url" label="Base URL" hint="OpenAI 兼容接口根地址，以 /v1 结尾">
            <Input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://tokenrhythm.studio/v1"
              id="ai-base-url"
              aria-label="Base URL"
            />
          </Field>
          <Field id="ai-model" label="模型名" hint="以供应商 /v1/models 实际返回为准">
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="deepseek-v4.1-flash-1017"
              id="ai-model"
              aria-label="模型名"
            />
          </Field>
          <Field
            id="ai-api-key"
            label="API Key"
            hint={
              config.data.hasKey
                ? `已配置（${config.data.keyMasked}），留空表示保持不变`
                : '仅在创建时完整展示一次，请妥善保存'
            }
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={config.data.hasKey ? '••••••••（留空保持不变）' : 'sk_...'}
              id="ai-api-key"
              aria-label="API Key"
              autoComplete="off"
            />
          </Field>
          <Field id="ai-timeout" label="超时（毫秒）" hint="单次 AI 请求超时，1000–120000">
            <Input
              type="number"
              value={timeoutMs}
              onChange={(event) => setTimeoutMs(event.target.value)}
              id="ai-timeout"
              aria-label="超时毫秒"
              min={1000}
              max={120000}
              className="w-40"
            />
          </Field>

          {testResult ? (
            <p
              role="status"
              className={`rounded-sm border p-3 text-xs ${
                testResult.ok
                  ? 'border-ok/30 bg-ok-soft text-ok'
                  : 'border-err/30 bg-err-soft text-err'
              }`}
            >
              {testResult.text}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={test.isPending}
              disabled={!baseUrl || !model}
              onClick={() => test.mutate()}
            >
              测试连接
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!baseUrl || !model}
              onClick={() => save.mutate()}
            >
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
