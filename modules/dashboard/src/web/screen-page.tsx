'use client';

import { useRouter } from 'next/navigation';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  ThemeToggle,
  useToast,
} from '@atlas/ui';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useEnabledModules } from '@/lib/queries';
import { useUiStore } from '@/lib/store';
import { ActivityCard } from './activity-card';
import { ClockCard, TimeOrbit } from './clock-card';
import { CountdownSection } from './countdown-card';
import { AtlasMark, HealthDot, ScreenIcon, WeatherIcon } from './icons';
import { HotlistCard } from './hotlist-card';
import { ListeningMiniCard } from './listening-mini-card';
import { useLaterReading, LaterReadingPanel } from './later-reading';
import { NotificationBell } from './notification-bell';
import { QuoteCard } from './quote-card';
import { AssistantBubble } from './assistant-bubble';
import { ScreenHeadline } from './screen-headline';
import { ShortcutHelp } from './shortcut-help';
import { SummaryCard } from './summary-card';
import { Ticker } from './ticker';
import { WeatherCard } from './weather-card';
import { WeatherAtmosphere } from './weather-atmosphere';
import { ANTI_BURN_IN_KEY, NIGHT_MODE_KEY, useAntiBurnIn, useNightMode } from './screen-ambient';
import { useScrollActive } from './use-scroll-active';
import { HOT_SOURCE_LABELS, type DashboardSnapshot, type CountdownItem } from './types';

/** 每台设备独立记住挂墙模式：同一账号在墙面屏和笔记本上可有不同取舍。 */
const LOW_POWER_KEY = 'atlas.dashboard.low-power';

const SettingsDrawer = lazy(() =>
  import('./settings-drawer').then((module) => ({ default: module.SettingsDrawer })),
);

/**
 * 天气氛围动效（雨雪/云/雾/雷闪）默认关闭：
 * 这些图层会随天气持续合成并大面积重绘，在集显或远程投屏上是大屏卡顿的主要来源。
 * 组件与样式都保留，需要恢复时把这里改成 true 即可（低功耗模式仍会二次拦截）。
 */
const WEATHER_ATMOSPHERE_ENABLED = false;

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
      className="group/metric rounded-sm border-l border-border py-0.5 pl-4 text-left transition-colors first:border-l-0 first:pl-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 max-sm:border-l-0 max-sm:pl-0"
    >
      <span
        className={`block font-mono text-[20px] font-medium tracking-tight tabular-nums sm:text-[26px] ${accent ? 'text-primary' : ''}`}
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
      className="screen-card screen-reveal p-4 md:p-5 xl:col-span-4"
      style={{ '--screen-index': 1 } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ClockCard displayName={displayName} />
        </div>
        <TimeOrbit />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-y-3 border-t border-border pt-2">{metrics}</div>
    </section>
  );
}

/**
 * 延伸功能入口（产品定位：大屏主导，小功能从大屏延出）：
 * 列出本工作空间其他已启用模块的页面 + 听歌统计 + 通知/设置。
 */
