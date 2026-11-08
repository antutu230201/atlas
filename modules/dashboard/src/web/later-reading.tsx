'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScreenIcon } from './icons';
import type { HotItem } from './types';

const STORAGE_KEY = 'atlas.later-reading';
const MAX_ITEMS = 20;

export interface LaterItem {
  title: string;
  url: string;
  /** 来源 key（weibo / douyin / bilibili），展示用 */
  source: string;
  addedAt: number;
}

/**
 * 「稍后读」收藏：设备级 localStorage（个人偏好，不入库不上云）。
 * 挂墙场景看到感兴趣但没空点的热榜，标记一下稍后打开。
 */
export function useLaterReading(sourceLabels: Record<string, string>) {
  const [items, setItems] = useState<LaterItem[]>([]);

  // 首帧后读 localStorage（避免 SSR hydration 不一致）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as LaterItem[]);
    } catch {
      // 隐私模式等场景忽略
    }
  }, []);

  const persist = useCallback((next: LaterItem[]) => {
    setItems(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 写不进去只影响下次打开
    }
  }, []);

  /** 同 URL 去重；超过 20 条挤掉最早的；无链接条目不可收藏 */
  const add = useCallback((item: HotItem, source: string) => {
    setItems((prev) => {
      if (!item.url || prev.some((entry) => entry.url === item.url)) return prev;
      const next: LaterItem[] = [
        { title: item.title, url: item.url, source, addedAt: Date.now() },
        ...prev,
      ].slice(0, MAX_ITEMS);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 忽略
      }
      return next;
    });
  }, []);

  const remove = useCallback(
    (item: LaterItem) => {
      persist(items.filter((entry) => entry.url !== item.url));
    },
    [items, persist],
  );

  const has = useCallback(
    (item: HotItem) => items.some((entry) => entry.url === item.url),
    [items],
  );

  return { items, add, remove, has, labelOf: (key: string) => sourceLabels[key] ?? key };
}

/** 行内「稍后读」按钮：hover 显形，已收藏时常显对勾 */
export function LaterPinButton({
  item,
  source,
  saved,
  onAdd,
}: {
  item: HotItem;
  source: string;
  saved: boolean;
  onAdd: (item: HotItem, source: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={saved ? '已在稍后读' : '加入稍后读'}
      title={saved ? '已在稍后读' : '稍后读'}
      onClick={(event) => {
        // 在热榜链接 <a> 内：阻止跳转
        event.preventDefault();
        event.stopPropagation();
        if (!saved) onAdd(item, source);
      }}
      className={`shrink-0 rounded-xs p-0.5 transition-opacity ${
        saved
          ? 'text-primary opacity-100'
          : 'text-muted opacity-0 group-hover:opacity-100 hover:text-primary'
      }`}
    >
      <ScreenIcon name={saved ? 'check' : 'plus'} className="size-3" />
    </button>
  );
}

/** 热榜标题旁的「稍后读」徽章 + 展开面板 */
export function LaterReadingPanel({
  items,
  onRemove,
  labelOf,
}: {
  items: LaterItem[];
  onRemove: (item: LaterItem) => void;
  labelOf: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
          items.length > 0
            ? 'bg-primary-soft text-primary'
            : 'border border-border text-muted hover:text-text'
        }`}
        aria-label={`稍后读，${items.length} 条`}
      >
        <ScreenIcon name="pin" className="size-3" /> 稍后读 {items.length}
      </button>

      {open ? (
        <div className="screen-card absolute right-0 top-9 z-40 w-80 p-0 shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold">稍后读</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xs p-0.5 text-muted hover:text-text"
              aria-label="关闭稍后读"
            >
              <ScreenIcon name="close" className="size-3" />
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-muted">
              看到感兴趣的热榜点行尾「＋」，稍后在这里打开。
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.url}
                  className="flex items-start gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
                >
                  <span className="mt-0.5 shrink-0 rounded-full border border-border px-1.5 text-[9px] leading-4 text-muted">
                    {labelOf(item.source)}
                  </span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="min-w-0 flex-1 truncate text-[12px] leading-5 text-text hover:text-primary"
                    title={item.title}
                    onClick={() => {
                      // 打开即视为处理完：从列表移除
                      onRemove(item);
                      setOpen(false);
                    }}
                  >
                    {item.title}
                  </a>
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    aria-label={`移除 ${item.title}`}
                    className="shrink-0 rounded-xs p-0.5 text-muted transition-colors hover:text-err"
                  >
                    <ScreenIcon name="close" className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
