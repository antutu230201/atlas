'use client';

import { useEffect, useState } from 'react';

/** Scroll feedback shared by the dashboard and its reading-heavy pages. */
export function useScrollActive(): boolean {
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    let timer = 0;
    const onActive = () => {
      setScrolling(true);
      document.body.dataset.screenScrolling = '1';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setScrolling(false);
        delete document.body.dataset.screenScrolling;
      }, 350);
    };
    window.addEventListener('scroll', onActive, { passive: true });
    window.addEventListener('wheel', onActive, { passive: true });
    return () => {
      window.removeEventListener('scroll', onActive);
      window.removeEventListener('wheel', onActive);
      window.clearTimeout(timer);
      delete document.body.dataset.screenScrolling;
    };
  }, []);

  return scrolling;
}
