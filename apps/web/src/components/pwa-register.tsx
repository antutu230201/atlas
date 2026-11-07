'use client';

import { useEffect } from 'react';

/**
 * PWA：生产环境注册 Service Worker（离线缓存 + 可安装性）。
 * dev 不注册——热更新会被 SW 缓存干扰。
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW 注册失败不影响应用功能（离线只是降级）
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
