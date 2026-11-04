'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lunar, Solar } from 'lunar-typescript';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function greetingOf(hour: number): string {
  if (hour < 5) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

/** 大屏时钟：秒级走时 + 公历/农历/节气/节日 + 时段问候 */
export function ClockCard({ displayName }: { displayName?: string }) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const lunarInfo = useMemo(() => {
    const solar = Solar.fromDate(now);
    const lunar = Lunar.fromSolar(solar);
    const festivals = [...solar.getFestivals(), ...lunar.getFestivals()];
    const jieqi = lunar.getJieQi();
    return {
      lunarDate: `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      ganzhi: `${lunar.getYearInGanZhi()}年 · ${lunar.getYearShengXiao()}`,
      jieqi: jieqi.length > 0 ? jieqi : undefined,
      festival: festivals.length > 0 ? festivals.join(' · ') : undefined,
    };
    // 农历信息按"日期部分"缓存，避免每秒重算
  }, [now.getFullYear(), now.getMonth(), now.getDate()]);

  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const seconds = pad(now.getSeconds());
  const dateText = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${WEEKDAYS[now.getDay()]}`;

  return (
    <section className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-baseline gap-2 text-xs text-muted">
        <span>{dateText}</span>
        <span aria-hidden>·</span>
        <span>{lunarInfo.lunarDate}</span>
        <span className="hidden sm:inline">{lunarInfo.ganzhi}</span>
      </div>

      <div className="flex items-end gap-2" role="timer" aria-label="当前时间">
        <p className="font-mono text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl">
          {time}
          <span className="ml-1 align-baseline text-2xl font-normal text-muted sm:text-3xl">
            {seconds}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <p className="text-sm font-semibold">
          {greetingOf(now.getHours())}
          {displayName ? `，${displayName}` : ''}
        </p>
        {lunarInfo.jieqi ? (
          <span className="rounded-xs bg-primary-soft px-1.5 py-0.5 text-[11px] text-primary">
            {lunarInfo.jieqi}
          </span>
        ) : null}
        {lunarInfo.festival ? (
          <span className="rounded-xs bg-info-soft px-1.5 py-0.5 text-[11px] text-info">
            {lunarInfo.festival}
          </span>
        ) : null}
      </div>
    </section>
  );
}
