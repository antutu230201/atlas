'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Skeleton, ThemeToggle, useToast } from '@atlas/ui';
import { api } from '@/lib/api';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useUiStore } from '@/lib/store';
import { ActivityCard } from './activity-card';
import { ClockCard, TimeOrbit } from './clock-card';
import { CountdownSection } from './countdown-card';
import { AtlasMark, HealthDot, ScreenIcon, WeatherIcon } from './icons';
import { HotlistCard } from './hotlist-card';
import { QuoteCard } from './quote-card';
import { SettingsDrawer } from './settings-drawer';
import { SummaryCard } from './summary-card';
import { Ticker } from './ticker';
import { WeatherCard } from './weather-card';
import { WeatherAtmosphere } from './weather-atmosphere';
import { FloatingMusicPlayer } from './floating-music-player';
import { HOT_SOURCE_LABELS, type DashboardSnapshot, type CountdownItem } from './types';

/** 每台设备独立记住挂墙模式：同一账号在墙面屏和笔记本上可有不同取舍。 */
const LOW_POWER_KEY = 'atlas.dashboard.low-power';

/** 氛围背景：必应壁纸（可关，onError 自动降级）→ 极光渐变兜底；视觉值全部来自 tokens */
function ScreenBackground({
  wallpaperUrl,
  copyright,
  enabled = true,
}: {
  wallpaperUrl?: string;
  copyright?: string;
  enabled?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = wallpaperUrl !== undefined && wallpaperUrl.length > 0 && !imageFailed;
  // 低功耗模式不挂载壁纸与极光层，既省 GPU 合成也避免继续下载每日壁纸。
  if (!enabled) return <div aria-hidden className="pointer-events-none absolute inset-0 bg-bg" />;
  return (
    /* absolute（而非 fixed）：限制在大屏区域内，避免盖住 app 外壳的左侧导航 */
    <div
      aria-hidden
      className="screen-backdrop pointer-events-none absolute inset-0 overflow-hidden bg-bg"
    >
      {showImage ? (
        <>
          {/* 外部每日壁纸直接用 img：域名每日变化，Next Image 域名白名单不可预知 */}
          <img
            src={wallpaperUrl}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full scale-105 object-cover opacity-[var(--screen-wallpaper-opacity)]"
            onError={() => setImageFailed(true)}
          />
          {copyright ? (
            <span className="absolute right-3 bottom-2 z-10 text-[11px] text-muted/60">
              {copyright}
            </span>
          ) : null}
        </>
      ) : null}
      <div className="screen-sky" />
      <div className="screen-grid absolute inset-0" />
      <div className="absolute inset-0" style={{ background: 'var(--screen-scrim)' }} />
    </div>
  );
}

/** 滚动中置 true、停止约 350ms 后复位：驱动 data-scrolling 移除装饰动画（globals.css）。
    同时监听 wheel——滚到边界后同位置滚动不再触发 scroll，若只听 scroll 状态会闪烁，
    每次闪烁都要销毁/重建动画合成层，比动画本身更贵。setState 相同值跳过渲染，
    因此滚动过程只在开始/结束各渲染一次。 */
function useScrollActive() {
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    let timer = 0;
    const onActive = () => {
      setScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScrolling(false), 350);
    };
    window.addEventListener('scroll', onActive, { passive: true });
    window.addEventListener('wheel', onActive, { passive: true });
    return () => {
      window.removeEventListener('scroll', onActive);
      window.removeEventListener('wheel', onActive);
      window.clearTimeout(timer);
    };
  }, []);
  return scrolling;
}

function HeroMetric({
  value,
  label,
  onClick,
  accent = false,
}: {
  value: number;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/metric rounded-sm border-l border-border py-1 pl-4 text-left transition-colors first:border-l-0 first:pl-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 max-sm:border-l-0 max-sm:pl-0"
    >
      <span
        className={`block font-mono text-3xl font-medium tracking-tight tabular-nums ${accent ? 'text-primary' : ''}`}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted transition-colors group-hover/metric:text-text">
        {label}
        <ScreenIcon
          name="arrow"
          className="size-3 opacity-0 transition-opacity group-hover/metric:opacity-100"
        />
      </span>
    </button>
  );
}

