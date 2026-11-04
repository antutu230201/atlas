'use client';

import { Skeleton } from '@atlas/ui';
import type { SourceEnvelope, WeatherData } from './types';
import { WeatherIcon } from './icons';

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

/** 天气卡：实时 + 未来 4 天 + 未来数小时条 + 空气质量（数据由服务端 Open-Meteo 提供） */
export function WeatherCard({
  envelope,
  cityName,
}: {
  envelope: SourceEnvelope<WeatherData>;
  cityName?: string;
}) {
  if (envelope.status === 'empty') return null;

  if (envelope.payload === null) {
    return (
      <div className="glass rounded-md p-4">
        <p className="text-sm font-semibold">天气不可用</p>
        <p className="mt-1 text-xs text-muted">{envelope.error ?? '数据源暂时没有返回'}</p>
      </div>
    );
  }

  const data = envelope.payload;
  const air = data.air?.usAqi !== undefined ? aqiText(data.air.usAqi) : undefined;
  const wind = windDirText(data.now.windDir);

  return (
    <div className="glass flex h-full flex-col gap-4 rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{cityName ?? '当前位置'}</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="font-mono text-4xl font-semibold tabular-nums">
              {Math.round(data.now.temperature)}
            </span>
            <span className="text-lg text-muted">°C</span>
          </p>
          <p className="mt-1 text-sm">{data.now.text}</p>
        </div>
        <WeatherIcon icon={data.now.icon} className="size-14 shrink-0 text-warn" />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
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
            AQI {Math.round(data.air.usAqi)}
            <span className={`ml-1 font-semibold ${air.tone}`}>{air.text}</span>
          </span>
        ) : null}
      </div>

      {data.hourly.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-1" aria-label="未来数小时气温">
          {data.hourly.slice(0, 8).map((hour) => (
            <div key={hour.time} className="flex min-w-9 flex-col items-center gap-1 text-xs">
              <span className="text-muted">{hour.time.slice(11, 13)}时</span>
              <WeatherIcon icon={hour.icon} className="size-4 text-muted" />
              <span className="tabular-nums">{Math.round(hour.temperature)}°</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-2 border-t border-border pt-3" aria-label="未来几天预报">
        {data.days.slice(1, 5).map((day) => (
          <div key={day.date} className="flex flex-col items-center gap-1 text-xs">
            <span className="text-muted">
              {(() => {
                const d = new Date(`${day.date}T00:00:00`);
                return Number.isNaN(d.getTime()) ? day.date.slice(5) : `周${WEEKDAY[d.getDay()]}`;
              })()}
            </span>
            <WeatherIcon icon={day.icon} className="size-5" />
            <span className="tabular-nums">
              {Math.round(day.min)}° / {Math.round(day.max)}°
            </span>
            {day.precipProb !== undefined && day.precipProb >= 30 ? (
              <span className="text-[10px] text-info">降水 {day.precipProb}%</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeatherCardSkeleton() {
  return <Skeleton className="h-64 w-full rounded-md" />;
}
