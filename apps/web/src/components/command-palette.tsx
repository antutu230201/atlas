'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, cn } from '@atlas/ui';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useEnabledModules } from '@/lib/queries';

interface CommandItem {
  label: string;
  hint?: string;
  keywords: string;
  run: () => void;
}

/**
 * 全局命令面板（Ctrl/Cmd + K）：
 * 导航到任意页面 / 模块路由。开关由外壳控制（paletteOpen + onOpenChange）。
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const { workspace } = useActiveWorkspace();
  const modules = useEnabledModules(workspace?.slug ?? null);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { label: '今天', keywords: 'home today 今天', run: () => router.push('/') },
      {
        label: '设置',
        keywords: 'settings 设置 成员 模块 审计',
        run: () => router.push('/settings'),
      },
      { label: '通知', keywords: 'notifications 通知', run: () => router.push('/notifications') },
    ];
    for (const m of modules.data ?? []) {
      for (const route of m.routes) {
        items.push({
          label: `${m.title} · ${route.title}`,
          hint: m.name,
          keywords: `${m.name} ${m.title} ${route.title}`,
          run: () => router.push(`/m/${m.name}/${route.path}`),
        });
      }
    }
    return items;
  }, [modules.data, router]);

  const filtered = commands.filter((c) => c.keywords.toLowerCase().includes(query.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 p-0">
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, filtered.length - 1));
            if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
            if (e.key === 'Enter' && filtered[cursor]) {
              filtered[cursor].run();
              onOpenChange(false);
            }
          }}
          placeholder="搜索页面与操作…"
          aria-label="命令搜索"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text placeholder:text-muted focus-visible:outline-none"
        />
        <ul className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">没有匹配结果</li>
          ) : (
            filtered.map((command, index) => (
              <li key={`${command.label}-${index}`}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors',
                    index === cursor
                      ? 'bg-primary-soft font-medium text-primary'
                      : 'text-text hover:bg-surface-hover',
                  )}
                  onClick={() => {
                    command.run();
                    onOpenChange(false);
                  }}
                  onMouseEnter={() => setCursor(index)}
                >
                  {command.label}
                  {command.hint ? <span className="text-xs text-muted">{command.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
          ↑↓ 选择 · Enter 确认 · Esc 关闭
        </p>
      </DialogContent>
    </Dialog>
  );
}