/** 时间核心卡：时钟与轨道是纯客户端渲染、不依赖 snapshot——加载中也即时显示，指标行由调用方给（数据或骨架） */
function HeroClockCard({
  displayName,
  metrics,
}: {
  displayName?: string;
  metrics: React.ReactNode;
}) {
  return (
    <section
      className="screen-card screen-reveal p-6 md:p-7 xl:col-span-7"
      style={{ '--screen-index': 1 } as React.CSSProperties}
    >
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <ClockCard displayName={displayName} />
        </div>
        <TimeOrbit />
      </div>
      <div className="mt-7 grid grid-cols-2 gap-y-5 border-t border-border pt-5 sm:grid-cols-4">
        {metrics}
      </div>
    </section>
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const scrolling = useScrollActive();
  const chromeHidden = useUiStore((state) => state.chromeHidden);
  const setChromeHidden = useUiStore((state) => state.setChromeHidden);
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;

  // 浏览器全屏与外壳沉浸态同步；Esc 退出时也由 fullscreenchange 恢复侧栏
  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement !== null;
      setIsFullscreen(active);
      setChromeHidden(active);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, [setChromeHidden]);

  // 读本地偏好放在挂载后：SSR 默认高画质，避免服务端与客户端首帧 hydration 不一致。
  useEffect(() => {
    try {
      setLowPowerMode(window.localStorage.getItem(LOW_POWER_KEY) === '1');
    } catch {
      // 隐私模式下 localStorage 可能不可用，保持默认高画质即可。
    }
  }, []);

  // 离开大屏时同时复位外壳与浏览器全屏，避免其他页面仍处于沉浸状态
  useEffect(
    () => () => {
      setChromeHidden(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    },
    [setChromeHidden],
  );

  const snapshot = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'snapshot'],
    queryFn: () => api<DashboardSnapshot>(`${base}/snapshot`, { method: 'POST', json: {} }),
    refetchInterval: 10 * 60_000,
    // 窗口失焦回来不重复闪加载；10 分钟轮询 + 手动刷新仍在
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
  // 无任何热榜数据时不渲染空的热搜条
  const hasTicker = enabledSources.some(([, envelope]) => (envelope.payload?.length ?? 0) > 0);
  const weather = data?.weather;
  const immersive = isFullscreen || chromeHidden;

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (chromeHidden) {
      setChromeHidden(false);
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // 浏览器拒绝 Fullscreen API 时仍保留页内沉浸模式，并明确提示不是真全屏
      setChromeHidden(true);
      toast({
        title: '已切换为沉浸模式',
        description: '浏览器未允许网页全屏，可按 F11 隐藏地址栏。',
        variant: 'info',
      });
    }
  };

  const toggleLowPowerMode = () => {
    setLowPowerMode((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem(LOW_POWER_KEY, next ? '1' : '0');
      } catch {
        // 偏好写不进去只影响下次打开，当前切换仍然生效。
      }
      return next;
    });
  };

  const scrollToSection = (id: string) => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <div
      className="dashboard-screen relative min-h-screen overflow-hidden bg-bg text-text"
      data-scrolling={scrolling || undefined}
      data-low-power={lowPowerMode || undefined}
    >
      <ScreenBackground
        enabled={!lowPowerMode}
        wallpaperUrl={
          data && data.options.wallpaper && data.wallpaper.payload?.url
            ? data.wallpaper.payload.url
            : undefined
        }
        copyright={data?.wallpaper.payload?.copyright}
      />
      {!lowPowerMode && weather?.payload ? (
        <WeatherAtmosphere icon={weather.payload.now.icon} isDay={weather.payload.now.isDay} />
      ) : null}

      <div
        className={`relative z-10 mx-auto w-full space-y-4 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-5 md:pb-[calc(6rem+env(safe-area-inset-bottom))] xl:p-6 xl:pb-[calc(6rem+env(safe-area-inset-bottom))] ${immersive ? 'max-w-[1920px]' : 'max-w-[1728px]'}`}
      >
        <header className="screen-card screen-reveal flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <AtlasMark className="size-9 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-semibold tracking-[0.12em]">个人大屏</h1>
                <span className="hidden rounded-xs border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-muted sm:inline">
                  PERSONAL OS
                </span>
              </div>
              <p className="screen-label mt-0.5 truncate !text-[11px]">
                Atlas command center · {workspace?.name ?? workspaceSlug}
              </p>
            </div>
          </div>

          <nav
            className="hidden items-center gap-1 rounded-full border border-border bg-surface/50 p-1 2xl:flex"
            aria-label="大屏区块导航"
          >
            {[
              { id: 'overview-section', label: '今日节奏' },
              { id: 'hotlist-section', label: '实时热榜' },
              { id: 'countdown-section', label: '纪念日' },
            ].map((section) => (
              <button
                key={section.id}
                type="button"
                className="rounded-full px-3 py-1.5 text-[11px] text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => scrollToSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 hidden items-center gap-2 px-2 text-[11px] tracking-wider text-muted md:flex">
              <HealthDot status={snapshot.isError ? 'error' : 'fresh'} />
              {snapshot.isFetching
                ? '正在同步'
                : snapshot.dataUpdatedAt > 0
                  ? `同步 ${new Date(snapshot.dataUpdatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
                  : '数据在线'}
            </div>
            <ThemeToggle />
            <button
              type="button"
              className={`screen-icon-button ${lowPowerMode ? '!border-primary/40 !text-primary' : ''}`}
              onClick={toggleLowPowerMode}
              aria-pressed={lowPowerMode}
              aria-label="低功耗模式"
              title={
                lowPowerMode
                  ? '低功耗模式已开启：已关闭壁纸和氛围动画'
                  : '低功耗模式：关闭壁纸和氛围动画，保留音乐与时钟'
              }
            >
              <ScreenIcon name="power" className="size-3.5" />
              <span className="hidden sm:inline">{lowPowerMode ? '省电中' : '低功耗'}</span>
            </button>
            {canWrite ? (
              <>
                <button
                  type="button"
                  className="screen-icon-button"
                  disabled={refresh.isPending}
                  onClick={() => refresh.mutate()}
                >
                  <ScreenIcon
                    name="refresh"
                    className={`size-3.5 ${refresh.isPending ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden sm:inline">刷新</span>
                </button>
                <button
                  type="button"
                  className="screen-icon-button"
                  onClick={() => setSettingsOpen(true)}
                >
                  <ScreenIcon name="settings" className="size-3.5" />
                  <span className="hidden sm:inline">设置</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="screen-icon-button"
              onClick={() => void toggleFullscreen()}
              title={isFullscreen ? '退出浏览器全屏（Esc）' : '进入浏览器全屏'}
              aria-label={immersive ? (isFullscreen ? '退出全屏' : '退出沉浸') : '全屏'}
            >
              <ScreenIcon name={immersive ? 'collapse' : 'fullscreen'} className="size-3.5" />
              <span className="hidden sm:inline">
                {immersive ? (isFullscreen ? '退出全屏' : '退出沉浸') : '全屏'}
              </span>
            </button>
          </div>
        </header>

        {snapshot.isPending ? (
          <div className="space-y-4">
            {/* 时钟不依赖 snapshot：加载中也即时可见，指标行与天气/热榜先给骨架 */}
            <div className="grid gap-4 xl:grid-cols-12">
              <HeroClockCard
                displayName={user?.displayName}
                metrics={
                  <>
                    {[0, 1, 2, 3].map((index) => (
                      <Skeleton key={index} className="h-14 rounded-sm" />
                    ))}
                  </>
                }
              />
              <div
                className="screen-reveal min-w-0 xl:col-span-5"
                style={{ '--screen-index': 2 } as React.CSSProperties}
              >
                <div className="screen-card flex h-full min-h-64 items-center justify-center p-6">
                  <Skeleton className="h-full w-full rounded-sm" />
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-80 rounded-md" />
              ))}
            </div>
          </div>
        ) : snapshot.isError ? (
          <div className="screen-card mx-auto max-w-xl p-10 text-center" role="alert">
            <AtlasMark className="mx-auto mb-5 size-12 text-err" />
            <p className="text-base font-semibold">大屏加载失败</p>
            <p className="mt-2 text-xs text-muted">
              {snapshot.error instanceof Error ? snapshot.error.message : '请确认模块已启用后重试'}
            </p>
            <Button size="sm" className="mt-5" onClick={() => void snapshot.refetch()}>
              重试
            </Button>
          </div>
        ) : data ? (
          <>
            {/* 城市引导（guest 看到只读提示） */}
            {cityMissing ? (
              <div
                className="screen-card screen-reveal flex items-center gap-3 p-4 text-xs text-muted"
                role="status"
              >
                <WeatherIcon icon="cloud" className="size-5 shrink-0 text-warn" />
                {canWrite
                  ? '选择天气城市后即可看到天气卡片——点击右上角「设置」用定位或搜索选择。'
                  : '天气未配置，请联系工作空间管理员在设置中选择城市。'}
              </div>
            ) : null}

            {/* 滚动信号流 */}
            {hasTicker ? (
              <div
                className="screen-card screen-reveal flex items-center gap-4 px-4 py-3"
                style={{ '--screen-index': 1 } as React.CSSProperties}
              >
                <div className="hidden shrink-0 items-center gap-2 border-r border-border pr-4 text-info md:flex">
                  <ScreenIcon name="signal" className="size-3.5" />
                  <span className="screen-label !text-[10px] !text-info">Signal feed</span>
                </div>
                <div className="min-w-0 flex-1">
                  <Ticker sources={data.hot} />
                </div>
              </div>
            ) : null}

            {/* 时间核心 + 天气 */}
            <div className="grid gap-4 xl:grid-cols-12">
              <HeroClockCard
                displayName={user?.displayName}
                metrics={
                  <>
                    <HeroMetric
                      value={data.activity.todayCount}
                      label="今日完成"
                      onClick={() => scrollToSection('activity-section')}
                      accent
                    />
                    <HeroMetric
                      value={data.activity.streak}
                      label="连续打卡 · 天"
                      onClick={() => scrollToSection('activity-section')}
                    />
                    <HeroMetric
                      value={enabledSources.length}
                      label="实时热榜源"
                      onClick={() => scrollToSection('hotlist-section')}
                    />
                    <HeroMetric
                      value={data.countdowns.length}
                      label="期待中的日子"
                      onClick={() => scrollToSection('countdown-section')}
                    />
                  </>
                }
              />
              <div
                className="screen-reveal min-w-0 xl:col-span-5"
                style={{ '--screen-index': 2 } as React.CSSProperties}
              >
                {weather && weather.status !== 'empty' ? (
                  <WeatherCard envelope={weather} cityName={data.city?.name} />
                ) : (
                  <div className="screen-card flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                    <WeatherIcon icon="cloud" className="size-10 text-muted" />
                    <p className="text-xs text-muted">
                      {cityMissing ? '天气待配置' : '天气暂不可用'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 个人内容优先于外部信息：首屏先回答“我今天怎么样”，再向下浏览热榜。 */}
            <section
              id="overview-section"
              aria-label="今日节奏"
              className="grid scroll-mt-6 items-stretch gap-4 xl:grid-cols-12"
            >
              <div className="flex flex-col gap-4 xl:col-span-7">
                <SummaryCard envelope={data.summary} />
                {data.quote.payload ? <QuoteCard envelope={data.quote} /> : null}
              </div>
              <div id="activity-section" className="scroll-mt-6 xl:col-span-5">
                <ActivityCard stats={data.activity} />
              </div>
            </section>

            {/* 实时热榜：个人摘要之后，保持完整五源视野。 */}
            {enabledSources.length > 0 ? (
              <section
                id="hotlist-section"
                aria-label="热榜"
                className="scroll-mt-6 space-y-3 pt-2"
              >
                <div
                  className="screen-reveal flex items-end justify-between px-1"
                  style={{ '--screen-index': 3 } as React.CSSProperties}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <ScreenIcon name="layers" className="size-4 text-primary" />
                      <h2 className="text-sm font-semibold">实时热榜</h2>
                    </div>
                    <p className="screen-label mt-1 !text-[11px]">
                      Real-time pulse · Across the internet
                    </p>
                  </div>
                  <span className="font-mono text-[10px] tracking-wider text-muted">
                    {String(enabledSources.length).padStart(2, '0')} SOURCES
                  </span>
                </div>
                {/* 保留全屏五列；较窄容器自动降列，标题最多两行 */}
                <div className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                  {enabledSources.map(([key, envelope], index) => (
                    <HotlistCard
                      key={key}
                      sourceKey={key}
                      index={index}
                      label={HOT_SOURCE_LABELS[key] ?? key}
                      envelope={envelope}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {/* 倒计时 */}
            <div id="countdown-section" className="scroll-mt-6">
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
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-[11px] tracking-wider text-muted/60">
              <span>ATLAS PERSONAL OS · DESIGNED FOR YOUR EVERYDAY</span>
              <span className="flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-ok" /> DATA ENCRYPTED · WORKSPACE ISOLATED
              </span>
            </footer>
          </>
        ) : null}
      </div>

      <FloatingMusicPlayer base={base} />

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
