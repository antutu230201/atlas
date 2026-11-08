'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@atlas/ui';
import { api } from '@/lib/api';
import { DesktopLyrics, type LyricLine } from './desktop-lyrics';
import { dispatchListeningPulse, onPlaySong } from './listening-pulse';
import { ScreenIcon } from './icons';

const NeteaseLoginDialog = lazy(() =>
  import('./netease-login-dialog').then((module) => ({ default: module.NeteaseLoginDialog })),
);

interface MusicTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  durationMs: number;
}

/** 网易云允许网页外链的默认歌单；未绑定网易云账号或喜欢列表不可用时回退使用，版权变化由 audio error 明确降级，不伪造播放成功。 */
const TRACKS: MusicTrack[] = [
  {
    id: 569200213,
    title: '消愁',
    artist: '毛不易',
    album: '平凡的一天',
    cover: 'https://p1.music.126.net/vmCcDvD1H04e9gm97xsCqg==/109951163350929740.jpg',
    durationMs: 261346,
  },
  {
    id: 31445772,
    title: '理想三旬',
    artist: '陈鸿宇',
    album: '浓烟下的诗歌电台',
    cover: 'https://p1.music.126.net/ryk8Gu64rOhlYn0pc2Q8Ww==/109951168090271827.jpg',
    durationMs: 210814,
  },
  {
    id: 1363948882,
    title: '世间美好与你环环相扣',
    artist: '柏松',
    album: '听闻余生',
    cover: 'https://p1.music.126.net/DK1_4sP_339o5rowMdPXdw==/109951164071024476.jpg',
    durationMs: 191960,
  },
  {
    id: 1330348068,
    title: '起风了',
    artist: '冯沁苑（买辣椒也用券）',
    album: '起风了',
    cover: 'https://p1.music.126.net/diGAyEmpymX8G7JcnElncQ==/109951163699673355.jpg',
    durationMs: 325868,
  },
  {
    id: 28188427,
    title: '棠梨煎雪',
    artist: '银临',
    album: '腐草为萤',
    cover: 'https://p1.music.126.net/LBnYDAUED2mD1veBvBnC8g==/5859297464524710.jpg',
    durationMs: 245760,
  },
  {
    id: 27646786,
    title: '活着',
    artist: '郝云',
    album: '活着',
    cover: 'https://p1.music.126.net/9A9o8KnCftKoJLmfk7jE-A==/1252343744099790.jpg',
    durationMs: 271493,
  },
  {
    id: 1436709403,
    title: '夏天的风',
    artist: '火羊瞌睡了',
    album: '夏天的风',
    cover: 'https://p2.music.126.net/rFUKVdOjqxgwAT6Zi6qv7A==/109951164906689206.jpg',
    durationMs: 221750,
  },
  {
    id: 1413863166,
    title: '想去海边',
    artist: '夏日入侵企画',
    album: '想去海边',
    cover: 'https://p2.music.126.net/sLWN-iePq4ESOMPER0IWgQ==/109951164602081973.jpg',
    durationMs: 267032,
  },
  {
    id: 34380395,
    title: '途中',
    artist: '陈鸿宇',
    album: '浓烟下的诗歌电台',
    cover: 'https://p2.music.126.net/ryk8Gu64rOhlYn0pc2Q8Ww==/109951168090271827.jpg',
    durationMs: 259363,
  },
  {
    id: 399354289,
    title: '不说再见',
    artist: '好妹妹乐队',
    album: '不说再见',
    cover: 'https://p2.music.126.net/vGyVY6gwr-puT406H29QEw==/109951167193047122.jpg',
    durationMs: 296177,
  },
  {
    id: 1313354324,
    title: '出山',
    artist: '花粥 / 王胜娚',
    album: '粥请客（四）',
    cover: 'https://p2.music.126.net/xUAfdMHdXhu3BmO4g8nOYA==/109951163573311341.jpg',
    durationMs: 200388,
  },
  {
    id: 569213220,
    title: '像我这样的人',
    artist: '毛不易',
    album: '平凡的一天',
    cover: 'https://p2.music.126.net/vmCcDvD1H04e9gm97xsCqg==/109951163350929740.jpg',
    durationMs: 207466,
  },
  {
    id: 449578813,
    title: '行歌',
    artist: '陈鸿宇',
    album: '一如年少模样',
    cover: 'https://p2.music.126.net/AlcW5RnCEEP6huXZehdpew==/109951168090254666.jpg',
    durationMs: 287326,
  },
  {
    id: 450853439,
    title: '遥不可及的你',
    artist: '花粥',
    album: '2017（一）',
    cover: 'https://p2.music.126.net/_d88fVvtP17B-hV7z1lWzg==/109951162835476747.jpg',
    durationMs: 150824,
  },
  {
    id: 31445554,
    title: '七月上',
    artist: 'Jam',
    album: '阿敬的单曲集',
    cover: 'https://p2.music.126.net/uxyYBS5jhmi_DN4xDYy3eg==/7872503255697381.jpg',
    durationMs: 190093,
  },
  {
    id: 30706318,
    title: '我想和你虚度时光',
    artist: '程璧 / 莫西子诗',
    album: '我想和你虚度时光',
    cover: 'https://p2.music.126.net/beK0Y-4vgyZoIy21QFXC0A==/7696581394971660.jpg',
    durationMs: 509621,
  },
  {
    id: 28656174,
    title: '晴日共剪窗',
    artist: '程璧',
    album: '晴日共剪窗',
    cover: 'https://p2.music.126.net/ZwD6LYIkRoiNFQlM_brBLg==/5990139348644333.jpg',
    durationMs: 261336,
  },
  {
    id: 2160356141,
    title: '十二',
    artist: '留声玩具',
    album: '十二（Studio version2024）',
    cover: 'https://p2.music.126.net/iZ965zdEgFDBpG7zYdhr2A==/109951169629610981.jpg',
    durationMs: 222000,
  },
];

