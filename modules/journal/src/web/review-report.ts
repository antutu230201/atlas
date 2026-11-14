import type { EntryView } from '../index';

/**
 * 复盘月度报告模板：把月快照数据渲染成一张自包含的明亮风格 HTML 报告单页
 * （与听歌报告同一设计语言）。无外部依赖（内联样式 + 少量原生 JS）：
 * 可直接浏览器打开、打印存 PDF。零 AI：数据全部来自 snapshot 聚合。
 */

export interface JournalReportInput {
  month: string;
  generatedAt: Date;
  entries: EntryView[];
  summary: { monthDaily: number; monthWeekly: number; streak: number };
}

const MOODS = [
  { value: 1, emoji: '😞', label: '很难' },
  { value: 2, emoji: '😕', label: '不佳' },
  { value: 3, emoji: '😐', label: '一般' },
  { value: 4, emoji: '🙂', label: '不错' },
  { value: 5, emoji: '😄', label: '很好' },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moodEmoji(mood: number | null): string {
  return MOODS.find((item) => item.value === mood)?.emoji ?? '·';
}

function moodLabel(mood: number | null): string {
  return MOODS.find((item) => item.value === mood)?.label ?? '未记录';
}

/** 2026-11-07 → 11 月 7 日 */
function dayLabel(day: string): string {
  const parts = day.split('-');
  return parts.length === 3 ? `${Number(parts[1])} 月 ${Number(parts[2])} 日` : day;
}

export function buildJournalReportHtml(input: JournalReportInput): string {
  const { month, generatedAt, summary } = input;
  const [year, monthNum] = month.split('-').map(Number);
  const monthTitle = `${year} 年 ${monthNum} 月`;
  const daysInMonth = new Date(year!, monthNum!, 0).getDate();

  const dailies = input.entries
    .filter((item) => item.kind === 'daily')
    .sort((a, b) => a.day.localeCompare(b.day));
  const weeklies = input.entries
    .filter((item) => item.kind === 'weekly')
    .sort((a, b) => a.day.localeCompare(b.day));
  const moods = dailies.filter((item) => item.mood !== null);
  const avgMood = moods.length
    ? Math.round(
        (moods.reduce((sum, item) => sum + (item.mood as number), 0) / moods.length) * 10,
      ) / 10
    : null;
  const totalChars = input.entries.reduce((sum, item) => sum + item.content.length, 0);
  const distribution = MOODS.map((item) => ({
    ...item,
    count: moods.filter((entry) => entry.mood === item.value).length,
  }));
  const bestDay = moods.reduce<EntryView | null>((top, item) => {
    if (!top) return item;
    return (item.mood as number) > (top.mood as number) ? item : top;
  }, null);
  const worstMood = moods.reduce<EntryView | null>((low, item) => {
    if (!low) return item;
    return (item.mood as number) < (low.mood as number) ? item : low;
  }, null);
  const maxChars = Math.max(1, ...dailies.map((item) => item.content.length));

  const heroValue =
    summary.monthDaily > 0 ? `<b>${summary.monthDaily}</b><i>篇日记</i>` : '<b>0</b><i>篇日记</i>';
  const summaryLine =
    input.entries.length > 0
      ? `这个月你写了 <b>${summary.monthDaily}</b> 篇日记、<b>${summary.monthWeekly}</b> 篇周复盘${
          avgMood !== null ? `，平均心情 <b>${avgMood}</b> / 5` : ''
        }，累计 <b>${totalChars}</b> 字。`
      : '这个月还没有复盘记录，从今天的一篇日记开始吧。';

  const streakBadge =
    summary.streak > 1
      ? `<span class="badge badge-violet">连续 ${summary.streak} 天复盘</span>`
      : '';
  const moodBadge =
    avgMood !== null
      ? `<span class="badge ${avgMood >= 3.5 ? 'badge-teal' : 'badge-amber'}">平均心情 ${avgMood} / 5</span>`
      : '';

  // 心情趋势柱状图（有心情的日子画柱，其余画零点）
  const moodByDay = new Map(dailies.map((item) => [Number(item.day.slice(8, 10)), item.mood]));
  const bestDayNum = bestDay ? Number(bestDay.day.slice(8, 10)) : -1;
  const bars = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const mood = moodByDay.get(day) ?? null;
    const height = mood ? ((mood - 1) / 4) * 100 : 0;
    const tip = mood
      ? `${monthNum} 月 ${day} 日 · ${moodEmoji(mood)} ${moodLabel(mood)}`
      : `${monthNum} 月 ${day} 日 · 未记录`;
    return `
      <button type="button" class="bar-col${mood === 5 ? ' peak' : ''}${mood ? '' : ' zero'}${day === bestDayNum ? ' active' : ''}"
        data-day="${day}" data-mood="${mood ?? ''}" aria-label="${escapeHtml(tip)}">
        <span class="bar-value">${mood ? `${moodEmoji(mood)} ${mood}` : ''}</span>
        <span class="bar-track"><span class="bar-fill" style="height:${height}%"></span></span>
        <span class="bar-label${day % 5 === 0 || day === 1 || day === daysInMonth ? '' : ' dim'}">${day}</span>
      </button>`;
  }).join('');

  const detailHtml =
    bestDay && worstMood
      ? `<span class="day">${escapeHtml(dayLabel(bestDay.day))}</span>
      <span class="metrics">
        <span>最佳心情<b>${moodEmoji(bestDay.mood)} ${bestDay.mood} / 5</b></span>
        <span>最低心情<b>${moodEmoji(worstMood.mood)} ${worstMood.mood} / 5（${escapeHtml(dayLabel(worstMood.day))}）</b></span>
        <span>有心情记录<b>${moods.length} 天</b></span>
      </span>`
      : '<span class="metrics"><span>这个月还没有心情记录</span></span>';

  const distRows = distribution
    .map((item) => {
      const share = moods.length ? Math.max(4, Math.round((item.count / moods.length) * 100)) : 0;
      return `
      <div class="dist-row">
        <span class="dist-mood">${item.emoji}</span>
        <span class="dist-label">${item.label}</span>
        <span class="dist-share"><span style="width:${item.count > 0 ? share : 0}%"></span></span>
        <span class="dist-count">${item.count} 天</span>
      </div>`;
    })
    .join('');

  const entryRow = (item: EntryView, index: number, top1: boolean): string => `
    <li class="entry-row${top1 ? ' top1' : ''}">
      <button type="button" class="entry-toggle" aria-expanded="false">
        <span class="rank${top1 ? ' first' : ''}">${index + 1}</span>
        <span class="entry-meta">
          <span class="entry-title">${escapeHtml(dayLabel(item.day))} · ${moodEmoji(item.mood)} ${moodLabel(item.mood)}</span>
          <span class="entry-sub">${item.content.length} 字${item.aiText ? ' · ✦ 已润色存档' : ''}</span>
          <span class="entry-share"><span style="width:${Math.max(4, Math.round((item.content.length / maxChars) * 100))}%"></span></span>
        </span>
        <span class="chevron" aria-hidden>▾</span>
      </button>
      <div class="entry-more">
        <p class="entry-content">${escapeHtml(item.content)}</p>
        ${item.aiText ? `<p class="entry-ai">✦ ${escapeHtml(item.aiText)}</p>` : ''}
      </div>
    </li>`;

  const dailyRows = dailies.length
    ? dailies.map((item, index) => entryRow(item, index, index === 0)).join('')
    : '<li class="empty">这个月还没有日记。</li>';
  const weeklyRows = weeklies.length
    ? weeklies.map((item, index) => entryRow(item, index, index === 0)).join('')
    : '<li class="empty">这个月还没有周复盘。</li>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atlas 复盘报告 · ${escapeHtml(monthTitle)}</title>
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
      var(--bg);
    background-attachment: fixed;
    padding: 28px 18px 64px;
    display: flex;
    justify-content: center;
  }
  .wrap { width: 100%; max-width: 900px; }
  .topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding: 0 4px; }
  .brand-main { font-size: 15px; font-weight: 800; letter-spacing: 0.24em; color: var(--violet); }
  .brand-sub { font-size: 10px; font-weight: 600; letter-spacing: 0.18em; color: var(--muted); }
  .topbar .spacer { flex: 1; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px; flex: none; white-space: nowrap;
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
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 22px;
    box-shadow: var(--shadow); padding: 24px; margin-bottom: 16px; backdrop-filter: blur(8px);
  }
  .card-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; }
  .card-head h2 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .card-head .en { margin-left: auto; font-size: 9px; font-weight: 700; letter-spacing: 0.22em; color: var(--muted); }
  .hero {
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
  .big {
    margin: 14px 0 8px; display: flex; align-items: baseline; gap: 8px;
    font-size: clamp(50px, 6.8vw, 68px); line-height: 1; font-weight: 800;
    letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
  }
  .big b {
    background: linear-gradient(118deg, #5b4bdb 8%, #0e9f9f 92%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .big i { font-style: normal; font-size: 18px; font-weight: 600; color: var(--ink-2); }
  .hero-line { font-size: 13px; color: var(--ink-2); line-height: 1.7; }
  .hero-line b { color: var(--ink); font-weight: 700; }
  .kpis {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
    margin-top: 22px;
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
  .chart {
    display: flex; align-items: flex-end; gap: 2px; height: 180px; padding: 8px 2px 0;
    border-bottom: 1px solid var(--line);
    background-image: linear-gradient(to top, rgba(25, 25, 34, 0.05) 1px, transparent 1px);
    background-size: 100% 33.333%;
  }
  .bar-col {
    flex: 1 1 0; min-width: 0; height: 100%; display: flex; flex-direction: column;
    align-items: center; gap: 5px; background: none; border: 0; cursor: pointer;
    padding: 0; font: inherit; border-radius: 8px 8px 0 0; transition: background 0.15s ease;
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
    content: ''; width: 5px; height: 5px; border-radius: 50%;
    background: rgba(25, 25, 34, 0.14); margin-bottom: 2px;
  }
  .bar-label { font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
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
  .dist-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
  .dist-mood { flex: none; font-size: 16px; }
  .dist-label { flex: none; width: 40px; font-size: 11px; font-weight: 600; color: var(--ink-2); }
  .dist-share {
    flex: 1; height: 6px; border-radius: 6px; background: rgba(25, 25, 34, 0.07); overflow: hidden;
  }
  .dist-share span {
    display: block; height: 100%; border-radius: 6px;
    background: linear-gradient(90deg, #0e9f9f, rgba(14, 159, 159, 0.4));
  }
  .dist-count { flex: none; width: 44px; text-align: right; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
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
  ol.entries { list-style: none; }
  .entry-row { border-radius: 14px; margin-bottom: 6px; overflow: hidden; border: 1px solid transparent; }
  .entry-row.top1 { background: rgba(91, 75, 219, 0.055); border-color: rgba(91, 75, 219, 0.14); }
  .entry-toggle {
    width: 100%; display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; background: none; border: 0; cursor: pointer; font: inherit;
    text-align: left; border-radius: 14px; transition: background 0.15s ease;
  }
  .entry-toggle:hover { background: rgba(25, 25, 34, 0.035); }
  .entry-toggle:focus-visible { outline: 2px solid rgba(91, 75, 219, 0.45); outline-offset: -2px; }
  .rank {
    flex: none; width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; background: rgba(25, 25, 34, 0.06); color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .rank.first { background: linear-gradient(135deg, #5b4bdb, #8a7bf0); color: #fff; }
  .entry-meta { flex: 1; min-width: 0; }
  .entry-title { display: block; font-size: 13px; font-weight: 600; }
  .entry-sub { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .entry-share { display: block; height: 4px; border-radius: 4px; background: rgba(25, 25, 34, 0.07); overflow: hidden; margin-top: 7px; }
  .entry-share span {
    display: block; height: 100%; border-radius: 4px;
    background: linear-gradient(90deg, #5b4bdb, rgba(91, 75, 219, 0.45));
  }
  .chevron { flex: none; font-size: 10px; color: var(--muted); transition: transform 0.2s ease; }
  .entry-row.open .chevron { transform: rotate(180deg); }
  .entry-more { display: none; padding: 2px 12px 14px 48px; }
  .entry-row.open .entry-more { display: block; }
  .entry-content {
    font-size: 12px; color: var(--ink-2); line-height: 1.8; white-space: pre-wrap;
    background: rgba(255, 255, 255, 0.75); border: 1px solid var(--line);
    border-radius: 10px; padding: 12px 14px;
  }
  .entry-ai {
    margin-top: 8px; font-size: 12px; color: var(--violet); line-height: 1.8;
    background: var(--violet-soft); border-radius: 10px; padding: 10px 14px; white-space: pre-wrap;
  }
  .empty { padding: 30px 18px; text-align: center; font-size: 12px; color: var(--muted); }
  .foot { margin-top: 26px; text-align: center; font-size: 11px; color: var(--muted); line-height: 1.9; }
  .foot b { color: var(--ink-2); font-weight: 600; }
  @media (max-width: 640px) {
    body { padding: 16px 12px 40px; }
    .topbar { flex-wrap: wrap; gap: 8px; }
    .brand-sub { display: none; }
    .card { padding: 16px; border-radius: 18px; }
    .hero { padding: 18px; }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .entry-toggle { gap: 8px; padding: 10px 6px; }
    .entry-more { padding-left: 6px; }
    .day-detail { gap: 8px; }
    .day-detail .metrics { margin-left: 0; gap: 10px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .card { box-shadow: none; border-color: #e6e6ec; break-inside: avoid; backdrop-filter: none; }
    .no-print { display: none !important; }
    .panel[hidden] { display: block !important; }
    .panel { margin-top: 16px; }
    .entry-more { display: block !important; }
    .big b { background: none; color: #221f4d; -webkit-text-fill-color: currentColor; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div>
        <div class="brand-main">ATLAS</div>
        <div class="brand-sub">JOURNAL REPORT · 个人成长系统</div>
      </div>
      <div class="spacer"></div>
      <span class="pill"><span class="dot"></span>${escapeHtml(monthTitle)}</span>
      <button type="button" class="print-btn no-print" onclick="window.print()">打印 / 存 PDF</button>
    </div>

    <section class="card hero">
      <div class="hero-range">
        ${streakBadge}
        ${moodBadge}
        ${weeklies.length > 0 ? `<span class="badge badge-teal">${weeklies.length} 篇周复盘</span>` : ''}
      </div>
      <div class="big">${heroValue}</div>
      <div class="hero-line">${summaryLine}</div>
      <div class="kpis">
        <div class="kpi"><div class="k">日记</div><div class="v">${summary.monthDaily}<small>篇</small></div><div class="s">当月共 ${daysInMonth} 天</div></div>
        <div class="kpi"><div class="k">周复盘</div><div class="v">${summary.monthWeekly}<small>篇</small></div><div class="s">每周一篇更从容</div></div>
        <div class="kpi"><div class="k">平均心情</div><div class="v">${avgMood !== null ? avgMood : '—'}<small>${avgMood !== null ? '/ 5' : ''}</small></div><div class="s">${moods.length} 天有心情记录</div></div>
        <div class="kpi"><div class="k">累计字数</div><div class="v">${totalChars}<small>字</small></div><div class="s">日记 + 周复盘</div></div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>心情趋势</h2>
        <span class="en">MOOD TREND</span>
      </div>
      <div class="chart" role="group" aria-label="逐日心情，1 到 5 分，点击查看本月小结">${bars}</div>
      <div class="day-detail" id="day-detail">${detailHtml}</div>
      <p class="hint no-print">点击上方任意柱子查看那一天的记录情况；心情在写日记时随手选择。</p>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>心情分布</h2>
        <span class="en">MOOD SHARE</span>
      </div>
      ${moods.length ? distRows : '<p class="empty">这个月还没有心情记录。</p>'}
    </section>

    <section class="card">
      <div class="tabs no-print" role="tablist" aria-label="报告视图">
        <button type="button" class="tab" role="tab" data-tab="daily" aria-selected="true" aria-controls="panel-daily">日记<span class="count">${dailies.length}</span></button>
        <button type="button" class="tab" role="tab" data-tab="weekly" aria-selected="false" aria-controls="panel-weekly">周复盘<span class="count">${weeklies.length}</span></button>
      </div>

      <div class="panel" id="panel-daily" role="tabpanel">
        <div class="card-head" style="margin-bottom:10px">
          <h2 style="font-size:13px">本月日记</h2>
          <span class="en">DAILY ENTRIES</span>
        </div>
        <ol class="entries">${dailyRows}</ol>
        <p class="hint no-print">点击任意一条展开全文；✦ 段落为 AI 润色存档。</p>
      </div>

      <div class="panel" id="panel-weekly" role="tabpanel" hidden>
        <div class="card-head" style="margin-bottom:10px">
          <h2 style="font-size:13px">本月周复盘</h2>
          <span class="en">WEEKLY REVIEWS</span>
        </div>
        <ol class="entries">${weeklyRows}</ol>
        <p class="hint no-print">每周一篇，回看节奏比每天更清楚。</p>
      </div>
    </section>

    <div class="foot">
      <b>ATLAS · 个人成长系统</b><br>
      数据来自复盘模块月快照（纯本地聚合，零 AI 调用） · 生成于 ${escapeHtml(generatedAt.toLocaleString('zh-CN'))} · 用浏览器打印可保存为 PDF
    </div>
  </div>

  <script>
    (function () {
      'use strict';
      var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.forEach(function (item) {
            var on = item.getAttribute('data-tab') === tab.getAttribute('data-tab');
            item.setAttribute('aria-selected', on ? 'true' : 'false');
            var panel = document.getElementById('panel-' + item.getAttribute('data-tab'));
            if (panel) panel.hidden = !on;
          });
        });
      });

      Array.prototype.forEach.call(document.querySelectorAll('.entry-toggle'), function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('.entry-row');
          if (!row) return;
          var open = row.classList.toggle('open');
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      });

      var detail = document.getElementById('day-detail');
      var bars = Array.prototype.slice.call(document.querySelectorAll('.bar-col'));
      var labels = { '1': '很难', '2': '不佳', '3': '一般', '4': '不错', '5': '很好' };
      bars.forEach(function (bar) {
        bar.addEventListener('click', function () {
          bars.forEach(function (item) { item.classList.remove('active'); });
          bar.classList.add('active');
          if (!detail) return;
          var day = Number(bar.getAttribute('data-day') || 0);
          var mood = bar.getAttribute('data-mood') || '';
          var body = mood
            ? '<span class="metrics"><span>心情<b>' + labels[mood] + ' ' + mood + ' / 5</b></span></span>'
            : '<span class="metrics"><span>这一天没有写日记</span></span>';
          detail.innerHTML = '<span class="day"></span>' + body;
          detail.querySelector('.day').textContent = '${monthNum}' + ' 月 ' + day + ' 日';
        });
      });
    })();
  </script>
</body>
</html>`;
}

/** 报告下载助手：Blob + 临时 <a>，与听歌报告同实现（模块间不共享代码，各自持有） */
export function downloadJournalReport(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // 立即 revoke 会让部分浏览器取消下载，交给下一轮事件循环回收
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
