'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@atlas/ui';
import { WeatherIcon } from './icons';
import type { WeatherData } from './types';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function airQuality(usAqi?: number) {
  if (usAqi === undefined) return '暂无数据';
  if (usAqi <= 50) return '优';
  if (usAqi <= 100) return '良';
  if (usAqi <= 150) return '轻度污染';
  return '中度污染';
}

function windDirection(degree?: number) {
  if (degree === undefined) return '风向未知';
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return `${directions[Math.round(degree / 45) % 8]}风`;
}

function dayLabel(date: string, index: number) {
  if (index === 0) return '今天';
  if (index === 1) return '明天';
  const value = new Date(`${date}T00:00:00`);
  return Number.isNaN(value.getTime()) ? date : `周${WEEKDAYS[value.getDay()]}`;
}

function updatedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WeatherDetailsDialog({
  data,
  cityName,
  open,
  onOpenChange,
}: {
  data: WeatherData;
  cityName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = data.days[0];
  const metrics = [
    {
      label: '体感温度',
      value: data.now.apparent === undefined ? '—' : `${Math.round(data.now.apparent)}°C`,
    },
    { label: '相对湿度', value: data.now.humidity === undefined ? '—' : `${data.now.humidity}%` },
    {
      label: '风况',
      value: `${windDirection(data.now.windDir)} · ${Math.round(data.now.windSpeed ?? 0)} km/h`,
    },
    {
      label: '空气质量',
      value:
        data.air?.usAqi === undefined
          ? '—'
          : `AQI ${Math.round(data.air.usAqi)} · ${airQuality(data.air.usAqi)}`,
    },
    { label: '当前降水', value: `${data.now.precipitation ?? 0} mm` },
    {
      label: 'PM2.5',
      value: data.air?.pm25 === undefined ? '—' : `${Math.round(data.air.pm25)} μg/m³`,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dashboard-screen max-h-[88vh] w-[min(920px,92vw)] overflow-y-auto bg-bg p-0 text-text">
        <DialogHeader className="mb-0 border-b border-border p-6 pr-14">
          <DialogTitle className="text-xl">{cityName ?? '当前位置'} · 天气详情</DialogTitle>
          <DialogDescription className="text-xs">
            实时天气、逐时趋势与未来预报 · 更新于 {updatedTime(data.updatedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 p-6">
          <section className="grid gap-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-md border border-border bg-info-soft p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-5xl font-medium tracking-tight tabular-nums">
                    {Math.round(data.now.temperature)}°
                  </p>
                  <p className="mt-2 text-sm font-semibold">{data.now.text}</p>
                </div>
                <WeatherIcon icon={data.now.icon} className="size-16 text-info" />
              </div>
              {today ? (
                <p className="mt-4 text-xs text-muted">
                  今日 {Math.round(today.min)}° / {Math.round(today.max)}°
                  {today.precipProb !== undefined ? ` · 降水概率 ${today.precipProb}%` : ''}
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-sm border border-border bg-surface p-3">
                  <dt className="text-[11px] text-muted">{metric.label}</dt>
                  <dd className="mt-2 text-xs font-semibold leading-relaxed">{metric.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {data.hourly.length > 0 ? (
            <section aria-labelledby="weather-hourly-title">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 id="weather-hourly-title" className="text-sm font-semibold">
                  逐时天气
                </h3>
                <span className="text-[11px] text-muted">
                  未来 {Math.min(12, data.hourly.length)} 小时
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {data.hourly.slice(0, 12).map((hour, index) => (
                  <div
                    key={hour.time}
                    className="flex flex-col items-center gap-2 rounded-sm border border-border bg-surface px-2 py-3"
                  >
                    <span className="text-[11px] text-muted">
                      {index === 0 ? '现在' : hour.time.slice(11, 16)}
                    </span>
                    <WeatherIcon icon={hour.icon} className="size-5 text-info" />
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {Math.round(hour.temperature)}°
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {data.days.length > 0 ? (
            <section aria-labelledby="weather-daily-title">
              <h3 id="weather-daily-title" className="mb-3 text-sm font-semibold">
                未来几天
              </h3>
              <div className="overflow-hidden rounded-md border border-border">
                {data.days.slice(0, 7).map((day, index) => (
                  <div
                    key={day.date}
                    className="grid grid-cols-[3rem_2rem_1fr_auto] items-center gap-3 border-b border-border bg-surface px-4 py-3 text-xs last:border-b-0 sm:grid-cols-[4rem_2rem_1fr_auto_auto]"
                  >
                    <div>
                      <p className="font-semibold">{dayLabel(day.date, index)}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{day.date.slice(5)}</p>
                    </div>
                    <WeatherIcon icon={day.icon} className="size-5 text-info" />
                    <div className="min-w-0">
                      <p>{day.text}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {day.precipProb === undefined ? '降水概率暂无' : `降水 ${day.precipProb}%`}
                      </p>
                    </div>
                    <p className="font-mono font-semibold tabular-nums">
                      {Math.round(day.min)}° / {Math.round(day.max)}°
                    </p>
                    <p className="hidden text-right text-[11px] leading-relaxed text-muted sm:block">
                      {day.sunrise ? `日出 ${day.sunrise.slice(11, 16)}` : ''}
                      {day.sunset ? (
                        <>
                          <br />
                          {`日落 ${day.sunset.slice(11, 16)}`}
                        </>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
