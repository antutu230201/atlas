'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const tabs: Array<[Tab, string]> = [
    ['modules', '模块'],
    ['audit', '审计日志'],
    ['ai', 'AI 配置'],
  ];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex(([key]) => key === tab);
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = (currentIndex + direction + tabs.length) % tabs.length;
    const nextTab = tabs[next];
    if (!nextTab) return;
    setTab(nextTab[0]);
    document.getElementById(`settings-tab-${nextTab[0]}`)?.focus();
  };

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

      <div role="tablist" aria-label="设置分区" onKeyDown={handleTabKeyDown} className="flex gap-2">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            id={`settings-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={tab === key ? `settings-panel-${key}` : undefined}
            tabIndex={tab === key ? 0 : -1}
            size="sm"
            variant={tab === key ? 'primary' : 'secondary'}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'modules' ? (
        <section
          id="settings-panel-modules"
          role="tabpanel"
          aria-labelledby="settings-tab-modules"
          tabIndex={0}
          className="space-y-6"
        >
          <ModulesTab slug={workspace.slug} />
          <PwaInstall />
        </section>
      ) : null}
      {tab === 'audit' ? (
        <section
          id="settings-panel-audit"
          role="tabpanel"
          aria-labelledby="settings-tab-audit"
          tabIndex={0}
        >
          <AuditTab slug={workspace.slug} />
        </section>
      ) : null}
      {tab === 'ai' ? (
        <section
          id="settings-panel-ai"
          role="tabpanel"
          aria-labelledby="settings-tab-ai"
          tabIndex={0}
        >
          <AiConfigTab />
        </section>
      ) : null}
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
  const { toast } = useToast();
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
      toast({ title: '模块状态已更新', variant: 'ok' });
    },
    onError: (error: Error) =>
      toast({ title: '模块状态更新失败', description: error.message, variant: 'err' }),
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
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast({ title: '待办数据已导出', variant: 'ok' });
    },
    onError: (error: Error) =>
      toast({ title: '导出失败', description: error.message, variant: 'err' }),
  });

  if (modules.isPending) return <Skeleton className="h-40 w-full" />;
  if (modules.isError) {
    return (
      <Card>
        <CardContent className="space-y-3 py-5">
          <p className="text-sm text-err" role="alert">
            模块列表加载失败：{modules.error instanceof Error ? modules.error.message : '请重试'}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void modules.refetch()}>
            重新加载
          </Button>
        </CardContent>
      </Card>
    );
  }

  const todoEnabled =
    modules.data?.some((module) => module.name === 'todo_notes' && module.enabled) ?? false;

  return (
    <div className="space-y-3">
      {(modules.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-5 text-sm text-muted">当前没有可管理的模块。</CardContent>
        </Card>
      ) : null}
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
              loading={toggle.isPending && toggle.variables?.name === m.name}
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
          disabled={!todoEnabled}
          onClick={() => exportData.mutate()}
        >
          导出待办 JSON
        </Button>
        {!todoEnabled ? (
          <span className="self-center text-xs text-muted">启用待办与笔记后可导出数据。</span>
        ) : null}
      </div>
    </div>
  );
}

function AuditTab({ slug }: { slug: string }) {
  // 时间范围与关键词下沉到 SQL（服务端过滤），输入防抖 400ms 后才发请求
  const [days, setDays] = useState<'7' | '30' | 'all'>('30');
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const audit = useQuery({
    queryKey: ['audit', slug, days, debounced],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (days !== 'all') params.set('days', days);
      if (debounced) params.set('q', debounced);
      params.set('limit', '200');
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      return api<AuditRow[]>(`/workspaces/${slug}/audit${suffix}`, { signal });
    },
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

  if (audit.isError && !audit.data) {
    return (
      <Card role="alert">
        <CardContent className="space-y-3 py-5">
          <p className="text-sm text-err">
            审计日志加载失败：{audit.error instanceof Error ? audit.error.message : '请重试'}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void audit.refetch()}>
            重新加载
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rows = audit.data ?? [];
  const filtered = rows;

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

      {audit.isFetching && audit.data ? (
        <p className="text-xs text-muted" role="status" aria-live="polite">
          正在更新审计记录…
        </p>
      ) : null}
      {audit.isError && audit.data ? (
        <p className="text-sm text-err" role="alert">
          更新失败，当前显示的是上次结果。{' '}
          <button type="button" className="underline" onClick={() => void audit.refetch()}>
            重试
          </button>
        </p>
      ) : null}

      <p className="text-xs text-muted">
        {filtered.length >= 200 ? '最近 200 条（更早的已省略）' : `${filtered.length} 条记录`}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted">
            {rows.length === 0 ? '暂无审计记录。' : '没有匹配的审计记录。'}
          </CardContent>
        </Card>
      ) : (
        <Table aria-label="审计日志记录">
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
  const normalizedBaseUrl = baseUrl.trim();
  let validBaseUrl = false;
  try {
    const parsed = new URL(normalizedBaseUrl);
    validBaseUrl =
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      normalizedBaseUrl.length <= 300;
  } catch {
    validBaseUrl = false;
  }
  const normalizedModel = model.trim();
  const validModel = normalizedModel.length > 0 && normalizedModel.length <= 120;
  const numericTimeout = Number(timeoutMs);
  const validTimeout =
    Number.isInteger(numericTimeout) && numericTimeout >= 1000 && numericTimeout <= 120_000;
  const formValid = validBaseUrl && validModel && validTimeout && apiKey.length <= 400;

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
          baseUrl: normalizedBaseUrl,
          model: normalizedModel,
          // 留空 = 保持现有 key 不变（服务端 apiKey undefined 语义）
          apiKey: apiKey.length > 0 ? apiKey : undefined,
          timeoutMs: numericTimeout,
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
          baseUrl: normalizedBaseUrl,
          model: normalizedModel,
          apiKey: apiKey.length > 0 ? apiKey : undefined,
          timeoutMs: numericTimeout,
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
        AI 配置加载失败：{config.error instanceof Error ? config.error.message : '请重试'}{' '}
        <button type="button" className="underline" onClick={() => void config.refetch()}>
          重试
        </button>
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
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setTestResult(null);
              }}
              placeholder="https://tokenrhythm.studio/v1"
              id="ai-base-url"
              aria-label="Base URL"
              disabled={save.isPending || test.isPending}
              aria-invalid={!validBaseUrl}
            />
          </Field>
          {!validBaseUrl ? (
            <p className="-mt-3 text-xs text-err" role="alert">
              请输入合法的 HTTP/HTTPS 地址（最多 300 个字符）。
            </p>
          ) : null}
          <Field id="ai-model" label="模型名" hint="以供应商 /v1/models 实际返回为准">
            <Input
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
                setTestResult(null);
              }}
              placeholder="deepseek-v4.1-flash-1017"
              id="ai-model"
              aria-label="模型名"
              disabled={save.isPending || test.isPending}
              aria-invalid={!validModel}
            />
          </Field>
          {!validModel ? (
            <p className="-mt-3 text-xs text-err" role="alert">
              请输入 1–120 个字符的模型名。
            </p>
          ) : null}
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
              onChange={(event) => {
                setApiKey(event.target.value);
                setTestResult(null);
              }}
              placeholder={config.data.hasKey ? '••••••••（留空保持不变）' : 'sk_...'}
              id="ai-api-key"
              aria-label="API Key"
              autoComplete="off"
              maxLength={400}
              disabled={save.isPending || test.isPending}
            />
          </Field>
          <Field id="ai-timeout" label="超时（毫秒）" hint="单次 AI 请求超时，1000–120000">
            <Input
              type="number"
              value={timeoutMs}
              onChange={(event) => {
                setTimeoutMs(event.target.value);
                setTestResult(null);
              }}
              id="ai-timeout"
              aria-label="超时毫秒"
              min={1000}
              max={120000}
              className="w-40"
              disabled={save.isPending || test.isPending}
              aria-invalid={!validTimeout}
            />
          </Field>
          {!validTimeout ? (
            <p className="-mt-3 text-xs text-err" role="alert">
              超时必须是 1000–120000 的整数。
            </p>
          ) : null}

          {testResult ? (
            <p
              role={testResult.ok ? 'status' : 'alert'}
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
              disabled={!formValid || save.isPending}
              onClick={() => test.mutate()}
            >
              测试连接
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!formValid || test.isPending}
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
