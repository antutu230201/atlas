'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, cn } from '@atlas/ui';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useEnabledModules } from '@/lib/queries';
import { api } from '@/lib/api';

interface CommandItem {
  label: string;
  hint?: string;
  keywords: string;
  run: () => void;
}

interface SearchResult {
  label: string;
  hint: string;
  href: string;
}

/** 全局命令面板（Ctrl/Cmd + K）：导航 + 模块搜索 */
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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!open || query.length < 2 || !workspace) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<{ results: SearchResult[] }>(
        `/modules/workspaces/${workspace.slug}/todo_notes/call/search`,
        { method: 'POST', json: { q: query } },
      )
        .then((res) => setSearchResults(res.results ?? []))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, workspace]);

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

  const hasSearchResults = query.length >= 2 && searchResults.length > 0;

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
            if (e.key === 'Enter') {
              if (filtered[cursor]) {
                filtered[cursor].run();
                onOpenChange(false);
              } else if (hasSearchResults && searchResults[0]) {
                router.push(searchResults[0].href);
                onOpenChange(false);
              }
            }
          }}
          placeholder="搜索页面、待办…"
          aria-label="命令搜索"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text placeholder:text-muted focus-visible:outline-none"
        />
        <ul className="max-h-72 overflow-y-auto p-1">
          {filtered.map((command, index) => (
            <li key={`nav-${index}`}>
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
          ))}
          {hasSearchResults ? (
            <>
              <li className="px-3 pb-1 pt-3 text-[11px] font-semibold tracking-widest text-muted">
                待办搜索
              </li>
              {searchResults.map((result, index) => (
                <li key={`search-${index}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-hover"
                    onClick={() => {
                      router.push(result.href);
                      onOpenChange(false);
                    }}
                  >
                    {result.label}
                    <span className="text-xs text-muted">{result.hint}</span>
                  </button>
                </li>
              ))}
            </>
          ) : null}
          {filtered.length === 0 && !hasSearchResults && query.length > 0 ? (
            <li className="px-3 py-2 text-sm text-muted">没有匹配结果</li>
          ) : null}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
          ↑↓ 选择 · Enter 确认 · Esc 关闭
        </p>
      </DialogContent>
    </Dialog>
  );
}
