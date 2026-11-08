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

type SearchStatus = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

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
  const workspaceSlug = workspace?.slug;
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const canSearchTodos = modules.data?.some((module) => module.name === 'todo_notes') ?? false;

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!open || normalizedQuery.length < 2 || !workspaceSlug) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }
    if (modules.isError) {
      setSearchResults([]);
      setSearchStatus('error');
      return;
    }
    if (!modules.data) return;
    if (!canSearchTodos) {
      setSearchResults([]);
      setSearchStatus('unavailable');
      return;
    }

    const controller = new AbortController();
    setSearchResults([]);
    setSearchStatus('loading');
    const timer = setTimeout(() => {
      api<{ results: SearchResult[] }>(
        `/modules/workspaces/${workspaceSlug}/todo_notes/call/search`,
        { method: 'POST', json: { q: normalizedQuery }, signal: controller.signal },
      )
        .then((res) => {
          setSearchResults(res.results ?? []);
          setSearchStatus('success');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setSearchResults([]);
          setSearchStatus('error');
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, workspaceSlug, modules.isError, canSearchTodos]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setCursor(0);
      setSearchResults([]);
      setSearchStatus('idle');
    }
  }, [open]);

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
    for (const module of modules.data ?? []) {
      for (const route of module.routes) {
        items.push({
          label: `${module.title} · ${route.title}`,
          hint: module.name,
          keywords: `${module.name} ${module.title} ${route.title}`,
          run: () => router.push(`/m/${module.name}/${route.path}`),
        });
      }
    }
    return items;
  }, [modules.data, router]);

  const filtered = commands.filter((command) =>
    command.keywords.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectableCount = filtered.length + searchResults.length;
  const activeIndex = selectableCount === 0 ? -1 : Math.min(cursor, selectableCount - 1);
  const activeOptionId = activeIndex < 0 ? undefined : `command-option-${activeIndex}`;

  const runSelection = (index: number) => {
    if (index < filtered.length) {
      filtered[index]?.run();
    } else {
      const result = searchResults[index - filtered.length];
      if (!result) return;
      router.push(result.href);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 p-0">
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && selectableCount > 0) {
              event.preventDefault();
              setCursor((current) => Math.min(current + 1, selectableCount - 1));
            }
            if (event.key === 'ArrowUp' && selectableCount > 0) {
              event.preventDefault();
              setCursor((current) => Math.max(current - 1, 0));
            }
            if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault();
              runSelection(activeIndex);
            }
          }}
          placeholder="搜索页面、待办…"
          aria-label="命令搜索"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={selectableCount > 0}
          aria-controls="command-results"
          aria-activedescendant={activeOptionId}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text placeholder:text-muted focus-visible:outline-none"
        />
        <ul
          id="command-results"
          role="listbox"
          aria-label="搜索结果"
          className="max-h-72 overflow-y-auto p-1"
        >
          {filtered.map((command, index) => (
            <li key={`nav-${index}`}>
              <button
                id={`command-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors',
                  index === activeIndex
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-text hover:bg-surface-hover',
                )}
                onClick={() => runSelection(index)}
                onMouseEnter={() => setCursor(index)}
              >
                {command.label}
                {command.hint ? <span className="text-xs text-muted">{command.hint}</span> : null}
              </button>
            </li>
          ))}
          {searchResults.length > 0 ? (
            <>
              <li
                role="presentation"
                className="px-3 pb-1 pt-3 text-[11px] font-semibold tracking-widest text-muted"
              >
                待办搜索
              </li>
              {searchResults.map((result, index) => {
                const optionIndex = filtered.length + index;
                return (
                  <li key={`search-${index}`}>
                    <button
                      id={`command-option-${optionIndex}`}
                      type="button"
                      role="option"
                      aria-selected={optionIndex === activeIndex}
                      className={cn(
                        'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors',
                        optionIndex === activeIndex
                          ? 'bg-primary-soft font-medium text-primary'
                          : 'text-text hover:bg-surface-hover',
                      )}
                      onClick={() => runSelection(optionIndex)}
                      onMouseEnter={() => setCursor(optionIndex)}
                    >
                      {result.label}
                      <span className="text-xs text-muted">{result.hint}</span>
                    </button>
                  </li>
                );
              })}
            </>
          ) : null}
          {searchStatus === 'loading' ? (
            <li className="px-3 py-2 text-sm text-muted" role="status">
              正在搜索待办…
            </li>
          ) : null}
          {searchStatus === 'error' ? (
            <li className="px-3 py-2 text-sm text-err" role="alert">
              待办搜索暂时不可用，请稍后重试。
            </li>
          ) : null}
          {searchStatus === 'unavailable' ? (
            <li className="px-3 py-2 text-sm text-muted" role="status">
              启用「待办与笔记」模块后可搜索待办。
            </li>
          ) : null}
          {searchStatus === 'success' && searchResults.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">没有找到待办</li>
          ) : null}
          {filtered.length === 0 && query.trim().length === 1 ? (
            <li className="px-3 py-2 text-sm text-muted">再输入一个字以搜索页面</li>
          ) : null}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
          ↑↓ 选择 · Enter 确认 · Esc 关闭
        </p>
      </DialogContent>
    </Dialog>
  );
}
