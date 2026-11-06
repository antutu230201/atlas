'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDocumentPictureInPicture,
  openLyricsPip,
  type PipLyricsController,
  type PipLyricsState,
} from './lyrics-pip';
import { ScreenIcon } from './icons';

export interface LyricLine {
  time: number;
  text: string;
}

interface DesktopLyricsProps {
  trackTitle: string;
  artist: string;
  currentTime: number;
  lines: LyricLine[];
  loading: boolean;
  error: boolean;
  onSeek: (time: number) => void;
  onClose: () => void;
}

interface Position {
  x: number;
  y: number;
}

type FontSize = 'sm' | 'md' | 'lg';
type LyricOpacity = 'soft' | 'normal' | 'strong';

interface LyricSettings {
  lineCount: 1 | 2;
  fontSize: FontSize;
  opacity: LyricOpacity;
  locked: boolean;
}

const POSITION_KEY = 'atlas.dashboard.lyrics-position';
const COLOR_KEY = 'atlas.dashboard.lyrics-color';
const SETTINGS_KEY = 'atlas.dashboard.lyrics-settings';
const DEFAULT_CUSTOM_COLOR = '#aa9bff';
const DEFAULT_SETTINGS: LyricSettings = {
  lineCount: 2,
  fontSize: 'md',
  opacity: 'normal',
  locked: false,
};

const COLOR_PRESETS: Array<{ name: string; value: string | null }> = [
  { name: '主题色', value: null },
  { name: '青色', value: 'var(--screen-cyan)' },
  { name: '桃色', value: 'var(--screen-peach)' },
  { name: '粉色', value: 'var(--screen-pink)' },
  { name: '绿色', value: 'var(--screen-lime)' },
];

const FONT_CLASSES: Record<FontSize, { current: string; next: string; pip: number }> = {
  sm: {
    current: 'text-[20px] leading-8 md:text-[22px] md:leading-9',
    next: 'text-[12px] leading-5',
    pip: 22,
  },
  md: {
    current: 'text-[24px] leading-9 md:text-[28px] md:leading-10',
    next: 'text-[14px] leading-6',
    pip: 26,
  },
  lg: {
    current: 'text-[28px] leading-10 md:text-[32px] md:leading-[46px]',
    next: 'text-[16px] leading-7',
    pip: 30,
  },
};

