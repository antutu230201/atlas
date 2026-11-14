'use client';

import { cn } from '../cn';
import { useEffect, useState } from 'react';
import {
  useCountUp,
  useMagnetic,
  usePrefersReducedMotion,
  useScrollReveal,
  useScrollStory,
  useSpotlight,
  useTilt,
  useTypewriter,
} from './hooks';

/**
 * 动效系统组件（packages/ui）：tokens.css 提供 .atlas-m-* 工具类与 keyframes，
 * 本文件提供 JS 行为的包装组件。全部遵循动效三原则（时长受控 / transform+opacity / reduced-motion 降级）。
 */

/** 02 滚动显现 + 13 错峰动画：进入视口入场；index 决定错峰次序（--motion-index） */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  /** 错峰序号：延迟 = index × --motion-stagger */
  index?: number;
  className?: string;
}) {
  const { ref, inView } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn('atlas-m-reveal atlas-m-armed', inView && 'atlas-m-in', className)}
      style={{ '--motion-index': index } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** 01 鼠标聚光灯：卡内高光层跟随指针 */
export function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, onPointerMove } = useSpotlight<HTMLDivElement>();
  return (
    <div ref={ref} onPointerMove={onPointerMove} className={cn('atlas-m-spotlight', className)}>
      {children}
    </div>
  );
}

/** 06 3D倾斜：指针驱动 rotateX/rotateY（≤8°），离开复位 */
export function TiltCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLDivElement>();
  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn('transition-transform', className)}
    >
      {children}
    </div>
  );
}

/** 04 磁吸按钮：内层元素向指针方向轻移，离开回弹 */
export function MagneticButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, onPointerMove, onPointerLeave } = useMagnetic<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn('inline-block', className)}
    >
      {children}
    </span>
  );
}

/** 10 数字递增：进入视口后 ease-out 递增；reduced-motion 直接显示终值 */
export function CountUp({
  to,
  durationMs = 1200,
  suffix,
  className,
}: {
  to: number;
  durationMs?: number;
  suffix?: string;
  className?: string;
}) {
  const { ref, value } = useCountUp(to, durationMs);
  return (
    <span ref={ref} className={cn('font-mono tabular-nums', className)}>
      {value.toLocaleString('zh-CN')}
      {suffix ? <span className="text-muted">{suffix}</span> : null}
    </span>
  );
}

/** 12 打字机效果：进入视口逐字打出 + 光标；reduced-motion 直接完整文本 */
export function Typewriter({
  text,
  speedMs = 55,
  className,
}: {
  text: string;
  speedMs?: number;
  className?: string;
}) {
  const { ref, shown, done } = useTypewriter(text, speedMs);
  return (
    <span ref={ref} className={cn(!done && 'atlas-m-caret', className)}>
      {shown}
    </span>
  );
}

/** 07 文字解码：乱码字符从左到右逐步锁定；reduced-motion 直接完整文本 */
export function TextDecode({
  text,
  stepMs = 45,
  className,
}: {
  text: string;
  stepMs?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? text : '');
  useEffect(() => {
    if (reduced) {
      setShown(text);
      return;
    }
    const glyphs = 'ABCDEF0123456789#@$%&';
    let progress = 0;
    const timer = window.setInterval(() => {
      progress += 1;
      const locked = text.slice(0, progress);
      const scrambling = text
        .slice(progress)
        .split('')
        .map((char) => (char === ' ' ? ' ' : glyphs[Math.floor(Math.random() * glyphs.length)]))
        .join('');
      setShown(locked + scrambling);
      if (progress >= text.length) window.clearInterval(timer);
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [text, stepMs, reduced]);
  return (
    <span aria-label={text} className={className}>
      {shown}
    </span>
  );
}

/** 14 跑马灯：内容复制两份无缝循环，hover/focus 暂停（.atlas-m-marquee） */
export function Marquee({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('atlas-m-marquee', className)} role="marquee" aria-label="滚动内容">
      <div className="atlas-m-marquee-track">
        {children}
        <span aria-hidden="true">{children}</span>
      </div>
    </div>
  );
}

/** 05 滚动叙事：步骤随滚动依次激活（激活项 opacity 1，其余淡出） */
export function ScrollStory({
  steps,
  className,
}: {
  steps: Array<{ title: string; body: string }>;
  className?: string;
}) {
  const { containerRef, stepRefs, active } = useScrollStory(steps.length);
  return (
    <div ref={containerRef} className={cn('space-y-6', className)}>
      {steps.map((step, index) => (
        <div
          key={step.title}
          ref={stepRefs(index)}
          className="transition-opacity duration-500"
          style={{ opacity: active === index ? 1 : 0.35 }}
          aria-current={active === index ? 'step' : undefined}
        >
          <p className="screen-label !text-[10px]">STEP {String(index + 1).padStart(2, '0')}</p>
          <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
          <p className="mt-1 text-xs leading-6 text-muted">{step.body}</p>
        </div>
      ))}
    </div>
  );
}
