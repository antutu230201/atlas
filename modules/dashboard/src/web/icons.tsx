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
  | 'layers';

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
      className={`shrink-0 rounded-xs px-1 py-0.5 text-[9px] font-semibold leading-none ring-1 ring-inset ${tone}`}
    >
      {tag}
    </span>
  );
}
