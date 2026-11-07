'use client';

/**
 * 播放脉冲的页内广播（播放器悬浮层 ↔ 听歌统计 3D 舞台，同页面通信）：
 * 播放/暂停时 dispatch；舞台挂载时从 localStorage 的播放状态快照取初始值。
 */

export const LISTENING_PULSE_EVENT = 'atlas:listening-pulse';

export function dispatchListeningPulse(playing: boolean): void {
  window.dispatchEvent(new CustomEvent(LISTENING_PULSE_EVENT, { detail: { playing } }));
}

export function readStoredPulse(): boolean {
  try {
    const raw = window.localStorage.getItem('atlas.dashboard.music-state');
    if (!raw) return false;
    return (JSON.parse(raw) as { wasPlaying?: boolean }).wasPlaying === true;
  } catch {
    return false;
  }
}

export function onListeningPulse(listener: (playing: boolean) => void): () => void {
  const handler = (event: Event) => {
    const playing = (event as CustomEvent<{ playing: boolean }>).detail?.playing ?? false;
    listener(playing);
  };
  window.addEventListener(LISTENING_PULSE_EVENT, handler);
  return () => window.removeEventListener(LISTENING_PULSE_EVENT, handler);
}