function ModuleLauncher({
  workspaceSlug,
  currentModule,
}: {
  workspaceSlug: string;
  currentModule: string;
}) {
  const modules = useEnabledModules(workspaceSlug);
  const others = (modules.data ?? []).filter((mod) => mod.name !== currentModule);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="screen-icon-button" aria-label="延伸功能" title="延伸功能">
          <ScreenIcon name="grid" className="size-3.5" />
          <span className="hidden sm:inline">功能</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>延伸功能</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/assistant">✦ AI 助手</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/m/${currentModule}/listening`}>🎵 听歌统计</Link>
        </DropdownMenuItem>
        {others.map((mod) =>
          mod.routes.map((route) => (
            <DropdownMenuItem key={`${mod.name}/${route.path}`} asChild>
              <Link href={`/m/${mod.name}/${route.path}`}>{route.title}</Link>
            </DropdownMenuItem>
          )),
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications">通知</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">设置</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [settingsDrawerMounted, setSettingsDrawerMounted] = useState(false);
  const openSettings = useCallback(() => {
    setSettingsDrawerMounted(true);
    setSettingsOpen(true);
  }, []);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // 专注模式：工作时段只留时钟/天气/待办/倒计时，热榜与回顾类收起（设备级偏好）
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    try {
      setFocusMode(window.localStorage.getItem('atlas.screen.focus') === '1');
    } catch {
      // 隐私模式忽略
    }
  }, []);
  const toggleFocusMode = () => {
    setFocusMode((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem('atlas.screen.focus', next ? '1' : '0');
      } catch {
        // 忽略
      }
      return next;
    });
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  // 护屏偏好默认开启：挂墙场景下用户往往不会主动去找开关，宁可有微小位移也不烧屏
  const [antiBurnIn, setAntiBurnIn] = useState(true);
  const [nightAuto, setNightAuto] = useState(true);
  const night = useNightMode(nightAuto);
  const shiftRef = useAntiBurnIn(antiBurnIn);
  const scrolling = useScrollActive();
  const router = useRouter();
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
      setAntiBurnIn(window.localStorage.getItem(ANTI_BURN_IN_KEY) !== '0');
      setNightAuto(window.localStorage.getItem(NIGHT_MODE_KEY) !== '0');
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
    // 热榜时效性强，5 分钟一轮；AI 小结按天缓存，不受频率影响
    refetchInterval: 5 * 60_000,
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
    mutationFn: (sources?: string[]) =>
      api(`${base}/refresh`, { method: 'POST', json: sources ? { sources } : {} }),
    onSuccess: () => {
      invalidate();
      toast({ title: '已刷新全部数据源', variant: 'ok' });
    },
    onError: fail,
  });

  const updateCountdown = useMutation({
    mutationFn: (input: {
      id: string;
      title?: string;
      targetDate?: string;
      pinned?: boolean;
      lunar?: boolean;
      lunarMonth?: number;
      lunarDay?: number;
      repeatYearly?: boolean;
    }) => api(`${base}/updateCountdown`, { method: 'POST', json: input }),
    onSuccess: () => {
      invalidate();
    },
  });

  const createCountdown = useMutation({
    // title 实际必填（后端 schema 校验）；handler 的 create 输入类型与 update 共用，故此处放宽
    mutationFn: (input: {
      title?: string;
      targetDate?: string;
      pinned?: boolean;
      lunar?: boolean;
      lunarMonth?: number;
      lunarDay?: number;
      repeatYearly?: boolean;
    }) => api(`${base}/createCountdown`, { method: 'POST', json: input }),
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
    if (cityMissing && canWrite) openSettings();
  }, [cityMissing, canWrite, openSettings]);

  // 待办剩余：聚合视图直接调 todo_notes 的公开接口（模块未启用/无权限时静默回退）
  const todoOpenQuery = useQuery({
    queryKey: ['todo-open', workspaceSlug],
    queryFn: () =>
      api<{ todos: Array<{ id: string }> }>(
        `/modules/workspaces/${workspaceSlug}/todo_notes/call/list`,
        { method: 'POST', json: { status: 'open' } },
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const todoOpenCount = todoOpenQuery.data?.todos.length ?? null;
  // 稍后读：热榜条目的设备级收藏
  const later = useLaterReading(HOT_SOURCE_LABELS);

  const data = snapshot.data;
  const enabledSources = useMemo(() => (data ? Object.entries(data.hot) : []), [data?.hot]);
  const watchWords = data?.options.watchWords ?? [];
  const watchHits = useMemo(() => {
    if (watchWords.length === 0) return 0;
    const normalizedWords = watchWords.map((word) => word.toLowerCase());
    return enabledSources.reduce((sum, [, envelope]) => {
      const items = envelope.payload ?? [];
      return (
        sum +
        items.filter((item) => {
          const title = item.title.toLowerCase();
          return normalizedWords.some((word) => title.includes(word));
        }).length
      );
    }, 0);
  }, [watchWords, enabledSources]);
  // 无任何热榜数据时不渲染空的热搜条
  const hasTicker = enabledSources.some(([, envelope]) => (envelope.payload?.length ?? 0) > 0);
  const weather = data?.weather;
  const immersive = isFullscreen || chromeHidden;

  // 顶栏副标轮播：AI 小结只在真实供应商下展示，Mock 文案不上大屏
  const summaryText = data?.summary.payload?.text ?? '';
  const summaryHeadline =
    summaryText.length > 0 && !summaryText.startsWith('[MockAI]')
      ? (summaryText.split(/[。！？\n]/)[0] ?? '').trim()
      : '';
  const headlineItems = [
    `Atlas command center · ${workspace?.name ?? workspaceSlug}`,
    ...(summaryHeadline ? [`今日小结 · ${summaryHeadline}`] : []),
    ...(data
      ? [`连续打卡 ${data.activity.streak} 天 · 今日完成 ${data.activity.todayCount} 件`]
      : []),
    ...(weather?.payload
      ? [
          `${data?.city?.name ?? '当地'} ${weather.payload.now.text} ${Math.round(weather.payload.now.temperature)}°C`,
        ]
      : []),
  ];

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

  /** 护屏开关只落本机：同一账号在墙面屏与笔记本上应各自决定 */
  const toggleAntiBurnIn = () => {
    setAntiBurnIn((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem(ANTI_BURN_IN_KEY, next ? '1' : '0');
      } catch {
        // 同上：写不进去不影响本次切换
      }
      return next;
    });
  };

  const toggleNightAuto = () => {
    setNightAuto((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem(NIGHT_MODE_KEY, next ? '1' : '0');
      } catch {
        // 同上
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

  /**
   * 键盘快捷键：handler 存 ref，事件只绑一次——否则每次渲染都会解绑重绑，
   * 且依赖一堆 useMutation 对象容易漏依赖。
   */
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  shortcutRef.current = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    } else if (key === 'l') {
      event.preventDefault();
      toggleLowPowerMode();
    } else if (key === 'r') {
      event.preventDefault();
      if (!refresh.isPending) refresh.mutate();
    } else if (key === 'c') {
      event.preventDefault();
      toggleFocusMode();
    } else if (key === 'a') {
      event.preventDefault();
      void router.push('/assistant');
    } else if (key === 's') {
      if (!canWrite) return;
      event.preventDefault();
      openSettings();
    } else if (event.key === '?') {
      event.preventDefault();
      setShortcutsOpen((open) => !open);
    }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => shortcutRef.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={shiftRef}
      className="dashboard-screen relative min-h-screen overflow-hidden bg-bg text-text"
      data-scrolling={scrolling || undefined}
      data-low-power={lowPowerMode || undefined}
      data-night={night || undefined}
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
      {WEATHER_ATMOSPHERE_ENABLED && !lowPowerMode && weather?.payload ? (
        <WeatherAtmosphere icon={weather.payload.now.icon} isDay={weather.payload.now.isDay} />
      ) : null}

      <div
        className={`screen-shift relative z-10 mx-auto w-full space-y-4 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-5 md:pb-[calc(6rem+env(safe-area-inset-bottom))] xl:p-6 xl:pb-[calc(6rem+env(safe-area-inset-bottom))] ${immersive ? 'max-w-[1920px]' : 'max-w-[1728px]'}`}
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
              <ScreenHeadline items={headlineItems} />
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
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending || snapshot.isFetching}
              className="mr-1 hidden items-center gap-2 rounded-full px-2 py-1 text-[11px] tracking-wider text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-progress md:flex"
              title="点击刷新全部数据源（R）"
              aria-label="刷新全部数据源"
            >
              <HealthDot status={snapshot.isError ? 'error' : 'fresh'} />
              {snapshot.isFetching || refresh.isPending
                ? '正在同步'
                : snapshot.dataUpdatedAt > 0
                  ? `同步 ${new Date(snapshot.dataUpdatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
                  : '数据在线'}
            </button>
            <ModuleLauncher workspaceSlug={workspaceSlug} currentModule={moduleName} />
            <NotificationBell />
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={toggleFocusMode}
              aria-pressed={focusMode}
              className={`screen-icon-button ${focusMode ? '!border-primary/40 !text-primary' : ''}`}
              aria-label="专注模式"
              title="专注模式（C）：隐藏热榜与回顾，只留时钟/天气/待办/倒计时"
            >
              <ScreenIcon name="focus" className="size-3.5" />
              <span className="hidden sm:inline">专注</span>
            </button>
            <button
              type="button"
              className={`screen-icon-button hidden md:inline-flex ${lowPowerMode ? '!border-primary/40 !text-primary' : ''}`}
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
                <button type="button" className="screen-icon-button" onClick={openSettings}>
                  <ScreenIcon name="settings" className="size-3.5" />
                  <span className="hidden sm:inline">设置</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="screen-icon-button hidden sm:inline-flex"
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
                className="screen-reveal min-w-0 xl:col-span-4"
                style={{ '--screen-index': 2 } as React.CSSProperties}
              >
                <div className="screen-card flex h-full min-h-64 items-center justify-center p-6">
                  <Skeleton className="h-full w-full rounded-sm" />
                </div>
              </div>
              <div
                className="screen-reveal min-w-0 xl:col-span-4"
                style={{ '--screen-index': 3 } as React.CSSProperties}
              >
                <div className="screen-card flex h-full min-h-64 items-center justify-center p-6">
                  <Skeleton className="h-full w-full rounded-sm" />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
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
                      label="连续打卡"
                      onClick={() => scrollToSection('activity-section')}
                    />
                    {todoOpenCount !== null ? (
                      <HeroMetric
                        value={todoOpenCount}
                        label="待办"
                        onClick={() => void router.push('/m/todo_notes/list')}
                        accent={todoOpenCount > 0}
                      />
                    ) : (
                      <HeroMetric
                        value={enabledSources.length}
                        label="热榜源"
                        onClick={() => scrollToSection('hotlist-section')}
                      />
                    )}
                    {(() => {
                      // 「期待」显示最近一个未来纪念日的剩余天数（比数量更有盼头）；
                      // 没有未来的就退回数量
                      const today = new Date();
                      const nextDays = data.countdowns
                        .map((item) => {
                          const target = new Date(`${item.targetDate}T00:00:00`);
                          if (Number.isNaN(target.getTime())) return null;
                          const start = new Date(
                            today.getFullYear(),
                            today.getMonth(),
                            today.getDate(),
                          );
                          return Math.round((target.getTime() - start.getTime()) / 86_400_000);
                        })
                        .filter((days): days is number => days !== null && days >= 0)
                        .sort((a, b) => a - b)[0];
                      return (
                        <HeroMetric
                          value={nextDays ?? data.countdowns.length}
                          label="期待"
                          onClick={() => scrollToSection('countdown-section')}
                        />
                      );
                    })()}
                  </>
                }
              />
              <div
                className="screen-reveal min-w-0 xl:col-span-4"
                style={{ '--screen-index': 2 } as React.CSSProperties}
              >
                {weather && weather.status !== 'empty' ? (
                  <WeatherCard envelope={weather} cityName={data.city?.name} compact />
                ) : (
                  <div className="screen-card flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                    <WeatherIcon icon="cloud" className="size-10 text-muted" />
                    <p className="text-xs text-muted">
                      {cityMissing ? '天气待配置' : '天气暂不可用'}
                    </p>
                  </div>
                )}
              </div>
              <div
                className="screen-reveal min-w-0 xl:col-span-4"
                style={{ '--screen-index': 3 } as React.CSSProperties}
              >
                <ListeningMiniCard base={base} />
              </div>
            </div>

            {/* 实时热榜：紧跟时间/天气，五源横向铺满，放在听歌之后；专注模式下隐藏 */}
            {enabledSources.length > 0 && !focusMode ? (
              <section id="hotlist-section" aria-label="热榜" className="scroll-mt-6 space-y-2">
                <div
                  className="screen-reveal relative z-30 flex items-end justify-between px-1"
                  style={{ '--screen-index': 3 } as React.CSSProperties}
                >
                  {/* z-30：入场动画创建 stacking context，不提升的话后面的卡片会盖住浮层面板 */}
                  <div className="flex items-baseline gap-3">
                    <div className="flex items-center gap-2">
                      <ScreenIcon name="layers" className="size-4 text-primary" />
                      <h2 className="text-sm font-semibold">实时热榜</h2>
                    </div>
                    <p className="screen-label !text-[10px]">Real-time pulse</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] tracking-wider text-muted">
                      {String(enabledSources.length).padStart(2, '0')} SOURCES
                    </span>
                    {watchHits > 0 ? (
                      <span
                        className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary"
                        title={`关注词：${watchWords.join('、')}`}
                      >
                        关注 {watchHits}
                      </span>
                    ) : null}
                    <LaterReadingPanel
                      items={later.items}
                      onRemove={later.remove}
                      onPin={later.pin}
                      labelOf={later.labelOf}
                    />
                  </div>
                </div>
                {/* 宽屏固定五列单行；窄屏自动降列。每条源只取前 4 条，保证一屏可读完 */}
                <div className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {enabledSources.map(([key, envelope], index) => (
                    <HotlistCard
                      key={key}
                      sourceKey={key}
                      index={index}
                      label={HOT_SOURCE_LABELS[key] ?? key}
                      envelope={envelope}
                      limit={6}
                      watchWords={watchWords}
                      onLater={later.add}
                      hasLater={later.has}
                      onAddLater={later.add}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {/* 每日小结 + 打卡 + 一言：第二屏，长期停留时向下浏览；专注模式下隐藏 */}
            {!focusMode ? (
              <section
                id="overview-section"
                aria-label="今日节奏"
                className="grid items-stretch gap-4 xl:grid-cols-12"
              >
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-7">
                  <SummaryCard
                    envelope={data.summary}
                    regenerating={refresh.isPending}
                    onRegenerate={() => refresh.mutate(['summary'])}
                  />
                  {data.quote.payload ? <QuoteCard envelope={data.quote} /> : null}
                </div>
                <div id="activity-section" className="min-w-0 scroll-mt-6 xl:col-span-5">
                  <ActivityCard stats={data.activity} />
                </div>
              </section>
            ) : null}

            {/* 滚动信号流：从首屏移到下方，首屏优先给时钟/天气/热榜/听歌；专注模式下隐藏 */}
            {hasTicker && !focusMode ? (
              <div
                className="screen-card screen-reveal flex items-center gap-4 px-4 py-3"
                style={{ '--screen-index': 4 } as React.CSSProperties}
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

            {/* 倒计时 */}
            <div id="countdown-section" className="scroll-mt-6">
              <CountdownSection
                items={data.countdowns}
                handlers={{
                  canWrite,
                  create: (input) => createCountdown.mutate(input),
                  update: (input) => updateCountdown.mutate(input),
                  remove: (id) => deleteCountdown.mutate(id),
                  togglePin: (item) => togglePin.mutate(item),
                  creating: createCountdown.isPending,
                  updating: updateCountdown.isPending,
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

      {/* 夜间压暗覆盖层：叠在内容之上（不拦截点击），比给整棵树加 filter 便宜 */}
      {night ? <div className="screen-night" aria-hidden /> : null}

      {/* AI 快聊：固定在播放器上方，滚动时不随内容移动 */}
      <div className="absolute right-5 bottom-24 z-30 flex flex-col items-end">
        <AssistantBubble />
      </div>

      <ShortcutHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {canWrite && settingsDrawerMounted ? (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-[var(--z-overlay)] flex justify-end bg-text/20"
              role="status"
              aria-label="正在加载大屏设置"
              aria-busy="true"
            >
              <div className="h-full w-[min(100vw,420px)] space-y-6 bg-surface p-6 shadow-lg">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          }
        >
          <SettingsDrawer
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            workspaceSlug={workspaceSlug}
            moduleName={moduleName}
            city={data?.city ?? null}
            sources={data?.options.sources ?? {}}
            wallpaper={data?.options.wallpaper ?? true}
            watchWords={data?.options.watchWords ?? []}
            antiBurnIn={antiBurnIn}
            nightAuto={nightAuto}
            onToggleAntiBurnIn={toggleAntiBurnIn}
            onToggleNightAuto={toggleNightAuto}
            onAfterChange={invalidate}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
