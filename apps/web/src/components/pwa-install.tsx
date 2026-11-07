'use client';

import { useEffect, useState } from 'react';
import { Button } from '@atlas/ui';

/**
 * PWA 安装卡：捕获浏览器 beforeinstallprompt，提供一键安装。
 * 安装成 standalone 应用后，Chrome 放行自动播放（挂墙场景刚需）。
 * 浏览器未提供安装事件（已安装/不支持）时整卡隐藏。
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstall() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!event) return null;

  return (
    <div className="screen-card flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">安装为桌面应用</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-muted">
          独立窗口运行，自动播放不受浏览器限制（挂墙场景推荐）。
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          void event.prompt().then(() => setEvent(null));
        }}
      >
        安装
      </Button>
    </div>
  );
}
