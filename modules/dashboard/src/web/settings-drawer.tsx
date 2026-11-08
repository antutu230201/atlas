'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  Input,
  Switch,
  XIcon,
  useToast,
} from '@atlas/ui';
import { api } from '@/lib/api';
import {
  HOT_SOURCE_LABELS,
  type CitySetting,
  type CitySuggestion,
  type CountdownItem,
  type DetectedLocation,
} from './types';

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  moduleName: string;
  city: CitySetting | null;
  sources: Record<string, boolean>;
  wallpaper: boolean;
  /** 关注词：命中的热榜标题会高亮 */
  watchWords: string[];
  /** 护屏偏好（设备级，存 localStorage） */
  antiBurnIn: boolean;
  nightAuto: boolean;
  onToggleAntiBurnIn: () => void;
  onToggleNightAuto: () => void;
  /** 任一设置变更后回调（父级失效 snapshot 查询） */
  onAfterChange: () => void;
}

/** 大屏设置抽屉：城市（定位/搜索）、热榜源开关、壁纸开关、已删除倒计时恢复 */
export function SettingsDrawer({
  open,
  onOpenChange,
  workspaceSlug,
  moduleName,
  city,
  sources,
  wallpaper,
  watchWords,
  antiBurnIn,
  nightAuto,
  onToggleAntiBurnIn,
  onToggleNightAuto,
  onAfterChange,
}: SettingsDrawerProps) {
  const { toast } = useToast();
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitySuggestion[]>([]);
  const [detected, setDetected] = useState<DetectedLocation | null>(null);
  const [trash, setTrash] = useState<CountdownItem[] | null>(null);
  const [wordInput, setWordInput] = useState('');

  const fail = (e: Error) => toast({ title: '操作失败', description: e.message, variant: 'err' });

  const detect = useMutation({
    mutationFn: () =>
      api<{ location: DetectedLocation }>(`${base}/detectLocation`, { method: 'POST', json: {} }),
    onSuccess: (data) => setDetected(data.location),
    onError: fail,
  });

  const search = useMutation({
    mutationFn: (q: string) =>
      api<{ cities: CitySuggestion[] }>(`${base}/searchCity`, { method: 'POST', json: { q } }),
    onSuccess: (data) => setResults(data.cities),
    onError: fail,
  });

  const setCity = useMutation({
    mutationFn: (input: CitySetting) => api(`${base}/setCity`, { method: 'POST', json: input }),
    onSuccess: () => {
      onAfterChange();
      onOpenChange(false);
      toast({ title: '城市已更新', variant: 'ok' });
    },
    onError: fail,
  });

  const setOptions = useMutation({
    mutationFn: (patch: {
      sources?: Record<string, boolean>;
      wallpaper?: boolean;
      watchWords?: string[];
    }) => api(`${base}/setOptions`, { method: 'POST', json: patch }),
    onSuccess: onAfterChange,
    onError: fail,
  });

  const loadTrash = useMutation({
    mutationFn: () =>
      api<{ countdowns: CountdownItem[] }>(`${base}/listCountdowns`, {
        method: 'POST',
        json: { includeDeleted: true },
      }),
    onSuccess: (data) => setTrash(data.countdowns.filter((c) => c.deletedAt !== null)),
    onError: fail,
  });

  const restore = useMutation({
    mutationFn: (id: string) => api(`${base}/restoreCountdown`, { method: 'POST', json: { id } }),
    onSuccess: () => {
      onAfterChange();
      void loadTrash.mutateAsync();
    },
    onError: fail,
  });

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  // 回收站懒加载：每次打开抽屉都重新拉取（首次自动弹出时可能还没有删除项）
  useEffect(() => {
    if (open && !loadTrash.isPending) loadTrash.mutate();
  }, [open]);

  const addWord = () => {
    const word = wordInput.trim();
    if (word.length === 0 || watchWords.length >= 20 || watchWords.includes(word)) return;
    setOptions.mutate({ watchWords: [...watchWords, word] });
    setWordInput('');
  };

  const removeWord = (word: string) => {
    setOptions.mutate({ watchWords: watchWords.filter((item) => item !== word) });
  };

  const applyDetected = detected
    ? () => setCity.mutate({ name: detected.city, lat: detected.lat, lon: detected.lon })
    : undefined;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent side="right" className="w-80 max-w-[88vw]">
        <DrawerHeader>
          <DrawerTitle>大屏设置</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="space-y-6">
          {/* 城市 */}
          <section aria-label="天气城市">
            <p className="mb-2 text-xs font-semibold text-muted">天气城市</p>
            <p className="mb-2 text-sm">
              当前：
              {city ? `${city.name}（${city.lat.toFixed(2)}, ${city.lon.toFixed(2)}）` : '未设置'}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={detect.isPending}
                onClick={() => detect.mutate()}
              >
                定位我
              </Button>
              {detected && applyDetected ? (
                <Button size="sm" loading={setCity.isPending} onClick={applyDetected}>
                  使用：{detected.city}
                </Button>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索城市，如：杭州"
                aria-label="搜索城市"
              />
              <Button
                size="sm"
                variant="secondary"
                loading={search.isPending}
                disabled={query.trim().length === 0}
                onClick={() => search.mutate(query.trim())}
              >
                搜索
              </Button>
            </div>
            {results.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {results.slice(0, 6).map((item) => (
                  <li key={`${item.lat},${item.lon}`}>
                    <button
                      type="button"
                      className="w-full rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover"
                      onClick={() =>
                        setCity.mutate({ name: item.name, lat: item.lat, lon: item.lon })
                      }
                    >
                      <span className="font-semibold">{item.name}</span>
                      <span className="ml-1 text-muted">
                        {item.admin ?? ''} {item.country ?? ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* 热榜源开关 */}
          <section aria-label="热榜数据源">
            <p className="mb-2 text-xs font-semibold text-muted">热榜数据源</p>
            <ul className="space-y-2">
              {Object.entries(HOT_SOURCE_LABELS).map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={sources[key] !== false}
                    onCheckedChange={(checked) =>
                      setOptions.mutate({ sources: { ...sources, [key]: checked } })
                    }
                    aria-label={`启用或停用${label}`}
                  />
                </li>
              ))}
            </ul>
          </section>

          {/* 关注词 */}
          <section aria-label="关注词">
            <p className="mb-1 text-xs font-semibold text-muted">关注词</p>
            <p className="mb-2 text-[11px] text-muted">命中的热榜标题会高亮，最多 20 个。</p>
            <div className="flex gap-2">
              <Input
                value={wordInput}
                onChange={(e) => setWordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addWord();
                  }
                }}
                placeholder="如：AI、足球、新番"
                aria-label="添加关注词"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={wordInput.trim().length === 0 || watchWords.length >= 20}
                onClick={addWord}
              >
                添加
              </Button>
            </div>
            {watchWords.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {watchWords.map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => removeWord(word)}
                    className="group inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5 text-[11px] transition-colors hover:border-err/40"
                    title="点击移除"
                  >
                    {word}
                    <XIcon className="size-3 text-muted group-hover:text-err" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted">还没有关注词。</p>
            )}
          </section>

          {/* 壁纸 */}
          <section aria-label="氛围壁纸">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">必应每日壁纸背景</span>
              <Switch
                checked={wallpaper}
                onCheckedChange={(checked) => setOptions.mutate({ wallpaper: checked })}
                aria-label="启用或停用壁纸背景"
              />
            </div>
          </section>

          {/* 显示与护屏：设备级偏好，长时间挂墙时的刚需 */}
          <section aria-label="显示与护屏">
            <p className="mb-1 text-xs font-semibold text-muted">显示与护屏</p>
            <p className="mb-3 text-[11px] text-muted">只对这台设备生效，适合整天挂着。</p>
            <ul className="space-y-3">
              <li className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">防烧屏微位移</p>
                  <p className="mt-0.5 text-[11px] text-muted">每 90 秒在 3px 内缓慢移动</p>
                </div>
                <Switch
                  checked={antiBurnIn}
                  onCheckedChange={() => onToggleAntiBurnIn()}
                  aria-label="防烧屏微位移"
                />
              </li>
              <li className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">夜间自动压暗</p>
                  <p className="mt-0.5 text-[11px] text-muted">22:00–07:00 降低整体亮度</p>
                </div>
                <Switch
                  checked={nightAuto}
                  onCheckedChange={() => onToggleNightAuto()}
                  aria-label="夜间自动压暗"
                />
              </li>
            </ul>
          </section>

          {/* 已删除倒计时 */}
          <section aria-label="已删除倒计时">
            <p className="mb-2 text-xs font-semibold text-muted">已删除倒计时</p>
            {loadTrash.isPending ? <p className="text-xs text-muted">加载中…</p> : null}
            {trash !== null && trash.length === 0 ? (
              <p className="text-xs text-muted">回收站为空。</p>
            ) : null}
            {trash !== null && trash.length > 0 ? (
              <ul className="space-y-1">
                {trash.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                      <span className="ml-1 text-[11px] text-muted">{item.targetDate}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={restore.isPending}
                      onClick={() => restore.mutate(item.id)}
                    >
                      恢复
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <p className="text-center text-[11px] text-muted">
            不在输入框时，按 <kbd className="rounded-xs border border-border px-1 font-mono">?</kbd>{' '}
            查看键盘快捷键
          </p>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
