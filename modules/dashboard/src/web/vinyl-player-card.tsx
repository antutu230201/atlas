'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScreenIcon } from './icons';

interface MusicTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  durationMs: number;
}

/** 网易云允许网页外链的默认歌单；版权状态变化时由 audio error 明确降级，不伪造播放成功。 */
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
];

const FIRST_TRACK = TRACKS[0]!;
const audioUrl = (id: number) => `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
const sourceUrl = (id: number) => `https://music.163.com/#/song?id=${id}`;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function VinylPlayerCard() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeAfterChangeRef = useRef(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(FIRST_TRACK.durationMs / 1000);
  const [volume, setVolume] = useState(0.65);
  const [isMuted, setIsMuted] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [error, setError] = useState('');
  const track = TRACKS[trackIndex] ?? FIRST_TRACK;

  const playAudio = useCallback(async () => {
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
      setError('暂时无法播放这首歌，可切换到下一首或前往网易云收听。');
    }
  }, []);

  // 切歌后只恢复“此前正在播放”或用户主动选歌的意图，页面初次打开绝不自动播放。
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(0);
    setDuration((TRACKS[trackIndex] ?? FIRST_TRACK).durationMs / 1000);
    setCoverFailed(false);
    setError('');
    audio.load();
    if (resumeAfterChangeRef.current) {
      resumeAfterChangeRef.current = false;
      void playAudio();
    }
  }, [trackIndex, playAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: [{ src: track.cover, sizes: '400x400', type: 'image/jpeg' }],
    });
  }, [track]);

  const selectTrack = (nextIndex: number, shouldPlay = isPlaying) => {
    if (nextIndex === trackIndex) {
      if (shouldPlay) void playAudio();
      return;
    }
    resumeAfterChangeRef.current = shouldPlay;
    setTrackIndex(nextIndex);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else void playAudio();
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <section
      className="screen-card screen-reveal p-5 md:p-6"
      style={{ '--screen-index': 4 } as React.CSSProperties}
      aria-label="音乐播放器"
      data-testid="vinyl-player"
    >
      <audio
        ref={audioRef}
        src={audioUrl(track.id)}
        preload="none"
        onLoadStart={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlay={() => {
          setIsPlaying(true);
          setError('');
        }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) {
            setDuration(event.currentTarget.duration);
          }
        }}
        onEnded={() => selectTrack((trackIndex + 1) % TRACKS.length, true)}
        onError={() => {
          setIsPlaying(false);
          setIsBuffering(false);
          setError('这首歌的外链暂不可用，可能受版权或网络限制。请切歌或前往网易云收听。');
        }}
      />

      <div className="grid items-center gap-6 md:grid-cols-[148px_minmax(0,1fr)]">
        <div className="relative mx-auto w-36 max-md:mt-3 md:w-40">
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="screen-label !text-[9px] !text-primary">Now playing</span>
                <span className="screen-label !text-[8px] !tracking-[0.12em]">网易云音乐</span>
              </div>
              <h2 className="mt-2 truncate text-xl font-semibold tracking-tight md:text-2xl">
                {track.title}
              </h2>
              <p className="mt-1 truncate text-xs text-muted">
                {track.artist} <span className="mx-1 text-border">/</span> {track.album}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 font-mono text-[9px] tracking-widest text-muted">
              <span
                className={`size-1.5 rounded-full ${isPlaying ? 'bg-ok' : 'bg-border'}`}
                aria-hidden
              />
              {isBuffering ? 'LOADING' : isPlaying ? 'PLAYING' : 'READY'} ·{' '}
              {String(trackIndex + 1).padStart(2, '0')}/{String(TRACKS.length).padStart(2, '0')}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
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
                onClick={() => selectTrack((trackIndex - 1 + TRACKS.length) % TRACKS.length)}
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
                onClick={() => selectTrack((trackIndex + 1) % TRACKS.length)}
                aria-label="下一首"
                title="下一首"
              >
                <ScreenIcon name="next" className="size-4" />
              </button>
            </div>

            <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="screen-icon-button !size-9 !min-h-9 !rounded-full !p-0"
                onClick={() => setIsMuted((muted) => !muted)}
                aria-label={isMuted ? '取消静音' : '静音'}
                title={isMuted ? '取消静音' : '静音'}
              >
                <ScreenIcon name={isMuted || volume === 0 ? 'mute' : 'volume'} className="size-4" />
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
                  { '--range-progress': `${(isMuted ? 0 : volume) * 100}%` } as React.CSSProperties
                }
                aria-label="音量"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
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
        </div>
      </div>

      {playlistOpen ? (
        <div id="vinyl-playlist" className="mt-5 border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="screen-label !text-[9px]">Atlas 精选 · 可网页播放</span>
            <span className="font-mono text-[9px] text-muted">{TRACKS.length} TRACKS</span>
          </div>
          <ol className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {TRACKS.map((item, index) => (
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
                    className={`w-5 shrink-0 font-mono text-[10px] ${index === trackIndex ? 'text-primary' : 'text-muted'}`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted">
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
                    <span className="shrink-0 font-mono text-[9px] text-muted">
                      {formatTime(item.durationMs / 1000)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
