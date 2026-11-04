'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Skeleton, useToast } from '@atlas/ui';
import { api } from '@/lib/api';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useUiStore } from '@/lib/store';
import { ActivityCard } from './activity-card';
import { ClockCard } from './clock-card';
import { CountdownSection } from './countdown-card';
import { HealthDot, WeatherIcon } from './icons';
import { HotlistCard } from './hotlist-card';
import { QuoteCard } from './quote-card';
import { SettingsDrawer } from './settings-drawer';
import { SummaryCard } from './summary-card';
import { Ticker } from './ticker';
import { WeatherCard } from './weather-card';
import { HOT_SOURCE_LABELS, type DashboardSnapshot, type CountdownItem } from './types';

/** 氛围背景：必应壁纸（可关，onError 自动降级）→ 极光渐变兜底；视觉值全部来自 tokens */
function ScreenBackground({
  wallpaperUrl,
  copyright,
}: {
  wallpaperUrl?: string;
  copyright?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = wallpaperUrl !== undefined && wallpaperUrl.length > 0 && !imageFailed;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {showImage ? (
        <>
          {/* 外部每日壁纸直接用 img：域名每日变化，Next Image 域名白名单不可预知 */}
          <img
            src={wallpaperUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
          {copyright ? (
            <span className="absolute right-3 bottom-2 z-10 text-[10px] text-muted/80">
              {copyright}
            </span>
          ) : null}
        </>
      ) : null}
      {/* 极光层：壁纸之上再叠一层，保证玻璃卡片的层次感 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 70% at 12% 18%, var(--screen-aurora-1) 0%, transparent 62%),' +
            'radial-gradient(45% 60% at 88% 12%, var(--screen-aurora-2) 0%, transparent 58%),' +
            'radial-gradient(50% 65% at 70% 92%, var(--screen-aurora-3) 0%, transparent 60%)',
          opacity: showImage ? 0.22 : 0.35,
        }}
      />
      <div className="absolute inset-0" style={{ background: 'var(--screen-scrim)' }} />
    </div>
  );
}

/** 个人大屏主页：时钟农历 / 天气 / 滚动头条 / 多源热榜 / 一言 / 倒计时 / 氛围壁纸 */
export function DashboardScreenPage({
  workspaceSlug,
  moduleName,
}: {
  workspaceSlug: string;
  moduleName: string;
}) {
  const { workspace, user } = useActiveWorkspace();
  const canWrite = workspace?.role !== 'guest';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chromeHidden = useUiStore((state) => state.chromeHidden);
  const setChromeHidden = useUiStore((state) => state.setChromeHidden);
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;

  // 沉浸态随页面卸载复位，避免用户离开大屏后外壳仍隐藏
  useEffect(() => () => setChromeHidden(false), [setChromeHidden]);

  const snapshot = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'snapshot'],
    queryFn: () => api<DashboardSnapshot>(`${base}/snapshot`, { method: 'POST', json: {} }),
    refetchInterval: 10 * 60_000,
  });

  const fail = (e: Error) => toast({ title: '操作失败', description: e.message, variant: 'err' });
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['module', moduleName, workspaceSlug, 'snapshot'],
    });
  };

  const refresh = useMutation({
    mutationFn: () => api(`${base}/refresh`, { method: 'POST', json: {} }),
    onSuccess: () => {
      invalidate();
      toast({ title: '已刷新全部数据源', variant: 'ok' });
    },
    onError: fail,
  });

  const createCountdown = useMutation({
    mutationFn: (input: { title: string; targetDate: string; pinned?: boolean }) =>
      api(`${base}/createCountdown`, { method: 'POST', json: input }),
    onSuccess: () => {
      invalidate();
      toast({ title: '已添加倒计时', variant: 'ok' });
    },
    onError: fail,
  });

  const deleteCountdown = useMutation({
    mutationFn: (id: string) => api(`${base}/deleteCountdown`, { method: 'POST', json: { id } }),
    onSuccess: () => {
      invalidate();
      toast({ title: '已删除（可在设置中恢复）', variant: 'info' });
    },
    onError: fail,
  });

  const togglePin = useMutation({
    mutationFn: (item: CountdownItem) =>
      api(`${base}/updateCountdown`, {
        method: 'POST',
        json: { id: item.id, pinned: !item.pinned },
      }),
    onSuccess: invalidate,
    onError: fail,
  });

  // 首次使用且未设置城市：自动弹设置抽屉引导（含"定位我"）
  const cityMissing = snapshot.data?.city === undefined ? false : snapshot.data.city === null;
  useEffect(() => {
    if (cityMissing && canWrite) setSettingsOpen(true);
  }, [cityMissing, canWrite]);

  const data = snapshot.data;
  const enabledSources = data ? Object.entries(data.hot) : [];
  const weather = data?.weather;

  return (
    // 负 margin 用于抵消外壳 padding 让壁纸贴边；全屏态外壳无 padding，负 margin 会反而撑出横向滚动
    <div
      className={
        chromeHidden
          ? 'relative overflow-hidden'
          : 'relative -mx-4 -my-4 overflow-hidden md:-mx-8 md:-my-8'
      }
    >
      <ScreenBackground
        wallpaperUrl={
          data && data.options.wallpaper && data.wallpaper.payload?.url
            ? data.wallpaper.payload.url
            : undefined
        }
        copyright={data?.wallpaper.payload?.copyright}
      />

      <div className="relative mx-auto w-full max-w-7xl space-y-5 p-4 md:p-8">
        {/* 顶栏：标题与操作 */}
        <header className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted">
            <HealthDot status={snapshot.isError ? 'error' : 'fresh'} />
            个人大屏
          </h1>
          {canWrite ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                刷新
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
                设置
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChromeHidden(!chromeHidden)}>
                {chromeHidden ? '退出全屏' : '全屏'}
              </Button>
            </div>
          ) : null}
        </header>

        {snapshot.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full rounded-md" />
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-56 rounded-md lg:col-span-2" />
              <Skeleton className="h-56 rounded-md" />
            </div>
          </div>
        ) : snapshot.isError ? (
          <div className="glass rounded-md p-8 text-center" role="alert">
            <p className="text-sm font-semibold">大屏加载失败</p>
            <p className="mt-1 text-xs text-muted">
              {snapshot.error instanceof Error ? snapshot.error.message : '请确认模块已启用后重试'}
            </p>
            <Button size="sm" className="mt-4" onClick={() => void snapshot.refetch()}>
              重试
            </Button>
          </div>
        ) : data ? (
          <>
            {/* 城市引导（guest 看到只读提示） */}
            {cityMissing ? (
              <div className="glass rounded-md p-4 text-sm" role="status">
                {canWrite
                  ? '选择天气城市后即可看到天气卡片——点击右上角「设置」用定位或搜索选择。'
                  : '天气未配置，请联系工作空间管理员在设置中选择城市。'}
              </div>
            ) : null}

            {/* 滚动头条 */}
            <div className="glass rounded-md px-4 py-2.5">
              <Ticker sources={data.hot} />
            </div>

            {/* 时钟 + 天气 */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="glass rounded-md p-6 lg:col-span-2">
                <ClockCard displayName={user?.displayName} />
              </div>
              {/* min-w-0：grid 子项默认 min-width:auto，会被逐小时横滚内容撑破视口（移动端实测） */}
              <div className="min-w-0">
                {weather && weather.status !== 'empty' ? (
                  <WeatherCard envelope={weather} cityName={data.city?.name} />
                ) : (
                  <div className="glass flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-md p-4 text-center">
                    <WeatherIcon icon="cloud" className="size-10 text-muted" />
                    <p className="text-xs text-muted">
                      {cityMissing ? '天气待配置' : '天气暂不可用'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* AI 每日摘要（服务端按天缓存） */}
            <SummaryCard envelope={data.summary} />

            {/* 成长打卡热力图（事件订阅累积） */}
            <ActivityCard stats={data.activity} />

            {/* 一言 */}
            {data.quote.payload ? <QuoteCard envelope={data.quote} /> : null}

            {/* 倒计时 */}
            <CountdownSection
              items={data.countdowns}
              handlers={{
                canWrite,
                create: (input) => createCountdown.mutate(input),
                remove: (id) => deleteCountdown.mutate(id),
                togglePin: (item) => togglePin.mutate(item),
                creating: createCountdown.isPending,
              }}
            />

            {/* 热榜 */}
            {enabledSources.length > 0 ? (
              <section aria-label="热榜" className="space-y-3">
                <h2 className="text-xs font-semibold tracking-widest text-muted">实时热榜</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {enabledSources.map(([key, envelope]) => (
                    <HotlistCard
                      key={key}
                      label={HOT_SOURCE_LABELS[key] ?? key}
                      envelope={envelope}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      {canWrite ? (
        <SettingsDrawer
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          workspaceSlug={workspaceSlug}
          moduleName={moduleName}
          city={data?.city ?? null}
          sources={data?.options.sources ?? {}}
          wallpaper={data?.options.wallpaper ?? true}
          onAfterChange={invalidate}
        />
      ) : null}
    </div>
  );
}
