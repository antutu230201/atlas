export interface PipLyricsState {
  currentText: string;
  nextText: string;
  currentSeek: number | null;
  nextSeek: number | null;
  color: string;
  currentFontSize: number;
  opacity: number;
  showNext: boolean;
}

interface DocumentPictureInPictureApi {
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }): Promise<Window>;
  window: Window | null;
}

export interface PipLyricsController {
  window: Window;
  update(state: PipLyricsState): void;
  close(): void;
}

export function getDocumentPictureInPicture(): DocumentPictureInPictureApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { documentPictureInPicture?: DocumentPictureInPictureApi })
    .documentPictureInPicture;
  return api && typeof api.requestWindow === 'function' ? api : null;
}

function readThemeVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
) {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  return element;
}

/**
 * Document Picture-in-Picture 桌面歌词窗：由浏览器提供一个置顶窗口，可覆盖其他应用。
 * 限制来自浏览器本身：必有标题栏、Safari/移动端不支持、同一标签页只能有一个。
 */
export async function openLyricsPip(
  initial: PipLyricsState,
  handlers: { onSeek: (time: number) => void; onClosed: () => void },
): Promise<PipLyricsController> {
  const api = getDocumentPictureInPicture();
  if (!api) throw new Error('当前浏览器不支持桌面歌词小窗');
  if (api.window) {
    api.window.focus();
    throw new Error('桌面歌词小窗已经打开');
  }

  const pipWindow = await api.requestWindow({
    width: 640,
    height: 176,
    disallowReturnToOpener: true,
  });
  const doc = pipWindow.document;
  doc.title = 'Atlas 桌面歌词';

  const theme = {
    bg: readThemeVar('--screen-bg', '#080a11'),
    text: readThemeVar('--screen-text', '#f2f3f8'),
    muted: readThemeVar('--screen-muted', '#989dad'),
  };
  const style = doc.createElement('style');
  style.textContent = `
    :root { color-scheme: dark; --pip-bg: ${theme.bg}; --pip-text: ${theme.text}; --pip-muted: ${theme.muted}; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      display: flex; align-items: center; justify-content: center;
      background:
        radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--pip-accent, #aa9bff) 18%, transparent), transparent 58%),
        linear-gradient(150deg, color-mix(in srgb, var(--pip-bg) 90%, black), var(--pip-bg));
      color: var(--pip-text);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .lyrics { width: 100%; padding: 0 30px; text-align: center; }
    .current, .next {
      display: block; width: 100%; border: 0; background: transparent;
      font-family: inherit; cursor: pointer;
      text-shadow: 0 2px 12px var(--pip-bg), 0 0 5px var(--pip-bg);
    }
    .current { padding: 4px 0; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
    .next {
      margin-top: 5px; padding: 2px 0; color: var(--pip-text); opacity: 0.4;
      font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .next:hover { opacity: 0.75; }
    .current:focus-visible, .next:focus-visible { outline: 2px solid var(--pip-accent, #aa9bff); outline-offset: 3px; }
    .hint {
      position: fixed; right: 10px; bottom: 6px; color: var(--pip-muted);
      font-size: 9px; letter-spacing: 0.08em; opacity: 0.45;
    }
  `;
  doc.head.appendChild(style);

  const main = createElement(doc, 'main', 'lyrics');
  const current = createElement(doc, 'button', 'current');
  current.type = 'button';
  const next = createElement(doc, 'button', 'next');
  next.type = 'button';
  const hint = createElement(doc, 'div', 'hint');
  hint.textContent = 'ATLAS · 点击歌词跳转';
  main.append(current, next);
  doc.body.append(main, hint);

  let currentSeek: number | null = null;
  let nextSeek: number | null = null;
  current.addEventListener('click', () => {
    if (currentSeek !== null) handlers.onSeek(currentSeek);
  });
  next.addEventListener('click', () => {
    if (nextSeek !== null) handlers.onSeek(nextSeek);
  });

  const update = (state: PipLyricsState) => {
    currentSeek = state.currentSeek;
    nextSeek = state.nextSeek;
    current.textContent = state.currentText;
    next.textContent = state.nextText;
    next.style.display = state.showNext && state.nextText ? 'block' : 'none';
    current.style.color = state.color;
    current.style.fontSize = `${state.currentFontSize}px`;
    main.style.opacity = String(state.opacity);
    doc.documentElement.style.setProperty('--pip-accent', state.color);
  };

  const closed = () => {
    pipWindow.removeEventListener('pagehide', closed);
    handlers.onClosed();
  };
  pipWindow.addEventListener('pagehide', closed);

  update(initial);

  return {
    window: pipWindow,
    update,
    close: () => {
      if (!pipWindow.closed) pipWindow.close();
    },
  };
}
