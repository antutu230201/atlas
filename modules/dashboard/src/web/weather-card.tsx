'use client';

import { useId, useState } from 'react';
import { Skeleton } from '@atlas/ui';
import type { SourceEnvelope, WeatherData } from './types';
import { ScreenIcon, WeatherIcon } from './icons';
import { getWeatherScene, WEATHER_SCENE_LABELS } from './weather-atmosphere';
import { WeatherDetailsDialog } from './weather-details';

function aqiText(usAqi: number): { text: string; tone: string } {
  if (usAqi <= 50) return { text: '优', tone: 'text-ok' };
  if (usAqi <= 100) return { text: '良', tone: 'text-warn' };
  if (usAqi <= 150) return { text: '轻度污染', tone: 'text-warn' };
  return { text: '中度污染', tone: 'text-err' };
}

function windDirText(degree?: number): string | undefined {
  if (degree === undefined) return undefined;
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return `${dirs[Math.round(degree / 45) % 8]}风`;
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function HourlyChart({ data }: { data: WeatherData['hourly'] }) {
  const id = useId().replace(/:/g, '');
  const hours = data.slice(0, 8);
  if (hours.length < 2) return null;
  const temps = hours.map((hour) => hour.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = Math.max(1, max - min);
  const points = hours.map((hour, index) => ({
    x: 8 + (index * 184) / (hours.length - 1),
    y: 50 - ((hour.temperature - min) / range) * 34,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `8,56 ${line} 192,56`;

  return (
    <div className="relative" aria-label="未来数小时气温趋势">
      <svg viewBox="0 0 200 62" className="h-20 w-full overflow-visible" role="img">
        <defs>
          <linearGradient id={`weather-area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--screen-cyan)" stopOpacity=".26" />
            <stop offset="1" stopColor="var(--screen-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M8 50H192M8 32H192M8 14H192"
          stroke="var(--screen-border)"
          strokeWidth=".5"
          strokeDasharray="2 4"
        />
        <polygon points={area} fill={`url(#weather-area-${id})`} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--screen-cyan)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          className="screen-line"
        />
        {points.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === 0 ? 2.8 : 1.8}
            fill="var(--screen-bg-elevated)"
            stroke="var(--screen-cyan)"
            strokeWidth="1.2"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-muted">
        {hours.map((hour, index) => (
          <span
            key={hour.time}
            className={index % 2 === 0 || index === hours.length - 1 ? '' : 'hidden sm:block'}
          >
            {hour.time.slice(11, 13)}:00
          </span>
        ))}
      </div>
    </div>
  );
}

/** 天气卡：实时 + 未来 4 天 + 逐时趋势 + 空气质量（数据由服务端 Open-Meteo 提供） */
export function WeatherCard({
  envelope,
  cityName,
}: {
  envelope: SourceEnvelope<WeatherData>;
  cityName?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (envelope.status === 'empty') return null;

  if (envelope.payload === null) {
    return (
      <div className="screen-card p-4">
        <p className="text-sm font-semibold">天气不可用</p>
        <p className="mt-1 text-xs text-muted">{envelope.error ?? '数据源暂时没有返回'}</p>
      </div>
    );
  }

  const data = envelope.payload;
  const air = data.air?.usAqi !== undefined ? aqiText(data.air.usAqi) : undefined;
  const wind = windDirText(data.now.windDir);
  const scene = getWeatherScene(data.now.icon);

  return (
    <>
      <section className="screen-card group flex h-full flex-col gap-4 p-5" aria-label="实时天气">
        <header className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-info" />
            <p className="screen-label">Atmosphere · Live</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden items-center gap-1 text-[11px] text-info sm:inline-flex">
              <span className="size-1 rounded-full bg-info" />
              {WEATHER_SCENE_LABELS[scene]}
            </span>
            <span className="rounded-xs border border-border px-2 py-1 text-[11px] text-muted">
              {cityName ?? '当前位置'}
            </span>
            <button
              type="button"
              aria-label="查看天气详情"
              onClick={() => setDetailsOpen(true)}
              className="inline-flex items-center gap-1 rounded-xs px-1.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              详情
              <ScreenIcon name="arrow" className="size-3" />
            </button>
          </div>
        </header>

        <button
          type="button"
          aria-label="查看实时天气详情"
          onClick={() => setDetailsOpen(true)}
          className="relative flex items-start justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div>
            <p className="flex items-start font-mono font-medium tracking-[-0.07em] tabular-nums">
              <span className="text-7xl leading-none">{Math.round(data.now.temperature)}</span>
              <span className="mt-1 ml-1 text-xl tracking-normal text-muted">°</span>
            </p>
            <p className="mt-2 text-sm font-medium">{data.now.text}</p>
          </div>
          <div className="rounded-md border border-border bg-info-soft p-3 text-info transition-transform duration-[var(--duration-slow)] group-hover:rotate-3 group-hover:scale-105">
            <WeatherIcon icon={data.now.icon} className="size-12 shrink-0" />
          </div>
        </button>

        <div className="relative flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          {data.now.apparent !== undefined ? (
            <span>体感 {Math.round(data.now.apparent)}°</span>
          ) : null}
          {data.now.humidity !== undefined ? <span>湿度 {data.now.humidity}%</span> : null}
          {wind ? (
            <span>
              {wind} {Math.round(data.now.windSpeed ?? 0)} km/h
            </span>
          ) : null}
          {air && data.air?.usAqi !== undefined ? (
            <span>
              AQI {Math.round(data.air.usAqi)}{' '}
              <span className={`font-semibold ${air.tone}`}>{air.text}</span>
            </span>
          ) : null}
        </div>

        <HourlyChart data={data.hourly} />

        <div
          className="relative grid grid-cols-4 gap-2 border-t border-border pt-3"
          aria-label="未来几天预报"
        >
          {data.days.slice(1, 5).map((day) => (
            <button
              type="button"
              key={day.date}
              aria-label={`查看 ${day.date} 天气详情`}
              onClick={() => setDetailsOpen(true)}
              className="flex flex-col items-center gap-1.5 rounded-sm py-1 text-[11px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="text-muted">
                {(() => {
                  const d = new Date(`${day.date}T00:00:00`);
                  return Number.isNaN(d.getTime()) ? day.date.slice(5) : `周${WEEKDAY[d.getDay()]}`;
                })()}
              </span>
              <WeatherIcon icon={day.icon} className="size-5 text-muted" />
              <span className="font-mono tabular-nums">
                {Math.round(day.min)}° <span className="text-muted">/ {Math.round(day.max)}°</span>
              </span>
              {day.precipProb !== undefined && day.precipProb >= 30 ? (
                <span className="text-[11px] text-info">降水 {day.precipProb}%</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      <WeatherDetailsDialog
        data={data}
        cityName={cityName}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  );
}

export function WeatherCardSkeleton() {
  return <Skeleton className="h-64 w-full rounded-md" />;
}
