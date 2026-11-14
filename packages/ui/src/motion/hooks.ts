'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 动效系统 hooks（packages/ui）。
 * 三原则落地：时长走令牌；JS 只写 transform/opacity 相关量；全部尊重 prefers-reduced-motion。
 */

/** 是否处于"减少动态效果"偏好（系统级）；SSR/不支持时返回 false */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * 02 滚动显现 / 13 错峰动画：元素进入视口后返回 in=true（只触发一次）。
 * armed → in 的过渡由 tokens.css 的 .atlas-m-reveal/.atlas-m-armed/.atlas-m-in 完成；
 * 无 IntersectionObserver 时直接返回 true（内容立即可见）。
 */
export function useScrollReveal<T extends HTMLElement>(
  threshold = 0.15,
): {
  ref: React.RefObject<T | null>;
  inView: boolean;
} {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver !== 'function') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** 01 鼠标聚光灯 / 06 3D倾斜 / 04 磁吸按钮共用的指针坐标计算（元素左上角为原点） */
function pointerOffset(
  element: HTMLElement,
  event: PointerEvent | React.PointerEvent,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: (event as PointerEvent).clientX - rect.left,
    y: (event as PointerEvent).clientY - rect.top,
  };
}

/** 01 鼠标聚光灯：把指针位置写入 --mx/--my（供 .atlas-m-spotlight 的高光层定位） */
export function useSpotlight<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerLeave: () => void;
} {
  const ref = useRef<T | null>(null);
  const reduced = usePrefersReducedMotion();
  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (reduced) return;
      const element = ref.current;
      if (!element) return;
      const { x, y } = pointerOffset(element, event);
      element.style.setProperty('--mx', `${x}px`);
      element.style.setProperty('--my', `${y}px`);
    },
    [reduced],
  );
  return { ref, onPointerMove, onPointerLeave: () => undefined };
}

/** 06 3D倾斜：指针位置 → rotateX/rotateY（角度上限默认 8°）；reduced-motion 时不动 */
export function useTilt<T extends HTMLElement>(
  maxDeg = 8,
): {
  ref: React.RefObject<T | null>;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerLeave: () => void;
} {
  const ref = useRef<T | null>(null);
  const reduced = usePrefersReducedMotion();
  const apply = useCallback((rotateX: number, rotateY: number) => {
    const element = ref.current;
    if (!element) return;
    element.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }, []);
  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (reduced) return;
      const element = ref.current;
      if (!element) return;
      const { x, y } = pointerOffset(element, event);
      const px = x / element.clientWidth - 0.5;
      const py = y / element.clientHeight - 0.5;
      apply(-py * maxDeg * 2, px * maxDeg * 2);
    },
    [maxDeg, reduced, apply],
  );
  const onPointerLeave = useCallback(() => {
    if (reduced) return;
    apply(0, 0);
  }, [reduced, apply]);
  return { ref, onPointerMove, onPointerLeave };
}

/** 04 磁吸按钮：指针在元素上时向指针方向轻移（默认 0.25 位移比），离开回弹 */
export function useMagnetic<T extends HTMLElement>(
  pull = 0.25,
): {
  ref: React.RefObject<T | null>;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerLeave: () => void;
} {
  const ref = useRef<T | null>(null);
  const reduced = usePrefersReducedMotion();
  const apply = useCallback((dx: number, dy: number) => {
    const element = ref.current;
    if (!element) return;
    element.style.transition = 'transform var(--duration-fast) var(--motion-ease-standard)';
    element.style.transform = dx === 0 && dy === 0 ? '' : `translate(${dx}px, ${dy}px)`;
  }, []);
  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (reduced) return;
      const element = ref.current;
      if (!element) return;
      const { x, y } = pointerOffset(element, event);
      const centerX = element.clientWidth / 2;
      const centerY = element.clientHeight / 2;
      apply((x - centerX) * pull, (y - centerY) * pull);
    },
    [pull, reduced],
  );
  const onPointerLeave = useCallback(() => apply(0, 0), [apply]);
  return { ref, onPointerMove, onPointerLeave };
}

/** 09 视差滚动：滚动时按速率平移（rAF 节流；元素中心相对视口中心的偏移 × rate） */
export function useParallax<T extends HTMLElement>(
  rate = 0.2,
): {
  ref: React.RefObject<T | null>;
} {
  const ref = useRef<T | null>(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
      element.style.transform = `translateY(${(-offset * rate).toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [rate, reduced]);
  return { ref };
}

/**
 * 10 数字递增：进入视口后按 ease-out 从 0 递增到 target；
 * 只动画一次——之后 target 变化（如轮询数据更新）直接跟随，不重复播放；
 * reduced-motion / 无 IO → 直接返回终值（不播放）。
 */
export function useCountUp(
  target: number,
  durationMs = 1200,
): { ref: React.RefObject<HTMLSpanElement | null>; value: number } {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const playedRef = useRef(false);
  const [value, setValue] = useState(0);
  useEffect(() => {
    // 首次动画完成后，后续 target 变化直接跟随（大屏轮询指标不能反复从 0 跳）
    if (playedRef.current) {
      setValue(target);
      return;
    }
    if (reduced) {
      playedRef.current = true;
      setValue(target);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver !== 'function') {
      playedRef.current = true;
      setValue(target);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        playedRef.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.round(target * eased));
          if (progress < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [target, durationMs, reduced]);
  return { ref, value };
}

/**
 * 12 打字机效果：逐字揭示 + 光标（.atlas-m-caret）；
 * 进入视口才开始；reduced-motion → 直接完整文本。
 */
export function useTypewriter(
  text: string,
  speedMs = 55,
): {
  ref: React.RefObject<HTMLSpanElement | null>;
  shown: string;
  done: boolean;
} {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);
  const [started, setStarted] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setStarted(true);
      setCount(text.length);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver !== 'function') {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setStarted(true);
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduced, text]);
  useEffect(() => {
    if (!started || count >= text.length) return;
    const timer = window.setTimeout(() => setCount((c) => c + 1), speedMs);
    return () => window.clearTimeout(timer);
  }, [started, count, text, speedMs]);
  return { ref, shown: text.slice(0, count), done: count >= text.length };
}

/** 05 滚动叙事：当前滚动到的步骤索引（IO 按步骤元素判定，rAF 节流由 IO 内建） */
export function useScrollStory(stepCount: number): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stepRefs: (index: number) => (element: HTMLElement | null) => void;
  active: number;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elements = useRef<Map<number, HTMLElement>>(new Map());
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const [index, element] of elements.current) {
            if (element === entry.target) setActive(index);
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const element of elements.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [stepCount]);
  const stepRefs = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      if (element) elements.current.set(index, element);
      else elements.current.delete(index);
    },
    [],
  );
  return { containerRef, stepRefs, active };
}
