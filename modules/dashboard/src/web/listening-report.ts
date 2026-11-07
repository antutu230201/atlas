type Range = 'day' | 'week' | 'month' | 'year';

/**
 * 听歌报告模板：把统计页数据渲染成一张自包含的大屏风格 HTML 报告单页。
 * 可直接浏览器打开、打印存 PDF；无外部资源依赖（内联样式 + 系统字体）。
 */

export interface ReportBucket {
  label: string;
  seconds: number;
}

export interface ReportSong {
  songId: number;
  title: string;
  artist: string;
  seconds: number;
  plays: number;
}

export interface ReportRank {
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
  } | null;
  ranking: {
    list: ReportRank[];
    me: { rank: number; userName: string; seconds: number } | null;
  } | null;
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

export function buildListeningReportHtml(input: ListeningReportInput): string {
  const { rangeHint, generatedAt } = input;
  const summary = input.summary;
  const ranking = input.ranking;
  const buckets = summary?.buckets ?? [];
  const songs = (summary?.topSongs ?? []).slice(0, 10);
  const ranks = (ranking?.list ?? []).slice(0, 10);
  const me = ranking?.me ?? null;
  const total = summary?.totalSeconds ?? 0;
  const plays = summary?.totalPlays ?? 0;
  const maxBucket = Math.max(1, ...buckets.map((b) => b.seconds));
  const labelEvery = buckets.length > 16 ? 7 : buckets.length > 10 ? 3 : 1;

  const bucketBars = buckets
    .map((bucket, index) => {
      const height = Math.max(bucket.seconds > 0 ? 8 : 3, (bucket.seconds / maxBucket) * 100);
      const isPeak = bucket.seconds === maxBucket && bucket.seconds > 0;
      return `
      <div class="bar-col">
        <div class="bar-value">${bucket.seconds > 0 ? formatDuration(bucket.seconds) : ''}</div>
        <div class="bar-track"><div class="bar-fill${isPeak ? ' peak' : ''}" style="height:${height}%"></div></div>
        <div class="bar-label${index % labelEvery === 0 || index === buckets.length - 1 ? '' : ' dim'}">${escapeHtml(shortLabel(bucket.label))}</div>
      </div>`;
    })
    .join('');

  const songRows = songs.length
    ? songs
        .map((song, index) => {
          const share = total > 0 ? Math.max(6, (song.seconds / total) * 100) : 0;
          return `
      <li class="song-row${index === 0 ? ' top1' : ''}">
        <span class="rank${index === 0 ? ' first' : ''}">${index + 1}</span>
        <span class="song-meta">
          <span class="song-title">${escapeHtml(song.title)}</span>
          <span class="song-artist">${escapeHtml(song.artist)} · ${song.plays} 次播放</span>
          <span class="song-share"><span style="width:${share}%"></span></span>
        </span>
        <span class="song-time">${formatDuration(song.seconds)}</span>
      </li>`;
        })
        .join('')
    : `<li class="empty">这个窗口里还没有播放记录。</li>`;

  const rankRows = ranks.length
    ? ranks
        .map((entry) => {
          const share = Math.max(
            4,
            (entry.seconds / Math.max(1, ...ranks.map((r) => r.seconds))) * 100,
          );
          const isMe = me?.userName === entry.userName;
          return `
      <li class="rank-row${isMe ? ' me' : ''}">
        <span class="rank${entry.rank === 1 ? ' first' : ''}">${entry.rank}</span>
        <span class="rank-name">${escapeHtml(entry.userName)}${isMe ? ' <em class="me-tag">我</em>' : ''}</span>
        <span class="rank-share"><span style="width:${share}%"></span></span>
        <span class="rank-time">${formatDuration(entry.seconds)}</span>
      </li>`;
        })
        .join('')
    : `<li class="empty">还没有人听过歌。</li>`;

  const meLine = me
    ? `全站第 ${me.rank} 名（共 ${ranks.length} 人上榜）`
    : ranks.length
      ? '尚未进入榜单'
      : '暂无排名数据';
  const topLine = songs.length ? `最常听《${escapeHtml(songs[0]!.title)}》` : '暂无播放记录';

  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atlas 听歌报告 · ${escapeHtml(rangeHint)} · ${escapeHtml(topLine.replace('最常听《', '').replace('》', ''))}</title>
<style>
  :root {
    --accent: #aa9bff;
    --accent-soft: rgba(170, 155, 255, 0.14);
    --cyan: #72e2e7;
    --panel: rgba(17, 19, 28, 0.88);
    --border: rgba(255, 255, 255, 0.09);
    --border-bright: rgba(255, 255, 255, 0.18);
    --text: #e8e8f2;
    --muted: #8a8aa4;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    font-family: 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif;
    background: #0b0d14;
    background-image:
      radial-gradient(60% 42% at 8% 0%, rgba(170, 155, 255, 0.14), transparent 70%),
      radial-gradient(42% 36% at 96% 6%, rgba(114, 226, 231, 0.1), transparent 70%),
      radial-gradient(40% 34% at 55% 100%, rgba(231, 166, 216, 0.06), transparent 70%);
    color: var(--text);
    display: flex;
    justify-content: center;
    padding: 40px 16px 56px;
  }
  .wrap { width: 100%; max-width: 760px; }
  .brand { text-align: center; margin-bottom: 26px; }
  .brand .logo { font-size: 22px; font-weight: 700; letter-spacing: 0.3em; color: var(--accent); }
  .brand .sub { margin-top: 8px; font-size: 10px; font-weight: 600; letter-spacing: 0.22em; color: var(--muted); }
  .card {
    position: relative;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    margin-top: 16px;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.32);
  }
  .hero { padding: 30px 26px; }
  .hero .range { font-size: 11px; font-weight: 600; letter-spacing: 0.2em; color: var(--muted); }
  .hero .big {
    margin-top: 10px;
    font-size: 44px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: linear-gradient(120deg, var(--accent), var(--cyan));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero .line { margin-top: 10px; font-size: 13px; color: var(--muted); }
  .hero .line b { color: var(--text); }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
  .kpi { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
  .kpi .k { font-size: 10px; letter-spacing: 0.16em; color: var(--muted); }
  .kpi .v { margin-top: 4px; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
  h2 { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  h2 .en { margin-left: auto; font-size: 9px; font-weight: 600; letter-spacing: 0.2em; color: var(--muted); }
  .chart { display: flex; align-items: flex-end; gap: 4px; height: 150px; margin-top: 18px; }
  .bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
  .bar-value { font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bar-track { width: 100%; height: 100%; display: flex; align-items: flex-end; }
  .bar-fill {
    width: 100%;
    border-radius: 4px 4px 0 0;
    background: linear-gradient(180deg, var(--accent), rgba(170, 155, 255, 0.35));
  }
  .bar-fill.peak { background: linear-gradient(180deg, var(--cyan), var(--accent)); }
  .bar-label { font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .bar-label.dim { opacity: 0.45; }
  ol { list-style: none; margin-top: 14px; }
  .song-row, .rank-row {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 10px; border-radius: 10px; margin-bottom: 6px;
    border: 1px solid transparent;
  }
  .song-row.top1, .rank-row.me { background: var(--accent-soft); border-color: rgba(170, 155, 255, 0.3); }
  .rank, .rank-name, .rank-time, .song-time { font-variant-numeric: tabular-nums; }
  .rank {
    flex: none; width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; background: rgba(255, 255, 255, 0.08); color: var(--muted);
  }
  .rank.first { background: linear-gradient(135deg, var(--accent), rgba(170, 155, 255, 0.55)); color: #14141f; }
  .song-meta, .rank-name { flex: 1; min-width: 0; }
  .song-title { display: block; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .song-artist { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .song-share, .rank-share { display: block; height: 4px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); overflow: hidden; margin-top: 6px; }
  .song-share span, .rank-share span { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), rgba(170, 155, 255, 0.5)); }
  .song-time, .rank-time { flex: none; font-size: 12px; color: var(--muted); }
  .me-tag {
    font-style: normal; font-size: 10px; font-weight: 700;
    color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 1px 4px; margin-left: 6px;
  }
  .empty { padding: 18px; text-align: center; font-size: 12px; color: var(--muted); }
  .foot { margin-top: 26px; text-align: center; font-size: 11px; color: var(--muted); line-height: 1.8; }
  .foot .tip { opacity: 0.7; }
  @media print {
    body { background: #0b0d14; padding: 0; }
    .card { box-shadow: none; break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <div class="logo">ATLAS</div>
      <div class="sub">LISTENING REPORT · 个人成长系统</div>
    </div>

    <section class="card hero">
      <div class="range">听歌报告 · ${escapeHtml(rangeHint)}</div>
      <div class="big">${escapeHtml(formatDuration(total))}</div>
      <div class="line">${topLine} · <b>${meLine}</b></div>
      <div class="kpis">
        <div class="kpi"><div class="k">播放次数</div><div class="v">${plays}</div></div>
        <div class="kpi"><div class="k">收听歌曲</div><div class="v">${songs.length || 0} 首</div></div>
        <div class="kpi"><div class="k">覆盖天数</div><div class="v">${buckets.filter((b) => b.seconds > 0).length} 天</div></div>
      </div>
    </section>

    <section class="card">
      <h2>听歌趋势 <span class="en">${escapeHtml(rangeHint)}</span></h2>
      <div class="chart">${bucketBars}</div>
    </section>

    <section class="card">
      <h2>最常播放 <span class="en">TOP TRACKS</span></h2>
      <ol>${songRows}</ol>
    </section>

    <section class="card">
      <h2>全站排名 <span class="en">GLOBAL RANKING</span></h2>
      <ol>${rankRows}</ol>
    </section>

    <div class="foot">
      ATLAS · 个人成长系统 · 数据来自播放器实时心跳统计<br>
      <span class="tip">生成于 ${escapeHtml(generatedAt.toLocaleString('zh-CN'))} · 用浏览器打印可保存为 PDF</span>
    </div>
  </div>
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
  URL.revokeObjectURL(url);
}