const FIRST_TRACK = TRACKS[0]!;
const MUSIC_STATE_KEY = 'atlas.dashboard.music-state';
const audioUrl = (id: number) => `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
const sourceUrl = (id: number) => `https://music.163.com/#/song?id=${id}`;

type PlaybackMode = 'sequence' | 'repeat' | 'shuffle';

const PLAYBACK_MODES: PlaybackMode[] = ['sequence', 'repeat', 'shuffle'];
const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
  sequence: '顺序播放',
  repeat: '单曲循环',
  shuffle: '随机播放',
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/**
 * 大屏悬浮音乐舱（系统级全局悬浮层，经 moduleOverlayRegistry 由应用外壳挂载）：
 * 跨页面常驻不中断播放；折叠时贴右下角，展开后复用完整黑胶/歌单控制；
 * 刷新后恢复上次曲目与进度并尝试续播（浏览器拦截自动播放时停在原位，不打扰）。
 */
export function FloatingMusicPlayer({ workspaceSlug }: { workspaceSlug: string }) {
  const base = `/modules/workspaces/${workspaceSlug}/dashboard/call`;
  const audioRef = useRef<HTMLAudioElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const resumeAfterChangeRef = useRef(false);
  const restoreRef = useRef<{
    trackId?: number;
    positionSec: number;
    wasPlaying: boolean;
    matched: boolean;
  } | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const resumeOnMetadataRef = useRef(false);
  const resumeOnGestureRef = useRef(false);
  const currentTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);
  const isPlayingRef = useRef(false);
  const preferencesReadyRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(FIRST_TRACK.durationMs / 1000);
  const [volume, setVolume] = useState(0.65);
  const [isMuted, setIsMuted] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistQuery, setPlaylistQuery] = useState('');
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('sequence');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [error, setError] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [resumeHint, setResumeHint] = useState(false);
  const queryClient = useQueryClient();

  // 网易云绑定状态与喜欢列表：绑定了就用自己的歌单，否则回退内置精选。
  // liked 查询失败（接口风控/网络）同样回退内置，不阻塞播放器。
  const likedQuery = useQuery({
    queryKey: ['dashboard', 'netease-liked'],
    queryFn: () =>
      api<{ bound: boolean; nickname?: string; tracks: MusicTrack[] }>(`${base}/neteaseLiked`, {
        method: 'POST',
        json: {},
      }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const usingNetease = likedQuery.data?.bound === true && (likedQuery.data.tracks?.length ?? 0) > 0;
  const tracks = useMemo<MusicTrack[]>(
    () => (usingNetease ? likedQuery.data!.tracks : TRACKS),
    [likedQuery.data, usingNetease],
  );
  const neteaseNickname = usingNetease ? likedQuery.data!.nickname : undefined;

  const track = tracks[trackIndex] ?? tracks[0] ?? FIRST_TRACK;
  const filteredTracks = useMemo(() => {
    const keyword = playlistQuery.trim().toLocaleLowerCase('zh-CN');
    const all = tracks.map((item, index) => ({ item, index }));
    if (!keyword) return all;
    return all.filter(({ item }) =>
      `${item.title} ${item.artist} ${item.album}`.toLocaleLowerCase('zh-CN').includes(keyword),
    );
  }, [playlistQuery, tracks]);

  // 网易云曲目按需取有时效的 CDN 地址；取不到（VIP/版权）回落外链，由 audio error 明确报错
  const neteaseUrlQuery = useQuery({
    queryKey: ['dashboard', 'netease-url', track.id],
    queryFn: () =>
      api<{ url: string | null; type: string | null }>(`${base}/neteaseSongUrl`, {
        method: 'POST',
        json: { id: track.id },
      }),
    enabled: usingNetease,
    staleTime: 4 * 60_000,
    retry: false,
  });
  const audioSrc = usingNetease ? (neteaseUrlQuery.data?.url ?? '') : audioUrl(track.id);

  // 歌单来源切换（绑定/解绑/喜欢列表变化）时回到列表头部，避免悬空索引
  useEffect(() => {
    setTrackIndex(0);
  }, [usingNetease]);

  // 刷新续播的曲目匹配：内置列表先试；网易云喜欢列表就绪后再试一次。
  // 放在来源切换归零 effect 之后，保证匹配结果不被归零覆盖。
  useEffect(() => {
    const restore = restoreRef.current;
    if (!restore || restore.matched || !preferencesReady) return;
    const index = tracks.findIndex((item) => item.id === restore.trackId);
    if (index < 0) return;
    restore.matched = true;
    setTrackIndex(index);
    pendingSeekRef.current = restore.positionSec > 0 ? restore.positionSec : null;
    resumeOnMetadataRef.current = restore.wasPlaying;
  }, [tracks, preferencesReady]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    preferencesReadyRef.current = preferencesReady;
  }, [preferencesReady]);

  const lyricsQuery = useQuery({
    queryKey: ['dashboard', 'lyrics', track.id],
    queryFn: () =>
      api<{ lines: LyricLine[] }>(`${base}/lyrics`, { method: 'POST', json: { id: track.id } }),
    enabled: lyricsOpen,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  // 恢复本地偏好：曲目/音量/模式之外，还恢复进度与播放意图用于刷新续播。
  // 是否真的续播由浏览器自动播放策略决定：被拦截就停在恢复的进度上，不打扰。
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MUSIC_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          trackId?: number;
          volume?: number;
          mode?: PlaybackMode;
          positionSec?: number;
          wasPlaying?: boolean;
        };
        restoreRef.current = {
          trackId: typeof saved.trackId === 'number' ? saved.trackId : undefined,
          positionSec: typeof saved.positionSec === 'number' ? saved.positionSec : 0,
          wasPlaying: saved.wasPlaying === true,
          matched: false,
        };
        if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) {
          setVolume(saved.volume);
        }
        if (saved.mode && PLAYBACK_MODES.includes(saved.mode)) setPlaybackMode(saved.mode);
      }
    } catch {
      // 本地偏好损坏或隐私模式不可写时，回退到默认状态，不影响播放。
    } finally {
      setPreferencesReady(true);
    }
  }, []);

  const playAudio = useCallback(async (options?: { silent?: boolean; onBlocked?: () => void }) => {
    const audio = audioRef.current;
    if (!audio) return;
    setError('');
    try {
      await audio.play();
    } catch (cause) {
      // 切歌会中止上一次 play 请求，这不是需要展示给用户的失败。
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setIsPlaying(false);
      setIsBuffering(false);
      // 刷新续播被浏览器自动播放策略拦下：不算错误，转交"首次交互即续播"兜底。
      if (options?.silent) {
        options.onBlocked?.();
        return;
      }
      setError('暂时无法播放这首歌，可切换到下一首或前往网易云收听。');
    }
  }, []);

  /* ---------------- 听歌心跳（telemetry）：真实播放秒数，30s 一冲，切歌/暂停/关页冲账 ---------------- */

  const listenAccumRef = useRef(0);
  const listenFirstRef = useRef(false);
  const listenLastTickRef = useRef(0);
  const listeningTrackRef = useRef(track);

  const flushListening = useCallback(async () => {
    const seconds = Math.min(120, Math.round(listenAccumRef.current));
    listenAccumRef.current = 0;
    const current = listeningTrackRef.current;
    if (seconds < 1) return;
    try {
      await api(`${base}/listeningHeartbeat`, {
        method: 'POST',
        json: {
          songId: current.id,
          title: current.title,
          artist: current.artist,
          cover: current.cover,
          seconds,
          first: listenFirstRef.current,
        },
      });
      listenFirstRef.current = false;
    } catch {
      // 遥测失败静默：不影响播放，下个周期继续累计上报。
    }
  }, [base]);

  // 播放地址就绪（新歌选中或网易云 CDN 地址到达）才 load：地址未就绪时静默等待。
  // “此前正在播放”或用户主动选歌的意图由 resumeAfterChangeRef 延续；
  // 刷新续播的跳转与续播在 onLoadedMetadata 里做（需等元数据就绪才能 seek）。
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;
    // 切歌先把上一首的听歌秒数冲账，再切换心跳目标并标记"一次播放"
    if (listeningTrackRef.current.id !== track.id) {
      void flushListening();
      listeningTrackRef.current = track;
      listenFirstRef.current = true;
    }
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setDuration(track.durationMs > 0 ? track.durationMs / 1000 : FIRST_TRACK.durationMs / 1000);
    setCoverFailed(false);
    setError('');
    audio.load();
    if (resumeAfterChangeRef.current) {
      resumeAfterChangeRef.current = false;
      void playAudio();
    }
  }, [audioSrc, track.id, track.durationMs, playAudio, flushListening]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  const persistState = useCallback(() => {
    if (!preferencesReadyRef.current) return;
    try {
      window.localStorage.setItem(
        MUSIC_STATE_KEY,
        JSON.stringify({
          trackId: track.id,
          volume,
          mode: playbackMode,
          positionSec: Math.round(currentTimeRef.current * 10) / 10,
          wasPlaying: isPlayingRef.current,
        }),
      );
    } catch {
      // 记忆偏好是增强能力，存储不可用时不阻断播放。
    }
  }, [track.id, volume, playbackMode]);

  useEffect(() => {
    // 等恢复完成再写回，否则 React 严格模式的挂载双执行会用默认值覆盖上次偏好。
    if (!preferencesReady) return;
    persistState();
  }, [preferencesReady, track.id, volume, playbackMode, persistState]);

  // 播放中定期存进度；暂停/关闭页面时立即落一次。
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(persistState, 5_000);
    return () => window.clearInterval(timer);
  }, [isPlaying, persistState]);

  useEffect(() => {
    if (!isPlaying) persistState();
  }, [isPlaying, persistState]);

  useEffect(() => {
    const onPageHide = () => persistState();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [persistState]);

  // 播放中每 5s 累计真实时长，满 30s 冲一次；暂停（effect 清理）与关页/卸载冲掉零头。
  useEffect(() => {
    if (!isPlaying) return;
    listenLastTickRef.current = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      listenAccumRef.current += (now - listenLastTickRef.current) / 1000;
      listenLastTickRef.current = now;
      if (listenAccumRef.current >= 30) void flushListening();
    }, 5_000);
    return () => {
      const now = Date.now();
      listenAccumRef.current += (now - listenLastTickRef.current) / 1000;
      listenLastTickRef.current = now;
      window.clearInterval(timer);
    };
  }, [isPlaying, flushListening]);

  useEffect(() => {
    if (!isPlaying) void flushListening();
  }, [isPlaying, flushListening]);

  // 播放状态广播：听歌统计 3D 舞台据此加速黑胶/粒子/律动（页内事件，模块内通信）
  useEffect(() => {
    dispatchListeningPulse(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    const onPageHideFlush = () => void flushListening();
    window.addEventListener('pagehide', onPageHideFlush);
    return () => {
      window.removeEventListener('pagehide', onPageHideFlush);
      void flushListening();
    };
  }, [flushListening]);

  // 刷新续播被自动播放策略拦截时的兜底：用户在页面上的第一次点击/按键（点菜单、
  // 切页面、敲键盘都算）即自动续播，无需去找播放按钮。播放器自身的控件事件除外，
  // 避免与播放/暂停按钮的语义叠加。
  useEffect(() => {
    if (!resumeHint) return;
    const onGesture = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && dockRef.current?.contains(target)) return;
      resumeOnGestureRef.current = false;
      setResumeHint(false);
      void playAudio();
    };
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    return () => {
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
    };
  }, [resumeHint, playAudio]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: [{ src: track.cover, sizes: '400x400', type: 'image/jpeg' }],
    });
  }, [track]);

  // 展开态支持 Esc 与点击外部收起；折叠态不注册监听，避免影响页面其余交互。
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !dockRef.current?.contains(target)) setExpanded(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [expanded]);

  const selectTrack = useCallback(
    (nextIndex: number, shouldPlay = isPlaying) => {
      // 用户主动换歌 = 刷新续播的兜底意图已失效，撤掉提示与监听。
      resumeOnGestureRef.current = false;
      setResumeHint(false);
      if (nextIndex === trackIndex) {
        if (shouldPlay) void playAudio();
        return;
      }
      resumeAfterChangeRef.current = shouldPlay;
      setTrackIndex(nextIndex);
    },
    [isPlaying, playAudio, trackIndex],
  );

  const stepTrack = useCallback(
    (direction: 1 | -1, shouldPlay = isPlaying) => {
      let nextIndex = (trackIndex + direction + tracks.length) % tracks.length;
      if (playbackMode === 'shuffle' && tracks.length > 1) {
        nextIndex = Math.floor(Math.random() * (tracks.length - 1));
        if (nextIndex >= trackIndex) nextIndex += 1;
      }
      selectTrack(nextIndex, shouldPlay);
    },
    [isPlaying, playbackMode, selectTrack, trackIndex, tracks.length],
  );

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else void playAudio();
  };

  // 统计页点歌联动：按 songId 在当前曲目源中查找并播放（找不到则忽略，不换歌）
  useEffect(() => {
    return onPlaySong((songId) => {
      const index = tracks.findIndex((item) => item.id === songId);
      if (index < 0) return;
      selectTrack(index, true);
    });
  }, [tracks, selectTrack]);

  // 键盘控制（大屏场景刚需）：空格 = 播放/暂停，←/→ = 上/下一首。
  // 输入类元素聚焦时忽略，避免打字误触；Space preventDefault 防页面滚动。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        stepTrack(1);
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        stepTrack(-1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, stepTrack]);

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    // 流式音频在元数据未就绪时 duration 可能是 Infinity，不能因此禁用歌词跳播。
    const next = Number.isFinite(audio.duration) ? Math.min(value, audio.duration) : value;
    audio.currentTime = next;
    setCurrentTime(next);
  };

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const audio = audioRef.current;
    navigator.mediaSession.setActionHandler('play', () => void playAudio());
    navigator.mediaSession.setActionHandler('pause', () => audio?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => stepTrack(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => stepTrack(1));
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [playAudio, stepTrack]);

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const statusLabel = isBuffering ? 'LOADING' : isPlaying ? 'PLAYING' : 'READY';
  const urlUnavailable = usingNetease && neteaseUrlQuery.isSuccess && !neteaseUrlQuery.data?.url;

  const handleBound = useCallback(() => {
    // 状态反馈由歌单面板的来源标签（网易云 · 昵称）承担，error 仅用于真正的失败
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'netease-liked'] });
  }, [queryClient]);

  const handleUnbind = useCallback(async () => {
    try {
      await api(`${base}/neteaseUnbind`, { method: 'POST', json: {} });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'netease-liked'] });
    } catch {
      setError('退出登录失败，请稍后重试');
    }
  }, [base, queryClient]);

  return (
    <div
      ref={dockRef}
      className={`fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 max-md:right-3 max-md:left-3 ${
        expanded ? 'w-[min(760px,calc(100vw-2rem))] max-md:w-auto' : 'w-[380px] max-md:w-auto'
      }`}
      data-testid="vinyl-player"
      data-expanded={expanded}
    >
      <audio
        ref={audioRef}
        src={audioSrc || undefined}
        preload="none"
        onLoadStart={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlay={() => {
          setIsPlaying(true);
          setError('');
          // 任何途径开始播放（含用户手动点播放）都视为续播兜底已解决。
          resumeOnGestureRef.current = false;
          setResumeHint(false);
        }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          // 原生 timeupdate 约 4Hz；节流到 2Hz，进度条靠 CSS 过渡补齐，
          // 避免整块播放器（含歌词/歌单）每秒重渲染四次
          const value = event.currentTarget.currentTime;
          if (value < lastTimeUpdateRef.current || value - lastTimeUpdateRef.current >= 0.5) {
            lastTimeUpdateRef.current = value;
            setCurrentTime(value);
          }
        }}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) {
            setDuration(event.currentTarget.duration);
          }
          // 刷新续播：元数据就绪后先跳回上次进度，再尝试续播（被自动播放策略
          // 拦截时静默停在原位）。
          const audio = event.currentTarget;
          const seekTo = pendingSeekRef.current;
          if (seekTo != null && Number.isFinite(audio.duration) && audio.duration > 0) {
            audio.currentTime = Math.min(seekTo, Math.max(0, audio.duration - 1));
            setCurrentTime(audio.currentTime);
            pendingSeekRef.current = null;
          }
          if (resumeOnMetadataRef.current) {
            resumeOnMetadataRef.current = false;
            void playAudio({
              silent: true,
              // 被自动播放策略拦下：等待用户在页面上的第一次交互再续播（浏览器的
              // 声音播放必须有手势，这是网页应用能做到的最接近自动播放的体验）。
              onBlocked: () => {
                resumeOnGestureRef.current = true;
                setResumeHint(true);
              },
            });
          }
        }}
        onEnded={() => {
          if (playbackMode === 'repeat') {
            seek(0);
            void playAudio();
          } else {
            stepTrack(1, true);
          }
        }}
        onError={() => {
          setIsPlaying(false);
          setIsBuffering(false);
          setError('这首歌的外链暂不可用，可能受版权或网络限制。请切歌或前往网易云收听。');
        }}
      />

      {expanded ? (
        <section
          id="music-player-panel"
          className="screen-music-panel flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-4 md:p-5"
          aria-label="音乐播放器"
        >
          {/* 唱片与控制区固定，歌单区独立滚动（对齐网易云桌面端布局） */}
          <div className="shrink-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ScreenIcon name="music" className="size-3.5 shrink-0 text-primary" />
                <span className="screen-label !text-[11px]">Atlas music deck</span>
                <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                <span className="hidden font-mono text-[10px] tracking-widest text-muted sm:inline">
                  NETEASE
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-muted">
                  <span
                    className={`size-1.5 rounded-full ${isPlaying ? 'bg-ok' : 'bg-border'}`}
                    aria-hidden
                  />
                  {statusLabel} · {String(trackIndex + 1).padStart(2, '0')}/
                  {String(tracks.length).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  className="screen-icon-button !size-8 !min-h-8 !rounded-full !p-0"
                  onClick={() => setExpanded(false)}
                  aria-label="收起播放器"
                  title="收起播放器"
                >
                  <ScreenIcon name="collapse" className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="grid items-center gap-5 md:grid-cols-[140px_minmax(0,1fr)]">
              <div className="relative mx-auto w-32 max-md:mt-2 md:w-36">
                <div
                  className="screen-vinyl-rotation screen-vinyl"
                  data-playing={isPlaying}
                  data-testid="vinyl-disc"
                  aria-hidden
                >
                  {coverFailed ? (
                    <span className="absolute inset-[19%] flex items-center justify-center rounded-full bg-primary-soft text-primary">
                      <ScreenIcon name="music" className="size-8" />
                    </span>
                  ) : (
                    <img
                      key={track.id}
                      src={`${track.cover}?param=400y400`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-[19%] h-[62%] w-[62%] rounded-full border border-border object-cover"
                      onError={() => setCoverFailed(true)}
                    />
                  )}
                  <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface" />
                </div>
                <span className="screen-tonearm" data-playing={isPlaying} aria-hidden />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="screen-label !text-[10px] !text-primary">Now playing</span>
                  <span className="screen-label !tracking-[0.12em]">网易云音乐</span>
                </div>
                <h2 className="mt-2 truncate text-xl font-semibold tracking-tight md:text-2xl">
                  {track.title}
                </h2>
                <p className="mt-1 truncate text-xs text-muted">
                  {track.artist} <span className="mx-1 text-border">/</span> {track.album}
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-muted">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={(event) => seek(Number(event.target.value))}
                    className="screen-player-range flex-1"
                    style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
                    aria-label="播放进度"
                    aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
                  />
                  <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
                    {formatTime(duration)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="screen-icon-button !size-9 !min-h-9 !rounded-full !p-0"
                      onClick={() => stepTrack(-1)}
                      aria-label="上一首"
                      title="上一首"
                    >
                      <ScreenIcon name="previous" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="flex size-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-glow transition-transform duration-fast hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95"
                      onClick={togglePlay}
                      aria-label={isPlaying ? `暂停 ${track.title}` : `播放 ${track.title}`}
                      title={isPlaying ? '暂停' : '播放'}
                    >
                      <ScreenIcon
                        name={isPlaying ? 'pause' : 'play'}
                        className={isPlaying ? 'size-4' : 'size-4 translate-x-0.5'}
                      />
                    </button>
                    <button
                      type="button"
                      className="screen-icon-button !size-9 !min-h-9 !rounded-full !p-0"
                      onClick={() => stepTrack(1)}
                      aria-label="下一首"
                      title="下一首"
                    >
                      <ScreenIcon name="next" className="size-4" />
                    </button>
                  </div>

                  <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />

                  <button
                    type="button"
                    className={`screen-icon-button !min-h-9 !px-3 ${playbackMode !== 'sequence' ? '!border-primary/40 !text-primary' : ''}`}
                    onClick={() =>
                      setPlaybackMode(
                        PLAYBACK_MODES[
                          (PLAYBACK_MODES.indexOf(playbackMode) + 1) % PLAYBACK_MODES.length
                        ]!,
                      )
                    }
                    aria-label={`播放模式：${PLAYBACK_MODE_LABELS[playbackMode]}，点击切换`}
                    title={`${PLAYBACK_MODE_LABELS[playbackMode]} · 点击切换`}
                  >
                    <ScreenIcon
                      name={playbackMode === 'shuffle' ? 'shuffle' : 'repeat'}
                      className="size-3.5"
                    />
                    <span className="hidden lg:inline">{PLAYBACK_MODE_LABELS[playbackMode]}</span>
                    {playbackMode === 'repeat' ? (
                      <span className="font-mono text-[10px]">1</span>
                    ) : null}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="screen-icon-button !size-9 !min-h-9 !rounded-full !p-0"
                      onClick={() => setIsMuted((muted) => !muted)}
                      aria-label={isMuted ? '取消静音' : '静音'}
                      title={isMuted ? '取消静音' : '静音'}
                    >
                      <ScreenIcon
                        name={isMuted || volume === 0 ? 'mute' : 'volume'}
                        className="size-4"
                      />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(event) => {
                        setVolume(Number(event.target.value));
                        setIsMuted(false);
                      }}
                      className="screen-player-range w-20"
                      style={
                        {
                          '--range-progress': `${(isMuted ? 0 : volume) * 100}%`,
                        } as React.CSSProperties
                      }
                      aria-label="音量"
                    />
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      className={`screen-icon-button !min-h-9 !px-3 ${lyricsOpen ? '!border-primary/40 !text-primary' : ''}`}
                      onClick={() => setLyricsOpen((open) => !open)}
                      aria-pressed={lyricsOpen}
                    >
                      <ScreenIcon name="lyrics" className="size-3.5" />
                      歌词
                    </button>
                    <button
                      type="button"
                      className="screen-icon-button !min-h-9 !px-3"
                      onClick={() => setPlaylistOpen((open) => !open)}
                      aria-expanded={playlistOpen}
                      aria-controls="vinyl-playlist"
                    >
                      <ScreenIcon name="playlist" className="size-3.5" />
                      歌单
                    </button>
                    <a
                      href={sourceUrl(track.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="screen-icon-button !size-9 !min-h-9 !rounded-full !p-0"
                      aria-label={`在网易云收听 ${track.title}`}
                      title="在网易云收听"
                    >
                      <ScreenIcon name="external" className="size-3.5" />
                    </a>
                  </div>
                </div>

                {error ? (
                  <p className="mt-3 text-[11px] leading-5 text-warn" role="status">
                    {error}
                  </p>
                ) : null}
                {urlUnavailable && !error ? (
                  <p className="mt-3 text-[11px] leading-5 text-warn" role="status">
                    这首歌需要 VIP 或受版权限制，暂无可播地址。可切歌或前往网易云收听。
                  </p>
                ) : null}
                {usingNetease && neteaseUrlQuery.isFetching && !isPlaying ? (
                  <p className="mt-3 text-[11px] leading-5 text-muted" role="status">
                    正在获取播放地址…
                  </p>
                ) : null}
                {resumeHint ? (
                  <p className="mt-3 text-[11px] leading-5 text-muted" role="status">
                    已恢复上次进度，点击页面任意处继续播放
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {playlistOpen ? (
            <div
              id="vinyl-playlist"
              className="mt-4 flex min-h-0 flex-1 flex-col border-t border-border pt-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="screen-label !text-[11px]">
                  {usingNetease
                    ? `网易云 · ${neteaseNickname ?? '我的喜欢'}`
                    : 'Atlas 精选 · 未绑定网易云'}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {usingNetease ? (
                    <button
                      type="button"
                      className="screen-icon-button !min-h-7 !px-2.5 !text-[11px]"
                      onClick={() => void handleUnbind()}
                    >
                      退出登录
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="screen-icon-button !min-h-7 !border-primary/40 !px-2.5 !text-[11px] !text-primary"
                      onClick={() => setLoginOpen(true)}
                    >
                      登录网易云
                    </button>
                  )}
                  <span className="font-mono text-[10px] font-medium tracking-wider text-muted">
                    {playlistQuery ? `${filteredTracks.length} / ` : ''}
                    {tracks.length} 首
                  </span>
                </span>
              </div>
              <div className="relative mb-3 shrink-0">
                <ScreenIcon
                  name="search"
                  className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted"
                />
                <Input
                  value={playlistQuery}
                  onChange={(event) => setPlaylistQuery(event.target.value)}
                  placeholder="搜索歌名、歌手或专辑"
                  aria-label="搜索歌单"
                  className="bg-surface/60 pl-9 pr-9 text-xs"
                />
                {playlistQuery ? (
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text"
                    onClick={() => setPlaylistQuery('')}
                    aria-label="清空歌单搜索"
                  >
                    <ScreenIcon name="close" className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {filteredTracks.length > 0 ? (
                <ol className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {filteredTracks.map(({ item, index }, resultIndex) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-primary ${
                          index === trackIndex
                            ? 'border-primary/35 bg-primary-soft'
                            : 'border-transparent hover:bg-surface-hover'
                        }`}
                        onClick={() => selectTrack(index, true)}
                        aria-label={`播放 ${item.title} - ${item.artist}`}
                      >
                        <span
                          className={`w-6 shrink-0 text-[11px] font-medium tabular-nums ${index === trackIndex ? 'text-primary' : 'text-muted'}`}
                        >
                          {String(resultIndex + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold leading-5">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted">
                            {item.artist}
                          </span>
                        </span>
                        {index === trackIndex && isPlaying ? (
                          <span className="screen-equalizer text-primary" aria-hidden>
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          <span className="shrink-0 text-[12px] font-medium tabular-nums text-muted">
                            {formatTime(item.durationMs / 1000)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-sm border border-dashed border-border px-4 py-7 text-center">
                  <p className="text-xs text-muted">没有找到「{playlistQuery.trim()}」相关歌曲</p>
                  <button
                    type="button"
                    className="mt-2 text-xs text-primary hover:underline"
                    onClick={() => setPlaylistQuery('')}
                  >
                    查看全部 {tracks.length} 首
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : (
        <div
          className="screen-dock screen-reveal overflow-hidden"
          style={{ '--screen-index': 4 } as React.CSSProperties}
          role="region"
          aria-label="音乐播放器"
        >
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="relative size-11 shrink-0" aria-hidden>
              <div
                className="screen-vinyl-rotation screen-vinyl absolute inset-0"
                data-playing={isPlaying}
                data-testid="vinyl-disc"
              >
                {coverFailed ? (
                  <span className="absolute inset-[19%] flex items-center justify-center rounded-full bg-primary-soft text-primary">
                    <ScreenIcon name="music" className="size-4" />
                  </span>
                ) : (
                  <img
                    key={track.id}
                    src={`${track.cover}?param=200y200`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-[19%] h-[62%] w-[62%] rounded-full object-cover"
                    onError={() => setCoverFailed(true)}
                  />
                )}
                <span className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface" />
              </div>
            </div>

            <button
              type="button"
              className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={() => setExpanded(true)}
              aria-label={`展开 ${track.title} 播放详情`}
            >
              <span className="block truncate text-xs font-medium">{track.title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted">
                {resumeHint
                  ? '已恢复上次进度，点击页面任意处继续播放'
                  : isBuffering
                    ? '正在载入音频…'
                    : error
                      ? '播放失败，点开查看'
                      : `${track.artist} · ${formatTime(currentTime)} / ${formatTime(duration)}`}
              </span>
            </button>

            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-transform duration-fast hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95"
              onClick={togglePlay}
              aria-label={isPlaying ? `暂停 ${track.title}` : `播放 ${track.title}`}
              title={isPlaying ? '暂停' : '播放'}
            >
              <ScreenIcon
                name={isPlaying ? 'pause' : 'play'}
                className={isPlaying ? 'size-3.5' : 'size-3.5 translate-x-0.5'}
              />
            </button>
            <button
              type="button"
              className="screen-icon-button !size-8 !min-h-8 !shrink-0 !rounded-full !p-0"
              onClick={() => selectTrack((trackIndex + 1) % tracks.length)}
              aria-label="下一首"
              title="下一首"
            >
              <ScreenIcon name="next" className="size-3.5" />
            </button>
            <button
              type="button"
              className="screen-icon-button !size-8 !min-h-8 !shrink-0 !rounded-full !p-0"
              onClick={() => setExpanded(true)}
              aria-label="展开播放器"
              title="展开播放器"
              aria-expanded={false}
              aria-controls="music-player-panel"
            >
              <ScreenIcon name="chevron" className="size-3.5" />
            </button>
          </div>
          <div className="h-0.5 w-full bg-border" aria-hidden>
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {lyricsOpen ? (
        <DesktopLyrics
          trackTitle={track.title}
          artist={track.artist}
          currentTime={currentTime}
          lines={lyricsQuery.data?.lines ?? []}
          loading={lyricsQuery.isPending}
          error={lyricsQuery.isError}
          onSeek={seek}
          onClose={() => setLyricsOpen(false)}
        />
      ) : null}

      {loginOpen ? (
        <Suspense fallback={null}>
          <NeteaseLoginDialog
            base={base}
            open={loginOpen}
            onOpenChange={setLoginOpen}
            onBound={handleBound}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