const OPACITY_VALUES: Record<LyricOpacity, number> = {
  soft: 0.55,
  normal: 0.82,
  strong: 1,
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function OptionGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <div className="flex rounded-sm border border-border p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-xs px-2 py-1 text-[11px] transition-colors ${
              value === option.value ? 'bg-primary-soft text-primary' : 'text-muted hover:text-text'
            }`}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 两行桌面歌词：当前句 + 下一句，无底板；可拖动、换色、调字号/透明度/单双行。
 * 「置顶小窗」使用 Document Picture-in-Picture，能覆盖其他应用，受浏览器支持限制。
 */
export function DesktopLyrics({
  trackTitle,
  artist,
  currentTime,
  lines,
  loading,
  error,
  onSeek,
  onClose,
}: DesktopLyricsProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const pipRef = useRef<PipLyricsController | null>(null);
  const seekRef = useRef(onSeek);
  const [position, setPosition] = useState<Position | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState(DEFAULT_CUSTOM_COLOR);
  const [settings, setSettings] = useState<LyricSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipOpen, setPipOpen] = useState(false);
  const [pipNotice, setPipNotice] = useState('');

  seekRef.current = onSeek;

  const clamp = useCallback((x: number, y: number): Position => {
    const width = cardRef.current?.offsetWidth ?? Math.min(460, window.innerWidth - 24);
    const height = cardRef.current?.offsetHeight ?? 132;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
      // 顶部留 40px，拖动后抓手不会跑出视口。
      y: Math.min(Math.max(40, y), Math.max(40, window.innerHeight - height - 8)),
    };
  }, []);

  useEffect(() => {
    setPipSupported(Boolean(getDocumentPictureInPicture()));
    let stored: Position | null = null;
    try {
      const raw = window.localStorage.getItem(POSITION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Position>;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          stored = { x: Number(parsed.x), y: Number(parsed.y) };
        }
      }
      const savedColor = window.localStorage.getItem(COLOR_KEY);
      if (savedColor === 'theme') setColor(null);
      else if (savedColor && /^(#[0-9a-f]{6}|var\(--screen-[a-z]+\))$/i.test(savedColor)) {
        setColor(savedColor);
        if (/^#[0-9a-f]{6}$/i.test(savedColor)) setCustomColor(savedColor);
      }
      const savedSettings = window.localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings) as Partial<LyricSettings>;
        setSettings({
          lineCount: parsed.lineCount === 1 ? 1 : 2,
          fontSize: parsed.fontSize === 'sm' || parsed.fontSize === 'lg' ? parsed.fontSize : 'md',
          opacity:
            parsed.opacity === 'soft' || parsed.opacity === 'strong' ? parsed.opacity : 'normal',
          locked: parsed.locked === true,
        });
      }
    } catch {
      // 无痕模式或旧版本脏数据：使用默认设置。
    }
    setPosition(
      stored
        ? clamp(stored.x, stored.y)
        : clamp(
            window.innerWidth - Math.min(460, window.innerWidth - 24) - 24,
            Math.round(window.innerHeight * 0.24),
          ),
    );
  }, [clamp]);

  useEffect(() => {
    const onResize = () => setPosition((current) => (current ? clamp(current.x, current.y) : null));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // 齿轮自己负责 toggle；否则 pointerdown 先关、click 又开，按钮会失效。
      if (settingsButtonRef.current?.contains(target)) return;
      if (!settingsRef.current?.contains(target)) setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [settingsOpen]);

  useEffect(
    () => () => {
      pipRef.current?.close();
      pipRef.current = null;
    },
    [],
  );

  const activeIndex = useMemo(() => {
    let low = 0;
    let high = lines.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const line = lines[middle];
      if (line && line.time <= currentTime) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }, [lines, currentTime]);

  const isIntro = activeIndex < 0 && lines.length > 0;
  const activeLine = lines[Math.max(activeIndex, 0)];
  const nextLine = lines[Math.max(activeIndex, 0) + 1];
  const activeColor = color ?? 'var(--screen-accent)';
  const fontClass = FONT_CLASSES[settings.fontSize];
  const activeOpacity = OPACITY_VALUES[settings.opacity];

  const resolveColor = useCallback((value: string) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    probe.style.position = 'fixed';
    probe.style.opacity = '0';
    probe.style.pointerEvents = 'none';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, []);

  const activeText = activeLine?.text;
  const activeTime = activeLine?.time;
  const nextText = settings.lineCount === 2 ? nextLine?.text : undefined;
  const nextTime = nextLine?.time;

  const buildPipState = useCallback(
    (): PipLyricsState => ({
      currentText: activeText ?? '♪',
      nextText: nextText ?? '',
      currentSeek: activeTime ?? null,
      nextSeek: nextTime ?? null,
      color: resolveColor(activeColor),
      currentFontSize: fontClass.pip,
      opacity: activeOpacity,
      showNext: settings.lineCount === 2,
    }),
    [
      activeText,
      activeTime,
      nextText,
      nextTime,
      activeColor,
      fontClass.pip,
      activeOpacity,
      settings.lineCount,
      resolveColor,
    ],
  );

  useEffect(() => {
    if (pipOpen) pipRef.current?.update(buildPipState());
  }, [pipOpen, buildPipState]);

  const updateSettings = (patch: Partial<LyricSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // 偏好保存失败不影响本次修改。
      }
      return next;
    });
  };

  const applyColor = (value: string | null) => {
    setColor(value);
    if (value && /^#[0-9a-f]{6}$/i.test(value)) setCustomColor(value);
    try {
      window.localStorage.setItem(COLOR_KEY, value ?? 'theme');
    } catch {
      // 偏好保存失败不影响本次修改。
    }
  };

  const togglePip = async () => {
    if (pipRef.current) {
      pipRef.current.close();
      pipRef.current = null;
      setPipOpen(false);
      return;
    }
    setPipNotice('');
    try {
      const controller = await openLyricsPip(buildPipState(), {
        onSeek: (time) => seekRef.current(time),
        onClosed: () => {
          pipRef.current = null;
          setPipOpen(false);
        },
      });
      pipRef.current = controller;
      setPipOpen(true);
    } catch (cause) {
      setPipNotice(cause instanceof Error ? cause.message : '桌面歌词小窗打开失败');
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || settings.locked) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clamp(event.clientX - drag.offsetX, event.clientY - drag.offsetY));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    try {
      window.localStorage.setItem(
        POSITION_KEY,
        JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }),
      );
    } catch {
      // 位置保存失败不影响拖动。
    }
  };

  return (
    <div
      ref={cardRef}
      className="group/lyrics pointer-events-none fixed z-40 w-[min(460px,calc(100vw-1.5rem))] cursor-default select-none"
      style={position ? { left: position.x, top: position.y } : { visibility: 'hidden' }}
      role="region"
      aria-label="桌面歌词"
      data-testid="desktop-lyrics"
    >
      <div
        aria-hidden
        className="screen-lyrics-scrim pointer-events-none absolute -inset-5 -z-10"
      />
      <span className="sr-only">
        {trackTitle} · {artist}
      </span>

      <div className="pointer-events-none absolute inset-x-0 -top-9 z-20 flex justify-center">
        <div
          className={`pointer-events-auto relative flex items-center gap-1 rounded-full border border-border/50 bg-surface/45 px-2.5 py-1 text-[9px] text-muted opacity-80 backdrop-blur-md transition-opacity duration-200 hover:bg-surface/80 hover:opacity-100 md:opacity-70 md:group-hover/lyrics:opacity-100 md:focus-within:opacity-100 ${
            settings.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          }`}
          data-testid="lyrics-drag-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <ScreenIcon name="grip" className="size-3.5" />
          <span>{settings.locked ? '已锁定' : '拖动歌词'}</span>
          <span className="mx-0.5 h-3 w-px bg-border" aria-hidden />
          {pipSupported ? (
            <button
              type="button"
              className={`flex size-5 items-center justify-center rounded-full transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-primary ${
                pipOpen ? 'text-primary' : ''
              }`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => void togglePip()}
              aria-label="桌面歌词小窗"
              aria-pressed={pipOpen}
              title={pipOpen ? '关闭置顶歌词小窗' : '弹出置顶歌词小窗'}
            >
              <ScreenIcon name="pip" className="size-3" />
            </button>
          ) : null}
          <button
            ref={settingsButtonRef}
            type="button"
            className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="歌词设置"
            aria-expanded={settingsOpen}
            title="歌词设置"
          >
            <ScreenIcon name="settings" className="size-3" />
          </button>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            aria-label="关闭桌面歌词"
            title="关闭桌面歌词"
          >
            <ScreenIcon name="collapse" className="size-3" />
          </button>

          {settingsOpen ? (
            <div
              ref={settingsRef}
              className="pointer-events-auto absolute top-full right-0 z-30 mt-2 w-[272px] space-y-2.5 rounded-md border border-border bg-[var(--screen-panel-solid)] p-3 text-left shadow-soft"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <OptionGroup
                label="显示行数"
                value={String(settings.lineCount)}
                options={[
                  { value: '1', label: '单行' },
                  { value: '2', label: '双行' },
                ]}
                onChange={(value) => updateSettings({ lineCount: value === '1' ? 1 : 2 })}
              />
              <OptionGroup
                label="字号"
                value={settings.fontSize}
                options={[
                  { value: 'sm', label: '小' },
                  { value: 'md', label: '中' },
                  { value: 'lg', label: '大' },
                ]}
                onChange={(value) => updateSettings({ fontSize: value as FontSize })}
              />
              <OptionGroup
                label="透明度"
                value={settings.opacity}
                options={[
                  { value: 'soft', label: '柔和' },
                  { value: 'normal', label: '标准' },
                  { value: 'strong', label: '清晰' },
                ]}
                onChange={(value) => updateSettings({ opacity: value as LyricOpacity })}
              />

              <div className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-[12px] text-muted">颜色</span>
                <div className="flex items-center gap-1">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className={`flex size-5 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary ${
                        color === preset.value ? 'ring-2 ring-primary/60' : ''
                      }`}
                      onClick={() => applyColor(preset.value)}
                      aria-label={`歌词颜色：${preset.name}`}
                      aria-pressed={color === preset.value}
                      title={preset.name}
                    >
                      <span
                        className="size-3.5 rounded-full border border-border/70"
                        style={{ background: preset.value ?? 'var(--screen-accent)' }}
                      />
                    </button>
                  ))}
                  <label
                    className="relative flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-surface-hover"
                    title="自定义颜色"
                  >
                    <span
                      className="size-3.5 rounded-full border border-border/70"
                      style={{
                        background: `conic-gradient(#ff6b6b, #ffd166, #72e2e7, #aa9bff, #ff6b6b)`,
                      }}
                      aria-hidden
                    />
                    <input
                      type="color"
                      value={customColor}
                      onChange={(event) => applyColor(event.target.value)}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                      aria-label="自定义歌词颜色"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <span className="text-[12px] text-muted">锁定页面位置</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.locked}
                  aria-label="锁定页面位置"
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    settings.locked ? 'bg-primary' : 'bg-border'
                  }`}
                  onClick={() => updateSettings({ locked: !settings.locked })}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-surface transition-transform ${
                      settings.locked ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-border pt-2.5">
                <button
                  type="button"
                  className="screen-icon-button w-full !justify-center !min-h-8 !text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void togglePip()}
                  disabled={!pipSupported}
                >
                  <ScreenIcon name="pip" className="size-3.5" />
                  {pipOpen ? '关闭置顶歌词' : '弹出置顶歌词'}
                </button>
                <p className="mt-1.5 text-[10px] leading-4 text-muted/70">
                  {pipSupported
                    ? '置顶小窗可覆盖其他应用；浏览器标题栏无法隐藏。'
                    : '当前浏览器不支持置顶小窗，请使用 Chrome / Edge 桌面版。'}
                </p>
                {pipNotice ? <p className="mt-1 text-[9px] text-warn">{pipNotice}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="pointer-events-auto flex flex-col items-center gap-1 px-2 py-3 text-center"
        style={{ opacity: activeOpacity }}
      >
        {loading ? (
          <p className="screen-lyric-text py-2 text-sm text-muted">歌词加载中…</p>
        ) : error ? (
          <p className="screen-lyric-text py-2 text-sm text-warn">歌词加载失败，请稍后重试</p>
        ) : lines.length === 0 ? (
          <p className="screen-lyric-text py-2 text-sm text-muted">这首歌暂时没有同步歌词</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => activeLine && onSeek(activeLine.time)}
              className={`screen-lyric-text max-w-full rounded-xs px-2 py-1 font-semibold tracking-tight transition-colors focus-visible:outline-2 focus-visible:outline-primary ${fontClass.current} ${
                isIntro ? 'opacity-75' : ''
              }`}
              style={{ color: activeColor }}
              aria-label={
                activeLine ? `回到 ${formatTime(activeLine.time)}：${activeLine.text}` : undefined
              }
            >
              {activeLine?.text ?? '♪'}
            </button>
            {settings.lineCount === 2 && nextLine ? (
              <button
                type="button"
                onClick={() => onSeek(nextLine.time)}
                className={`screen-lyric-text max-w-full rounded-xs px-2 py-0.5 opacity-40 transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-primary ${fontClass.next}`}
                style={{ color: activeColor }}
                aria-label={`跳到 ${formatTime(nextLine.time)}：${nextLine.text}`}
              >
                {nextLine.text}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
