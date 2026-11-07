'use client';

export type ScreenIconName =
  | 'refresh'
  | 'settings'
  | 'fullscreen'
  | 'collapse'
  | 'sparkles'
  | 'activity'
  | 'calendar'
  | 'quote'
  | 'arrow'
  | 'plus'
  | 'pin'
  | 'trash'
  | 'signal'
  | 'check'
  | 'layers'
  | 'music'
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'volume'
  | 'mute'
  | 'playlist'
  | 'external'
  | 'power'
  | 'chevron'
  | 'lyrics'
  | 'grip'
  | 'pip'
  | 'search'
  | 'close'
  | 'repeat'
  | 'shuffle'
  | 'grid'
  | 'bell';

interface IconProps {
  className?: string;
}

export function AtlasMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="12" stroke="currentColor" strokeOpacity=".24" />
      <path d="M11 27 20 10l9 17M14.5 21h11" stroke="currentColor" strokeWidth="1.7" />
      <circle
        cx="20"
        cy="20"
        r="16"
        stroke="currentColor"
        strokeOpacity=".1"
        strokeDasharray="2 4"
      />
    </svg>
  );
}

export function ScreenIcon({ name, className }: IconProps & { name: ScreenIconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.65,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (name) {
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 6v5h-5M4 18v-5h5" />
          <path d="M6.1 8a7 7 0 0 1 11.8-1L20 11M4 13l2.1 4a7 7 0 0 0 11.8-1" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      );
    case 'fullscreen':
      return (
        <svg {...common}>
          <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
        </svg>
      );
    case 'collapse':
      return (
        <svg {...common}>
          <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...common}>
          <path d="m12 3 1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2-4.2-1.3 4.2-1.3L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 14l.6 1.4L7 16l-1.4.6L5 18l-.6-1.4L3 16l1.4-.6L5 14Z" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common}>
          <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      );
    case 'quote':
      return (
        <svg {...common}>
          <path d="M9 11H5a4 4 0 0 1 4-4v8a3 3 0 0 1-3 3M19 11h-4a4 4 0 0 1 4-4v8a3 3 0 0 1-3 3" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 12h14M14 7l5 5-5 5" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common}>
          <path d="m9 3 6 6M8 12l4-4 4 4-4 4M12 16l-2 5M7 9l8 8" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
        </svg>
      );
    case 'signal':
      return (
        <svg {...common}>
          <path d="M4 18v2M9 14v6M14 10v10M19 5v15" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...common}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
        </svg>
      );
    case 'music':
      return (
        <svg {...common}>
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="m8 5 11 7-11 7V5Z" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M7 5h4v14H7zM14 5h4v14h-4z" />
        </svg>
      );
    case 'previous':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M6 5h2v14H6zM19 5v14L8 12l11-7Z" />
        </svg>
      );
    case 'next':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M16 5h2v14h-2zM5 5v14l11-7L5 5Z" />
        </svg>
      );
    case 'volume':
      return (
        <svg {...common}>
          <path d="M11 5 6 9H3v6h3l5 4V5ZM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
        </svg>
      );
    case 'mute':
      return (
        <svg {...common}>
          <path d="M11 5 6 9H3v6h3l5 4V5ZM16 10l5 5M21 10l-5 5" />
        </svg>
      );
    case 'playlist':
      return (
        <svg {...common}>
          <path d="M4 6h10M4 11h10M4 16h7M17 6v10" />
          <circle cx="15" cy="17" r="3" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6" />
        </svg>
      );
    case 'power':
      return (
        <svg {...common}>
          <path d="M12 3v9" />
          <path d="M7.1 6.6a7 7 0 1 0 9.8 0" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...common}>
          <path d="m6 15 6-6 6 6" />
        </svg>
      );
    case 'lyrics':
      return (
        <svg {...common}>
          <path d="M4 6h9M4 11h12M4 16h7" />
          <path d="M18 6v10.5" />
          <circle cx="16" cy="18" r="2.5" />
        </svg>
      );
    case 'grip':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="9" cy="7" r="1" />
          <circle cx="15" cy="7" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="9" cy="17" r="1" />
          <circle cx="15" cy="17" r="1" />
        </svg>
      );
    case 'pip':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <rect x="12" y="11" width="6" height="5" rx="1" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case 'repeat':
      return (
        <svg {...common}>
          <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
        </svg>
      );
    case 'shuffle':
      return (
        <svg {...common}>
          <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
        </svg>
      );
  }
}

/** 天气图标（inline SVG，键来自服务端 describeWeatherCode 的 icon 字段） */
export function WeatherIcon({ icon, className }: { icon: string; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (icon) {
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case 'partly':
      return (
        <svg {...common}>
          <path d="M11.5 4.5a4.5 4.5 0 0 0-4.3 3.1 4 4 0 0 0 .8 7.9h5" />
          <path d="M11.5 4.5c2.3 0 4.2 1.7 4.5 3.9" />
          <path d="M17 11a4 4 0 1 1 0 8H8" />
        </svg>
      );
    case 'overcast':
      return (
        <svg {...common}>
          <path d="M7 18h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7 8.6 4.7 4.7 0 0 0 7 18Z" />
        </svg>
      );
    case 'fog':
      return (
        <svg {...common}>
          <path d="M5 9h14M3 13h18M5 17h14" />
        </svg>
      );
    case 'drizzle':
    case 'rain':
      return (
        <svg {...common}>
          <path d="M7 15h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7 5.6 4.7 4.7 0 0 0 7 15Z" />
          <path d="M9 18v2M13 18v2M17 18v2" />
        </svg>
      );
    case 'heavy-rain':
      return (
        <svg {...common}>
          <path d="M7 14h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7 4.6 4.7 4.7 0 0 0 7 14Z" />
          <path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3M20 17l-1 3" />
        </svg>
      );
    case 'snow':
    case 'sleet':
      return (
        <svg {...common}>
          <path d="M7 15h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7 5.6 4.7 4.7 0 0 0 7 15Z" />
          <path d="M9 18.5h.01M12 20h.01M15 18.5h.01" strokeWidth={2.4} />
        </svg>
      );
    case 'thunder':
      return (
        <svg {...common}>
          <path d="M7 14h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7 4.6 4.7 4.7 0 0 0 7 14Z" />
          <path d="M13 14l-2.5 4h3L11 22" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M7 18h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7 8.6 4.7 4.7 0 0 0 7 18Z" />
        </svg>
      );
  }
}

/** 数据源健康状态点 */
export function HealthDot({ status }: { status: string }) {
  const color =
    status === 'fresh'
      ? 'bg-ok'
      : status === 'stale'
        ? 'bg-warn'
        : status === 'error'
          ? 'bg-err'
          : 'bg-border';
  const title =
    status === 'fresh'
      ? '数据正常'
      : status === 'stale'
        ? '展示的是过期缓存（源暂时不可用）'
        : status === 'error'
          ? '数据源不可用'
          : '未配置';
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-block size-2 rounded-full ${color}`}
    />
  );
}

/** 热榜徽章（热/爆/新/置顶） */
export function TagChip({ tag }: { tag: string }) {
  const tone =
    tag === '爆'
      ? 'bg-err-soft text-err ring-err/25'
      : tag === '热'
        ? 'bg-warn-soft text-warn ring-warn/25'
        : 'bg-info-soft text-info ring-info/25';
  return (
    <span
      className={`shrink-0 rounded-xs px-1 py-0.5 text-[10px] font-semibold leading-none ring-1 ring-inset ${tone}`}
    >
      {tag}
    </span>
  );
}
