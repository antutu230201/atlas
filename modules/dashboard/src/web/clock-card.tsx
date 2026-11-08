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
    <section className="relative z-10 flex h-full flex-col justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-info shadow-[var(--screen-glow)]" />
          <p className="screen-label">Local time · Living in the moment</p>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {dateText}
          <span className="mx-2 opacity-40">/</span>
          {/* 农历日期可点：查万年历（了解今天对应的具体干支宜忌） */}
          <a
            href={`https://www.baidu.com/s?wd=${encodeURIComponent('万年历 农历')}`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-border decoration-dotted underline-offset-2 transition-colors hover:text-primary"
            title="查看万年历"
          >
            {lunarInfo.lunarDate}
          </a>
          <span className="hidden xl:inline">
            <span className="mx-2 opacity-40">/</span>
            {lunarInfo.ganzhi}
          </span>
        </p>
      </div>

      <div className="flex items-end gap-3" role="timer" aria-label="当前时间">
        <p className="font-mono text-[clamp(2.6rem,4vw,3.6rem)] font-medium leading-[0.88] tracking-[-0.075em] tabular-nums">
          {time}
        </p>
        <span className="mb-1 rounded-sm border border-border bg-primary-soft px-2 py-0.5 font-mono text-base font-normal text-primary tabular-nums">
          {seconds}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-medium tracking-tight">
          {greetingOf(now.getHours())}
          {displayName ? `，${displayName}` : ''}
          <span className="ml-2 text-muted">今天也保持自己的节奏。</span>
        </p>
        {lunarInfo.jieqi ? (
          <span className="rounded-xs bg-primary-soft px-2 py-1 text-[11px] font-semibold text-primary">
            {lunarInfo.jieqi}
          </span>
        ) : null}
        {lunarInfo.festival ? (
          <span className="rounded-xs bg-info-soft px-2 py-1 text-[11px] font-semibold text-info">
            {lunarInfo.festival}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** 无依赖的时间核心：旋转轨道、呼吸光晕与脉冲环，reduced-motion 自动静止。 */
export function TimeOrbit() {
  return (
    <div
      className="pointer-events-none relative hidden aspect-square w-full max-w-36 items-center justify-center 2xl:flex"
      aria-hidden
    >
      <svg viewBox="0 0 240 240" className="size-full overflow-visible">
        <defs>
          <linearGradient id="screen-orbit-line" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--screen-accent)" stopOpacity=".7" />
            <stop offset=".5" stopColor="var(--screen-cyan)" stopOpacity=".16" />
            <stop offset="1" stopColor="var(--screen-accent)" stopOpacity=".5" />
          </linearGradient>
          <radialGradient id="screen-orbit-core">
            <stop stopColor="var(--screen-accent)" stopOpacity=".32" />
            <stop offset="1" stopColor="var(--screen-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="120" r="74" fill="url(#screen-orbit-core)" className="screen-core" />
        <circle
          cx="120"
          cy="120"
          r="52"
          fill="none"
          stroke="var(--screen-border-bright)"
          strokeDasharray="1 7"
        />
        <g className="screen-orbit">
          <ellipse
            cx="120"
            cy="120"
            rx="91"
            ry="62"
            fill="none"
            stroke="url(#screen-orbit-line)"
            strokeWidth="1.2"
            transform="rotate(-24 120 120)"
          />
          <circle cx="37" cy="82" r="4" fill="var(--screen-cyan)" />
          <circle
            cx="37"
            cy="82"
            r="10"
            fill="none"
            stroke="var(--screen-cyan)"
            strokeOpacity=".25"
            className="screen-pulse-ring"
          />
        </g>
        <g>
          <ellipse
            cx="120"
            cy="120"
            rx="70"
            ry="96"
            fill="none"
            stroke="url(#screen-orbit-line)"
            strokeOpacity=".6"
            transform="rotate(38 120 120)"
          />
          <circle cx="178" cy="69" r="3" fill="var(--screen-accent)" opacity=".7" />
        </g>
        <circle
          cx="120"
          cy="120"
          r="27"
          fill="var(--screen-panel-solid)"
          stroke="var(--screen-border-bright)"
        />
        <path
          d="M120 102v18l12 8"
          fill="none"
          stroke="var(--screen-text)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="120" cy="120" r="3" fill="var(--screen-cyan)" />
      </svg>
      <span className="screen-label absolute right-0 bottom-[12%]">Sync · 01</span>
    </div>
  );
}
