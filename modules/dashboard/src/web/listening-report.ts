export type Range = 'day' | 'lastWeek' | 'week' | 'month' | 'year';

/**
 * 听歌报告模板：把统计页数据渲染成一张自包含的明亮风格 HTML 报告单页。
 * 无外部依赖（内联样式 + 少量原生 JS）：可直接浏览器打开、打印存 PDF。
 * 交互：切换歌曲/歌手/排名面板、点击歌曲行展开明细、点击柱状图看当天数据。
 */

export interface ReportBucket {
  label: string;
  seconds: number;
}

export interface ReportSong {
  songId: number;
  title: string;
  artist: string;
  cover: string;
  seconds: number;
  plays: number;
}

export interface ReportArtist {
  artist: string;
  seconds: number;
  plays: number;
  songCount: number;
  cover: string;
}

export interface ReportRank {
  userId: string;
  rank: number;
  userName: string;
  seconds: number;
  isMe?: boolean;
}

export interface ListeningReportInput {
  range: Range;
  rangeHint: string;
  generatedAt: Date;
  summary: {
    totalSeconds: number;
    totalPlays: number;
    buckets: ReportBucket[];
    topSongs: ReportSong[];
    topArtists?: ReportArtist[];
  } | null;
  ranking: {
    list: ReportRank[];
    me: { userId: string; rank: number; userName: string; seconds: number } | null;
  } | null;
  /** 上一周期的汇总（仅用于环比；取不到时为 null） */
  previous?: { totalSeconds: number; totalPlays: number } | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}

function shortLabel(label: string): string {
  return label.slice(5); // 2026-11-07 → 11-07；2026-11 → 11
}

/** 2026-11-07 → 11 月 7 日；2026-11 → 2026 年 11 月 */
function fullLabel(label: string): string {
  if (/^\d{4}-\d{2}$/.test(label)) return `${label.slice(0, 4)} 年 ${Number(label.slice(5))} 月`;
  const parts = label.split('-');
  if (parts.length === 3) return `${Number(parts[1])} 月 ${Number(parts[2])} 日`;
  return label;
}

