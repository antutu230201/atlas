'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  CountUp,
  Marquee,
  MagneticButton,
  Reveal,
  ScrollStory,
  SpotlightCard,
  TextDecode,
  TiltCard,
  Typewriter,
  usePrefersReducedMotion,
} from '@atlas/ui';

/**
 * 动效系统示例页：16 种常用 UI 动效 × 3 条设计原则。
 * 所有动效来自 packages/tokens（.atlas-m-* 工具类 + keyframes）与 packages/ui（motion hooks/组件），
 * 本页只做演示与用法示意——业务页面请直接复用同一套令牌与组件。
 */

const PRINCIPLES = [
  {
    title: '① 控制动画时长',
    body: '微交互 ≤300ms（--duration-fast/base），入场 ≤600ms（--motion-duration-reveal），氛围循环用长周期令牌。时长全部经令牌引用，禁止散落魔法数字。',
  },
  {
    title: '② 优先高性能属性',
    body: '只动 transform / opacity（合成器通道），不动 width/top 等布局属性；阴影用既有令牌过渡；will-change 仅用于长驻动画元素。',
  },
  {
    title: '③ 适配系统动态设置',
    body: 'prefers-reduced-motion 下：循环动画停止、过渡即时完成、内容永不因动画不可见（armed 态强制可见）；计数/打字机直接呈现终态。',
  },
];

/** 15 弹性动画：加 .atlas-m-bounce 类触发，key 变化重播 */
function BounceDemo() {
  const [key, setKey] = useState(0);
  return (
    <div className="flex items-center gap-4">
      <span key={key} className="atlas-m-bounce inline-block text-3xl" aria-hidden>
        🎯
      </span>
      <Button size="sm" variant="secondary" onClick={() => setKey((k) => k + 1)}>
        重播弹跳
      </Button>
    </div>
  );
}

/** 16 缓动效果：四个球同距离不同缓动曲线对比（令牌引用） */
function EasingDemo() {
  const [key, setKey] = useState(0);
  const rows = [
    { label: 'linear', value: 'linear' },
    { label: 'ease-out-soft', value: 'var(--ease-out-soft)' },
    { label: 'ease-inout', value: 'var(--motion-ease-inout)' },
    { label: 'spring', value: 'var(--ease-spring)' },
  ];
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-24 font-mono text-[10px] text-muted">{row.label}</span>
          <div
            className="relative h-4 w-40 rounded-full bg-surface"
            style={{ '--motion-travel': '144px' } as React.CSSProperties}
          >
            <span
              key={`${row.label}-${key}`}
              className="absolute top-0 size-4 rounded-full bg-primary"
              style={{
                animation: `atlas-ease-travel 900ms ${row.value} forwards`,
              }}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setKey((k) => k + 1)}>
          重播对比
        </Button>
      </div>
    </div>
  );
}

/** 09 视差滚动：两层不同速率的装饰圆随滚动平移 */
function ParallaxDemo() {
  const layerA = useRef<HTMLDivElement | null>(null);
  const layerB = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      for (const [element, rate] of [
        [layerA.current, 0.18],
        [layerB.current, 0.38],
      ] as const) {
        if (!element) continue;
        const rect = element.parentElement?.getBoundingClientRect();
        if (!rect) continue;
        const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
        element.style.transform = `translateY(${(-offset * rate).toFixed(1)}px)`;
      }
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [reduced]);
  return (
    <div className="relative h-56 overflow-hidden rounded-sm border border-border bg-surface">
      <div
        ref={layerA}
        className="absolute left-10 top-16 size-16 rounded-full border border-primary/40"
        aria-hidden
      />
      <div
        ref={layerB}
        className="absolute right-14 top-6 size-24 rounded-full bg-primary-soft"
        aria-hidden
      />
      <p className="absolute bottom-3 left-4 text-[11px] text-muted">
        上下滚动本页，两层装饰圆按不同速率平移（transform 合成器通道）。
      </p>
    </div>
  );
}

