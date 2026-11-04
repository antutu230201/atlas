'use client';

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
      ? 'bg-err-soft text-err'
      : tag === '热'
        ? 'bg-warn-soft text-warn'
        : 'bg-info-soft text-info';
  return (
    <span className={`rounded-xs px-1 py-0.5 text-[10px] font-semibold leading-none ${tone}`}>
      {tag}
    </span>
  );
}