/** 最长连续有听歌的天数（年视图按月分桶，也算连续月） */
function longestStreak(buckets: ReportBucket[]): number {
  let best = 0;
  let current = 0;
  for (const bucket of buckets) {
    if (bucket.seconds > 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

export { formatDuration as formatDurationReport };

export function buildListeningReportHtml(input: ListeningReportInput): string {
  const { rangeHint, generatedAt } = input;
  const summary = input.summary;
  const ranking = input.ranking;
  const buckets = summary?.buckets ?? [];
  const songs = (summary?.topSongs ?? []).slice(0, 10);
  const artists = (summary?.topArtists ?? []).slice(0, 8);
  const ranks = (ranking?.list ?? []).slice(0, 10);
  const me = ranking?.me ?? null;
  const total = summary?.totalSeconds ?? 0;
  const plays = summary?.totalPlays ?? 0;
  const activeDays = buckets.filter((bucket) => bucket.seconds > 0).length;
  const streak = longestStreak(buckets);
  const avgPerActive = activeDays > 0 ? Math.round(total / activeDays) : 0;
  const peakBucket = buckets.reduce<ReportBucket | null>(
    (best, bucket) => (!best || bucket.seconds > best.seconds ? bucket : best),
    null,
  );
  const peakSeconds = peakBucket?.seconds ?? 0;
  const peakLabel = peakBucket && peakSeconds > 0 ? fullLabel(peakBucket.label) : '—';
  const topSong = songs[0] ?? null;
  const topShare = topSong && total > 0 ? Math.round((topSong.seconds / total) * 100) : 0;
  const prevTotal = input.previous?.totalSeconds ?? 0;
  const prevPlays = input.previous?.totalPlays ?? 0;
  const totalDelta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const playsDelta = prevPlays > 0 ? Math.round(((plays - prevPlays) / prevPlays) * 100) : null;
  const deltaText = (delta: number) => `较上期 ${delta > 0 ? '+' : ''}${delta}%`;
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.seconds));
  const labelEvery = buckets.length > 16 ? 7 : buckets.length > 10 ? 3 : 1;
  // 年视图按月分桶，其余按天
  const bucketUnit = input.range === 'year' ? '个月' : '天';
  const heroTag =
    input.range === 'day'
      ? '今日主打'
      : input.range === 'month'
        ? '本月主打'
        : input.range === 'year'
          ? '年度主打'
          : '本周主打';
  const firstActive =
    peakSeconds > 0 ? buckets.findIndex((bucket) => bucket.seconds === peakSeconds) : -1;

  const heroValue =
    total >= 3600
      ? `<b>${Math.floor(total / 3600)}</b><i>小时</i><b>${Math.round((total % 3600) / 60)}</b><i>分</i>`
      : `<b>${Math.round(total / 60)}</b><i>分钟</i>`;

  const summaryLine =
    total > 0
      ? `这段时间你听了 <b>${songs.length}</b> 首不同的歌${
          topSong ? `，最常单曲循环《${escapeHtml(topSong.title)}》` : ''
        }。`
      : '这个窗口还没有播放记录，去大屏放首歌吧。';

  const streakBadge =
    streak > 1 ? `<span class="badge badge-violet">连续 ${streak} ${bucketUnit}有听歌</span>` : '';
  const deltaBadge =
    totalDelta === null
      ? ''
      : `<span class="badge ${totalDelta >= 0 ? 'badge-teal' : 'badge-muted'}">${totalDelta >= 0 ? '↑' : '↓'} ${deltaText(totalDelta)}</span>`;

  const bucketBars = buckets
    .map((bucket, index) => {
      const height = bucket.seconds > 0 ? Math.max(6, (bucket.seconds / maxBucket) * 100) : 0;
      const isPeak = bucket.seconds === peakSeconds && bucket.seconds > 0;
      const share = total > 0 ? Math.round((bucket.seconds / total) * 100) : 0;
      const diff = activeDays > 0 ? bucket.seconds - avgPerActive : 0;
      const tip =
        bucket.seconds > 0
          ? `${fullLabel(bucket.label)} · ${formatDuration(bucket.seconds)}`
          : `${fullLabel(bucket.label)} · 没有播放`;
      return `
        <button
          type="button"
          class="bar-col${isPeak ? ' peak' : ''}${bucket.seconds > 0 ? '' : ' zero'}${index === firstActive ? ' active' : ''}"
          data-label="${escapeHtml(fullLabel(bucket.label))}"
          data-short="${escapeHtml(shortLabel(bucket.label))}"
          data-seconds="${bucket.seconds}"
          data-share="${share}"
          data-diff="${diff}"
          aria-label="${escapeHtml(tip)}">
          <span class="bar-value">${bucket.seconds > 0 ? formatDuration(bucket.seconds) : ''}</span>
          <span class="bar-track"><span class="bar-fill" style="height:${height}%"></span></span>
          <span class="bar-label${index % labelEvery === 0 || index === buckets.length - 1 ? '' : ' dim'}">${escapeHtml(shortLabel(bucket.label))}</span>
        </button>`;
    })
    .join('');

  const songRows = songs.length
    ? songs
        .map((song, index) => {
          const share = total > 0 ? Math.max(4, Math.round((song.seconds / total) * 100)) : 0;
          const perPlay = song.plays > 0 ? Math.round(song.seconds / song.plays) : 0;
          return `
        <li class="song-row${index === 0 ? ' top1' : ''}">
          <button type="button" class="song-toggle" aria-expanded="false">
            <span class="rank${index === 0 ? ' first' : ''}">${index + 1}</span>
            ${
              song.cover
                ? `<img class="cover" src="${escapeHtml(song.cover)}?param=120y120" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
                : `<span class="cover cover-fallback">${escapeHtml(song.title.slice(0, 1))}</span>`
            }
            <span class="song-meta">
              <span class="song-title">${escapeHtml(song.title)}</span>
              <span class="song-artist">${escapeHtml(song.artist)} · ${song.plays} 次播放</span>
              <span class="song-share"><span style="width:${share}%"></span></span>
            </span>
            <span class="song-time">${formatDuration(song.seconds)}</span>
            <span class="chevron" aria-hidden>▾</span>
          </button>
          <div class="song-more">
            <div class="mini"><span>播放次数</span><b>${song.plays} 次</b></div>
            <div class="mini"><span>单次均长</span><b>${perPlay > 0 ? formatDuration(perPlay) : '—'}</b></div>
            <div class="mini"><span>占本窗口</span><b>${total > 0 ? Math.round((song.seconds / total) * 100) : 0}%</b></div>
            <div class="mini"><span>累计时长</span><b>${formatDuration(song.seconds)}</b></div>
          </div>
        </li>`;
        })
        .join('')
    : '<li class="empty">这个窗口里还没有播放记录。</li>';

  const artistRows = artists.length
    ? artists
        .map((artist) => {
          const share = total > 0 ? Math.max(4, Math.round((artist.seconds / total) * 100)) : 0;
          return `
        <li class="artist-card">
          ${
            artist.cover
              ? `<img class="artist-cover" src="${escapeHtml(artist.cover)}?param=160y160" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
              : `<span class="artist-cover cover-fallback">${escapeHtml(artist.artist.slice(0, 1))}</span>`
          }
          <span class="artist-meta">
            <span class="artist-name">${escapeHtml(artist.artist)}</span>
            <span class="artist-sub">${artist.songCount} 首 · ${artist.plays} 次播放</span>
            <span class="artist-share"><span style="width:${share}%"></span></span>
          </span>
          <span class="artist-time">${formatDuration(artist.seconds)}</span>
        </li>`;
        })
        .join('')
    : '<li class="empty">还没有足够数据生成歌手榜。</li>';

  const maxRankSeconds = Math.max(1, ...ranks.map((entry) => entry.seconds));
  const rankRows = ranks.length
    ? ranks
        .map((entry) => {
          const share = Math.max(4, Math.round((entry.seconds / maxRankSeconds) * 100));
          const isMe = me?.userId === entry.userId;
          return `
        <li class="rank-row${isMe ? ' me' : ''}">
          <span class="rank${entry.rank === 1 ? ' first' : ''}">${entry.rank}</span>
          <span class="rank-name">${escapeHtml(entry.userName)}${isMe ? '<em class="me-tag">我</em>' : ''}</span>
          <span class="rank-share"><span style="width:${share}%"></span></span>
          <span class="rank-time">${formatDuration(entry.seconds)}</span>
        </li>`;
        })
        .join('')
    : '<li class="empty">还没有人听过歌。</li>';

  const rankTotal = ranking?.list.length ?? 0;
  const myRankLine = me
    ? `全站第 ${me.rank} 名${rankTotal > 1 ? ` · 榜单 ${rankTotal} 人` : ''}`
    : ranks.length
      ? '尚未进入榜单'
      : '暂无排名数据';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atlas 听歌报告 · ${escapeHtml(rangeHint)}${topSong ? ` · ${escapeHtml(topSong.title)}` : ''}</title>
<style>
  :root {
    --bg: #f3f1ea;
    --card: rgba(255, 255, 255, 0.92);
    --ink: #191922;
    --ink-2: #4d4d5c;
    --muted: #82828f;
    --line: rgba(25, 25, 34, 0.08);
    --violet: #5b4bdb;
    --violet-soft: rgba(91, 75, 219, 0.1);
    --teal: #0e9f9f;
    --teal-soft: rgba(14, 159, 159, 0.1);
    --amber: #e8873a;
    --shadow: 0 18px 40px rgba(25, 25, 34, 0.07), 0 2px 6px rgba(25, 25, 34, 0.04);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    min-height: 100vh;
    font-family: 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', system-ui, sans-serif;
    color: var(--ink);
    background:
      radial-gradient(46% 32% at 6% -2%, rgba(91, 75, 219, 0.12), transparent 70%),
      radial-gradient(40% 30% at 98% 4%, rgba(14, 159, 159, 0.1), transparent 70%),
      radial-gradient(50% 36% at 60% 104%, rgba(232, 135, 58, 0.07), transparent 72%),
      var(--bg);
    background-attachment: fixed;
    padding: 28px 18px 64px;
    display: flex;
    justify-content: center;
  }
  .wrap { width: 100%; max-width: 900px; }

  /* ---------- 顶栏 ---------- */
  .topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding: 0 4px; }
  .brand-main { font-size: 15px; font-weight: 800; letter-spacing: 0.24em; color: var(--violet); }
  .brand-sub { font-size: 10px; font-weight: 600; letter-spacing: 0.18em; color: var(--muted); }
  .topbar .spacer { flex: 1; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    white-space: nowrap;
    padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 600;
    color: var(--ink-2); background: rgba(255, 255, 255, 0.8); border: 1px solid var(--line);
  }
  .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); }
  .print-btn {
    border: 1px solid var(--line); background: rgba(255, 255, 255, 0.9); color: var(--ink-2);
    border-radius: 999px; padding: 6px 14px; font-size: 11px; font-weight: 600; cursor: pointer;
    transition: all 0.15s ease;
  }
  .print-btn:hover { border-color: rgba(91, 75, 219, 0.35); color: var(--violet); background: #fff; }

  /* ---------- 卡片 ---------- */
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 22px;
    box-shadow: var(--shadow);
    padding: 24px;
    margin-bottom: 16px;
    backdrop-filter: blur(8px);
  }
  .card-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; }
  .card-head h2 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .card-head .en { margin-left: auto; font-size: 9px; font-weight: 700; letter-spacing: 0.22em; color: var(--muted); }

  /* ---------- Hero ---------- */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 20px;
    align-items: center;
    background:
      radial-gradient(70% 120% at 0% 0%, rgba(91, 75, 219, 0.13), transparent 62%),
      radial-gradient(60% 110% at 100% 100%, rgba(14, 159, 159, 0.1), transparent 64%),
      var(--card);
    padding: 26px 26px 22px;
  }
  .hero-range { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .badge {
    display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 6px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  }
  .badge-violet { background: var(--violet-soft); color: var(--violet); }
  .badge-teal { background: var(--teal-soft); color: var(--teal); }
  .badge-amber { background: rgba(232, 135, 58, 0.12); color: #b4611f; }
  .badge-muted { background: rgba(25, 25, 34, 0.06); color: var(--muted); }
  .big {
    margin: 14px 0 8px;
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: clamp(50px, 6.8vw, 68px);
    line-height: 1;
    font-weight: 800;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .big b {
    background: linear-gradient(118deg, #5b4bdb 8%, #0e9f9f 92%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .big i {
    font-style: normal;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--ink-2);
  }
  .hero-line { font-size: 13px; color: var(--ink-2); line-height: 1.7; }
  .hero-line b { color: var(--ink); font-weight: 700; }
  .hero-side { text-align: center; }
  .hero-cover-wrap { position: relative; width: 152px; height: 152px; }
  .hero-cover {
    width: 152px; height: 152px; border-radius: 18px; object-fit: cover;
    box-shadow: 0 16px 30px rgba(25, 25, 34, 0.18);
    background: var(--violet-soft);
    display: flex; align-items: center; justify-content: center;
    font-size: 44px; font-weight: 800; color: var(--violet);
  }
  .hero-cover-tag {
    position: absolute; left: 50%; bottom: -10px; transform: translateX(-50%);
    white-space: nowrap; padding: 4px 10px; border-radius: 999px;
    background: var(--ink); color: #fff; font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  }
  .hero-song { margin-top: 20px; font-size: 12px; font-weight: 700; }
  .hero-artist { margin-top: 3px; font-size: 10px; color: var(--muted); }

  /* ---------- KPI ---------- */
  .kpis {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
    margin-top: 22px; grid-column: 1 / -1;
  }
  .kpi {
    background: rgba(255, 255, 255, 0.7); border: 1px solid var(--line);
    border-radius: 14px; padding: 12px 14px;
  }
  .kpi .k { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; color: var(--muted); }
  .kpi .v {
    margin-top: 6px; font-size: 21px; font-weight: 800; letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .kpi .v small { font-size: 11px; font-weight: 600; color: var(--muted); margin-left: 2px; }
  .kpi .s { margin-top: 3px; font-size: 10px; color: var(--muted); }

  /* ---------- 趋势 ---------- */
  .chart {
    display: flex; align-items: flex-end; justify-content: center; gap: clamp(6px, 2vw, 16px);
    height: 210px; padding: 8px 2px 0; border-bottom: 1px solid var(--line);
    background-image: linear-gradient(to top, rgba(25, 25, 34, 0.05) 1px, transparent 1px);
    background-size: 100% 33.333%;
  }
  .bar-col {
    flex: 1 1 0; max-width: 100px; min-width: 0; height: 100%; display: flex; flex-direction: column;
    align-items: center; gap: 5px; background: none; border: 0; cursor: pointer;
    padding: 0; font: inherit; border-radius: 8px 8px 0 0;
    transition: background 0.15s ease;
  }
  .bar-col:hover { background: rgba(91, 75, 219, 0.05); }
  .bar-col:focus-visible { outline: 2px solid rgba(91, 75, 219, 0.45); outline-offset: 2px; }
  .bar-value {
    font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums;
    white-space: nowrap; opacity: 0; transition: opacity 0.15s ease;
  }
  .bar-col.peak .bar-value, .bar-col:hover .bar-value, .bar-col.active .bar-value { opacity: 1; }
  .bar-track { width: 100%; flex: 1; display: flex; align-items: flex-end; }
  .bar-fill {
    width: 100%; border-radius: 6px 6px 3px 3px;
    background: linear-gradient(180deg, rgba(91, 75, 219, 0.5), rgba(91, 75, 219, 0.16));
    transition: filter 0.15s ease;
  }
  .bar-col.peak .bar-fill { background: linear-gradient(180deg, #5b4bdb, #7f6ff0); }
  .bar-col.active .bar-fill { filter: saturate(1.15) brightness(1.04); }
  .bar-col.zero .bar-track { align-items: flex-end; }
  .bar-col.zero .bar-track::after {
    content: ''; width: 5px; height: 5px; border-radius: 50%; background: rgba(25, 25, 34, 0.14);
    margin-bottom: 2px;
  }
  .bar-col.zero .bar-label { color: rgba(130, 130, 143, 0.55); }
  .bar-label {
    font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .bar-label.dim { opacity: 0.4; }
  .day-detail {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    margin-top: 14px; padding: 12px 14px; border-radius: 12px;
    background: rgba(91, 75, 219, 0.05); border: 1px dashed rgba(91, 75, 219, 0.22);
  }
  .day-detail .day { font-size: 12px; font-weight: 700; }
  .day-detail .metrics { display: flex; gap: 18px; flex-wrap: wrap; margin-left: auto; }
  .day-detail .metrics span { font-size: 11px; color: var(--muted); }
  .day-detail .metrics b { color: var(--ink); font-weight: 700; margin-left: 4px; }
  .hint { margin-top: 10px; font-size: 10px; color: var(--muted); }

  /* ---------- Tabs ---------- */
  .tabs {
    display: flex; gap: 4px; padding: 4px; background: rgba(25, 25, 34, 0.045);
    border-radius: 12px; width: fit-content; margin-bottom: 18px;
  }
  .tab {
    border: 0; background: none; cursor: pointer; font: inherit;
    padding: 7px 14px; border-radius: 9px; font-size: 12px; font-weight: 600;
    color: var(--muted); transition: all 0.15s ease;
  }
  .tab .count { font-size: 9px; margin-left: 5px; opacity: 0.65; font-variant-numeric: tabular-nums; }
  .tab[aria-selected='true'] { background: #fff; color: var(--ink); box-shadow: 0 1px 3px rgba(25, 25, 34, 0.12); }
  .tab:focus-visible { outline: 2px solid rgba(91, 75, 219, 0.45); outline-offset: 1px; }
  .panel[hidden] { display: none; }

  /* ---------- 歌曲 ---------- */
  ol.songs, ol.artists, ol.ranks { list-style: none; }
  .song-row { border-radius: 14px; margin-bottom: 6px; overflow: hidden; border: 1px solid transparent; }
  .song-row.top1 { background: rgba(91, 75, 219, 0.055); border-color: rgba(91, 75, 219, 0.14); }
  .song-toggle {
    width: 100%; display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; background: none; border: 0; cursor: pointer; font: inherit;
    text-align: left; border-radius: 14px; transition: background 0.15s ease;
  }
  .song-toggle:hover { background: rgba(25, 25, 34, 0.035); }
  .song-toggle:focus-visible { outline: 2px solid rgba(91, 75, 219, 0.45); outline-offset: -2px; }
  .rank {
    flex: none; width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; background: rgba(25, 25, 34, 0.06); color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .rank.first { background: linear-gradient(135deg, #5b4bdb, #8a7bf0); color: #fff; }
  .cover {
    flex: none; width: 44px; height: 44px; border-radius: 9px; object-fit: cover;
    background: linear-gradient(135deg, rgba(91, 75, 219, 0.18), rgba(14, 159, 159, 0.14));
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 800; color: var(--violet);
  }
  .song-meta { flex: 1; min-width: 0; }
  .song-title { display: block; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .song-artist { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .song-share, .rank-share, .artist-share {
    display: block; height: 4px; border-radius: 4px; background: rgba(25, 25, 34, 0.07);
    overflow: hidden; margin-top: 7px;
  }
  .song-share span, .rank-share span, .artist-share span {
    display: block; height: 100%; border-radius: 4px;
    background: linear-gradient(90deg, #5b4bdb, rgba(91, 75, 219, 0.45));
  }
  .song-time { flex: none; font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .chevron { flex: none; font-size: 10px; color: var(--muted); transition: transform 0.2s ease; }
  .song-row.open .chevron { transform: rotate(180deg); }
  .song-more {
    display: none; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
    padding: 2px 12px 14px 92px;
  }
  .song-row.open .song-more { display: grid; }
  .mini { background: rgba(255, 255, 255, 0.75); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; }
  .mini span { display: block; font-size: 9px; color: var(--muted); }
  .mini b { display: block; margin-top: 3px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }

  /* ---------- 歌手 ---------- */
  .artist-card {
    display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    border-radius: 14px; border: 1px solid transparent; margin-bottom: 6px;
    transition: background 0.15s ease;
  }
  .artist-card:hover { background: rgba(25, 25, 34, 0.03); }
  .artist-cover {
    flex: none; width: 48px; height: 48px; border-radius: 50%; object-fit: cover;
    background: linear-gradient(135deg, rgba(14, 159, 159, 0.18), rgba(91, 75, 219, 0.14));
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 800; color: var(--teal);
  }
  .artist-meta { flex: 1; min-width: 0; }
  .artist-name { display: block; font-size: 13px; font-weight: 600; }
  .artist-sub { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .artist-share span { background: linear-gradient(90deg, #0e9f9f, rgba(14, 159, 159, 0.4)); }
  .artist-time { flex: none; font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }

  /* ---------- 排名 ---------- */
  .my-rank {
    display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px;
    background: linear-gradient(120deg, rgba(91, 75, 219, 0.09), rgba(14, 159, 159, 0.07));
    border: 1px solid rgba(91, 75, 219, 0.16); margin-bottom: 14px;
  }
  .my-rank .medal { font-size: 24px; }
  .my-rank .label { font-size: 10px; color: var(--muted); letter-spacing: 0.08em; }
  .my-rank .value { font-size: 15px; font-weight: 800; margin-top: 2px; }
  .my-rank .value small { font-size: 11px; font-weight: 600; color: var(--muted); margin-left: 6px; }
  .rank-row {
    display: flex; align-items: center; gap: 12px; padding: 9px 12px;
    border-radius: 12px; border: 1px solid transparent; margin-bottom: 4px;
  }
  .rank-row.me { background: rgba(91, 75, 219, 0.07); border-color: rgba(91, 75, 219, 0.18); }
  .rank-name { flex: none; width: 96px; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-name .me-tag {
    font-style: normal; font-size: 9px; font-weight: 700; color: var(--violet);
    border: 1px solid rgba(91, 75, 219, 0.4); border-radius: 4px; padding: 0 4px; margin-left: 5px;
  }
  .rank-share { flex: 1; margin-top: 0; }
  .rank-share span { background: linear-gradient(90deg, rgba(14, 159, 159, 0.75), rgba(14, 159, 159, 0.3)); }
  .rank-row.me .rank-share span { background: linear-gradient(90deg, #5b4bdb, rgba(91, 75, 219, 0.35)); }
  .rank-time { flex: none; width: 96px; text-align: right; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

  .empty { padding: 30px 18px; text-align: center; font-size: 12px; color: var(--muted); }
  .foot { margin-top: 26px; text-align: center; font-size: 11px; color: var(--muted); line-height: 1.9; }
  .foot b { color: var(--ink-2); font-weight: 600; }

  @media (max-width: 640px) {
    body { padding: 16px 12px 40px; }
    .topbar { flex-wrap: wrap; gap: 8px; }
    .brand-sub { display: none; }
    .print-btn { padding: 6px 10px; }
    .card { padding: 16px; border-radius: 18px; }
    .hero { grid-template-columns: minmax(0, 1fr); padding: 18px; }
    .hero-side { display: flex; align-items: center; gap: 14px; text-align: left; }
    .hero-cover-wrap, .hero-cover { width: 88px; height: 88px; }
    .hero-cover { border-radius: 14px; }
    .hero-cover-tag { display: none; }
    .hero-song { margin-top: 0; font-size: 13px; }
    .big { gap: 6px; }
    .big i { font-size: 15px; }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .song-toggle { gap: 8px; padding: 10px 6px; }
    .song-time { font-size: 10px; white-space: nowrap; }
    .song-more { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-left: 6px; }
    .rank-name { width: 62px; }
    .rank-time { width: 62px; font-size: 10px; }
    .day-detail { gap: 8px; }
    .day-detail .metrics { margin-left: 0; gap: 10px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .card { box-shadow: none; border-color: #e6e6ec; break-inside: avoid; backdrop-filter: none; }
    .no-print { display: none !important; }
    .tab[aria-selected='true'] { box-shadow: none; }
    .panel[hidden] { display: block !important; }
    .panel { margin-top: 16px; }
    .song-more { display: grid !important; }
    .big b { background: none; color: #221f4d; -webkit-text-fill-color: currentColor; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div>
        <div class="brand-main">ATLAS</div>
        <div class="brand-sub">LISTENING REPORT · 个人成长系统</div>
      </div>
      <div class="spacer"></div>
      <span class="pill"><span class="dot"></span>${escapeHtml(rangeHint)}</span>
      <button type="button" class="print-btn no-print" onclick="window.print()">打印 / 存 PDF</button>
    </div>

    <section class="card hero">
      <div>
        <div class="hero-range">
          ${deltaBadge}
          ${streakBadge}
          ${activeDays > 0 ? `<span class="badge badge-teal">活跃 ${activeDays} / ${buckets.length} ${bucketUnit}</span>` : ''}
        </div>
        <div class="big">${heroValue}</div>
        <div class="hero-line">${summaryLine}</div>
      </div>
      <div class="hero-side">
        ${
          topSong
            ? `<div class="hero-cover-wrap">
          ${
            topSong.cover
              ? `<img class="hero-cover" src="${escapeHtml(topSong.cover)}?param=320y320" alt="" onerror="this.style.visibility='hidden'">`
              : `<span class="hero-cover">${escapeHtml(topSong.title.slice(0, 1))}</span>`
          }
          <span class="hero-cover-tag">${escapeHtml(heroTag)}</span>
        </div>
        <div class="hero-song">${escapeHtml(topSong.title)}</div>
        <div class="hero-artist">${escapeHtml(topSong.artist)}${topShare > 0 ? ` · 占 ${topShare}%` : ''}</div>`
            : ''
        }
      </div>
      <div class="kpis">
        <div class="kpi"><div class="k">播放次数</div><div class="v">${plays}<small>次</small></div><div class="s">${playsDelta === null ? `上榜 ${songs.length} 首` : deltaText(playsDelta)}</div></div>
        <div class="kpi"><div class="k">活跃${bucketUnit === '个月' ? '月份' : '天数'}</div><div class="v">${activeDays}<small>/ ${buckets.length} ${bucketUnit}</small></div><div class="s">窗口共 ${buckets.length} ${bucketUnit}</div></div>
        <div class="kpi"><div class="k">日均时长</div><div class="v">${activeDays > 0 ? formatDuration(avgPerActive) : '—'}</div><div class="s">仅统计有听歌的日子</div></div>
        <div class="kpi"><div class="k">峰值日</div><div class="v">${peakBucket && peakSeconds > 0 ? escapeHtml(shortLabel(peakBucket.label)) : '—'}</div><div class="s">${peakSeconds > 0 ? formatDuration(peakSeconds) : '暂无数据'}</div></div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>听歌趋势</h2>
        <span class="en">LISTENING TREND</span>
      </div>
      <div class="chart" role="group" aria-label="逐日听歌时长，点击查看当天明细">${bucketBars}</div>
      <div class="day-detail" id="day-detail">
        ${
          total > 0
            ? `<span class="day">${escapeHtml(peakLabel)}</span>
        <span class="metrics">
          <span>当日时长<b>${peakSeconds > 0 ? formatDuration(peakSeconds) : '—'}</b></span>
          <span>占本窗口<b>${total > 0 ? Math.round((peakSeconds / total) * 100) : 0}%</b></span>
          <span>对比日均<b>${peakSeconds > avgPerActive ? '多' : '少'} ${formatDuration(Math.abs(peakSeconds - avgPerActive))}</b></span>
        </span>`
            : '<span class="metrics"><span>这个窗口还没有播放记录</span></span>'
        }
      </div>
      <p class="hint no-print">点击上方任意柱子查看那一天的明细；数据来自播放器心跳，按天归集。</p>
    </section>

    <section class="card">
      <div class="tabs no-print" role="tablist" aria-label="报告视图">
        <button type="button" class="tab" role="tab" data-tab="songs" aria-selected="true" aria-controls="panel-songs">歌曲<span class="count">${songs.length}</span></button>
        <button type="button" class="tab" role="tab" data-tab="artists" aria-selected="false" aria-controls="panel-artists">歌手<span class="count">${artists.length}</span></button>
        <button type="button" class="tab" role="tab" data-tab="ranking" aria-selected="false" aria-controls="panel-ranking">全站排名<span class="count">${ranks.length}</span></button>
      </div>

      <div class="panel" id="panel-songs" role="tabpanel">
        <div class="card-head" style="margin-bottom:10px">
          <h2 style="font-size:13px">最常播放</h2>
          <span class="en">TOP TRACKS</span>
        </div>
        <ol class="songs">${songRows}</ol>
        <p class="hint no-print">点击任意歌曲展开播放次数与单次均长。</p>
      </div>

      <div class="panel" id="panel-artists" role="tabpanel" hidden>
        <div class="card-head" style="margin-bottom:10px">
          <h2 style="font-size:13px">歌手分布</h2>
          <span class="en">TOP ARTISTS</span>
        </div>
        <ol class="artists">${artistRows}</ol>
        <p class="hint no-print">按累计收听时长排序，展示这段时间的口味重心。</p>
      </div>

      <div class="panel" id="panel-ranking" role="tabpanel" hidden>
        <div class="my-rank">
          <span class="medal">${me ? (me.rank === 1 ? '🥇' : me.rank <= 3 ? '🏅' : '📍') : '·'}</span>
          <div>
            <div class="label">${me ? '我的全站排名' : '全站排名'}</div>
            <div class="value">${escapeHtml(myRankLine)}</div>
          </div>
        </div>
        <ol class="ranks">${rankRows}</ol>
        <p class="hint no-print">排名按本窗口累计收听时长，跨全部注册用户聚合。</p>
      </div>
    </section>

    <div class="foot">
      <b>ATLAS · 个人成长系统</b><br>
      数据来自播放器实时心跳 · 生成于 ${escapeHtml(generatedAt.toLocaleString('zh-CN'))} · 用浏览器打印可保存为 PDF
    </div>
  </div>

  <script>
    (function () {
      'use strict';
      // ---- 视图切换 ----
      var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
      function selectTab(name) {
        tabs.forEach(function (tab) {
          var on = tab.getAttribute('data-tab') === name;
          tab.setAttribute('aria-selected', on ? 'true' : 'false');
          var panel = document.getElementById('panel-' + tab.getAttribute('data-tab'));
          if (panel) panel.hidden = !on;
        });
      }
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          selectTab(tab.getAttribute('data-tab'));
        });
      });

      // ---- 歌曲展开 ----
      Array.prototype.forEach.call(document.querySelectorAll('.song-toggle'), function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('.song-row');
          if (!row) return;
          var open = row.classList.toggle('open');
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      });

      // ---- 柱子点击：更新当天明细 ----
      var detail = document.getElementById('day-detail');
      var bars = Array.prototype.slice.call(document.querySelectorAll('.bar-col'));
      function fmt(seconds) {
        var m = Math.round(seconds / 60);
        if (m < 60) return m + ' 分钟';
        var h = Math.floor(m / 60);
        var rest = m % 60;
        return h + ' 小时' + (rest ? ' ' + rest + ' 分' : '');
      }
      bars.forEach(function (bar) {
        bar.addEventListener('click', function () {
          bars.forEach(function (item) { item.classList.remove('active'); });
          bar.classList.add('active');
          if (!detail) return;
          var seconds = Number(bar.getAttribute('data-seconds') || 0);
          var share = Number(bar.getAttribute('data-share') || 0);
          var diff = Number(bar.getAttribute('data-diff') || 0);
          var label = bar.getAttribute('data-label') || '';
          var body = seconds > 0
            ? '<span class="metrics">' +
              '<span>当日时长<b>' + fmt(seconds) + '</b></span>' +
              '<span>占本窗口<b>' + share + '%</b></span>' +
              '<span>对比日均<b>' + (diff >= 0 ? '多 ' : '少 ') + fmt(Math.abs(diff)) + '</b></span>' +
              '</span>'
            : '<span class="metrics"><span>这一天没有播放记录</span></span>';
          detail.innerHTML = '<span class="day"></span>' + body;
          detail.querySelector('.day').textContent = label;
        });
      });
    })();
  </script>
</body>
</html>`;
}

/** 报告/数据下载助手 */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // 立即 revoke 会让部分浏览器取消下载，交给下一轮事件循环回收
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