interface DemoMeta {
  id: string;
  no: string;
  name: string;
  note: string;
  /** 自成一段的宽卡（滚动叙事/视差） */
  wide?: boolean;
}

export default function DesignMotionPage() {
  const demos: Array<DemoMeta & { demo: React.ReactNode }> = [
    {
      id: 'spotlight',
      no: '01',
      name: '鼠标聚光灯',
      note: 'radial 高光层跟随指针，opacity 过渡显隐',
      demo: (
        <SpotlightCard className="rounded-sm border border-border p-6 text-center text-sm text-muted">
          在这张卡上移动鼠标
        </SpotlightCard>
      ),
    },
    {
      id: 'reveal',
      no: '02',
      name: '滚动显现',
      note: 'IntersectionObserver 进入视口播放入场（只触发一次）',
      demo: (
        <Reveal className="rounded-sm border border-border p-6 text-sm">滚动到我时淡入上移</Reveal>
      ),
    },
    {
      id: 'glow-border',
      no: '03',
      name: '边缘流光',
      note: '锥形渐变层旋转，仅边缘露出光弧（transform 旋转）',
      demo: (
        <div className="atlas-m-glow-border rounded-sm p-px">
          <div className="rounded-sm bg-bg p-6 text-center text-sm text-muted">流光沿边缘环行</div>
        </div>
      ),
    },
    {
      id: 'magnetic',
      no: '04',
      name: '磁吸按钮',
      note: '指针接近时向指针轻移（translate），离开回弹',
      demo: (
        <MagneticButton>
          <Button variant="primary">靠近我</Button>
        </MagneticButton>
      ),
    },
    {
      id: 'tilt',
      no: '06',
      name: '3D 倾斜',
      note: 'rotateX/rotateY ≤8°，perspective 700px，离开复位',
      demo: (
        <TiltCard>
          <div className="rounded-sm border border-border bg-surface p-6 text-center text-sm text-muted">
            移动鼠标看我倾斜
          </div>
        </TiltCard>
      ),
    },
    {
      id: 'decode',
      no: '07',
      name: '文字解码',
      note: '乱码字符从左到右锁定，interval 步进',
      demo: <TextDecode text="ATLAS MOTION SYSTEM" />,
    },
    {
      id: 'shimmer',
      no: '08',
      name: '流光扫过',
      note: '高光带 translateX 扫过（hover 触发；auto 为常驻循环）',
      demo: (
        <div className="space-y-3">
          <div className="atlas-m-shimmer rounded-sm border border-border p-6 text-center text-sm text-muted">
            悬停我，流光扫过
          </div>
          <div className="atlas-m-shimmer atlas-m-shimmer-auto rounded-sm border border-border p-6 text-center text-sm text-muted">
            常驻循环（auto 变体）
          </div>
        </div>
      ),
    },
    {
      id: 'countup',
      no: '10',
      name: '数字递增',
      note: '进入视口后 rAF ease-out 递增；reduced-motion 直显终值',
      demo: (
        <p className="text-3xl font-semibold text-primary">
          <CountUp to={12860} suffix=" 条" />
        </p>
      ),
    },
    {
      id: 'lift',
      no: '11',
      name: '悬停上浮',
      note: 'hover translateY(-4px) + 阴影令牌过渡',
      demo: (
        <div className="grid grid-cols-3 gap-3">
          {['A', 'B', 'C'].map((item) => (
            <div
              key={item}
              className="atlas-m-lift rounded-sm border border-border bg-surface p-4 text-center font-mono text-sm text-muted"
            >
              {item}
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'typewriter',
      no: '12',
      name: '打字机效果',
      note: '逐字打出 + 光标闪烁；reduced-motion 直接完整文本',
      demo: (
        <p className="min-h-6 text-sm">
          <Typewriter text="把每一次复盘，都变成下一步的地基。" />
        </p>
      ),
    },
    {
      id: 'stagger',
      no: '13',
      name: '错峰动画',
      note: '--motion-index 决定延迟（index × --motion-stagger）',
      demo: (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Reveal key={index} index={index} className="min-w-0">
              <div className="rounded-sm border border-border bg-surface p-4 text-center font-mono text-xs text-muted">
                {String(index + 1).padStart(2, '0')}
              </div>
            </Reveal>
          ))}
        </div>
      ),
    },
    {
      id: 'marquee',
      no: '14',
      name: '跑马灯',
      note: '内容复制两份无缝循环，hover/focus 暂停',
      demo: (
        <Marquee className="rounded-sm border border-border py-3">
          {['专注', '记录', '复盘', '成长'].map((word) => (
            <span key={word} className="text-sm text-muted">
              ✦ {word}
            </span>
          ))}
        </Marquee>
      ),
    },
    {
      id: 'bounce',
      no: '15',
      name: '弹性动画',
      note: 'spring 曲线（--ease-spring）scale 入场，可重播',
      demo: <BounceDemo />,
    },
    {
      id: 'easing',
      no: '16',
      name: '缓动效果',
      note: '全部缓动走令牌：linear / soft / inout / spring 同台对比',
      demo: <EasingDemo />,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">动效系统</h1>
        <p className="screen-label mt-0.5 !text-[10px]">Motion · 16 patterns × 3 principles</p>
        <p className="mt-2 text-xs text-muted">
          设计系统示例页·动效篇。全部动效来自
          <code className="mx-1 rounded-sm bg-surface px-1 py-0.5 font-mono text-[11px]">
            @atlas/tokens
          </code>
          工具类与
          <code className="mx-1 rounded-sm bg-surface px-1 py-0.5 font-mono text-[11px]">
            @atlas/ui
          </code>
          motion 组件；返回
          <Link href="/design" className="ml-1 text-primary hover:underline">
            基础组件库
          </Link>
          。
        </p>
      </header>

      {/* 三条设计原则 */}
      <section aria-label="动效三原则" className="grid gap-3 sm:grid-cols-3">
        {PRINCIPLES.map((principle, index) => (
          <Reveal key={principle.title} index={index}>
            <div className="h-full rounded-sm border border-primary/20 bg-primary-soft p-4">
              <h2 className="text-sm font-semibold">{principle.title}</h2>
              <p className="mt-1.5 text-xs leading-6 text-text/80">{principle.body}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* 宽卡：滚动叙事（05）与视差滚动（09） */}
      <Reveal index={0}>
        <section
          data-motion="05"
          aria-label="滚动叙事"
          className="rounded-sm border border-border p-5"
        >
          <p className="screen-label !text-[10px]">05 · 滚动叙事</p>
          <p className="mt-1 text-xs text-muted">
            步骤随滚动依次激活（IO + rootMargin 中线判定），只动 opacity。
          </p>
          <div className="mt-4">
            <ScrollStory
              steps={[
                { title: '记录', body: '用待办与笔记接住每一个念头。' },
                { title: '坚持', body: '习惯打卡把行动变成节奏。' },
                { title: '回看', body: '目标与复盘告诉你，这些日子指向哪里。' },
              ]}
            />
          </div>
        </section>
      </Reveal>

      <Reveal index={1}>
        <section
          data-motion="09"
          aria-label="视差滚动"
          className="rounded-sm border border-border p-5"
        >
          <p className="screen-label !text-[10px]">09 · 视差滚动</p>
          <div className="mt-4">
            <ParallaxDemo />
          </div>
        </section>
      </Reveal>

      {/* 16 格演示网格 */}
      <div className="grid gap-4 md:grid-cols-2">
        {demos.map(({ id, no, name, note, demo }, index) => (
          <Reveal key={id} index={index % 2} className="min-w-0">
            <section
              data-motion={no}
              aria-label={`${no} ${name}`}
              className="h-full rounded-sm border border-border p-5"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] tracking-wider text-primary">{no}</span>
                <h2 className="text-sm font-semibold">{name}</h2>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{note}</p>
              <div className="mt-4">{demo}</div>
            </section>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
