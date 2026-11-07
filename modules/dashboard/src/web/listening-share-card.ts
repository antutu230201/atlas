import { formatDurationReport } from './listening-report';

/**
 * 社交尺寸分享卡：Canvas 一键绘制听歌数据卡并下载 PNG。
 * 支持 4:5 / 1:1 / 9:16 三种尺寸（同一套文案与视觉，按画布高度重排区块）。
 * 封面来自网易云 CDN（Access-Control-Allow-Origin: *），需 crossOrigin 才能导出画布；
 * 任一封面加载失败或超时都退回首字占位，不阻断导出。
 */

export type ShareCardSize = '4:5' | '1:1' | '9:16';

export interface ShareCardBucket {
  label: string;
  seconds: number;
}

export interface ShareCardSong {
  title: string;
  artist: string;
  seconds: number;
  cover?: string;
}

export interface ShareCardInput {
  rangeHint: string;
  generatedAt: Date;
  totalSeconds: number;
  totalPlays: number;
  meRank: number | null;
  buckets: ShareCardBucket[];
  topSongs: ShareCardSong[];
  size?: ShareCardSize;
}

interface CardLayout {
  W: number;
  H: number;
  brandY: number;
  subY: number;
  heroY: number;
  unitY: number;
  kpiY: number;
  coverX: number;
  coverY: number;
  coverSize: number;
  chartTop: number;
  chartH: number;
  cardTop: number;
  cardBottom: number;
  maxSongs: number;
}

export const SHARE_CARD_SIZES: Array<{ key: ShareCardSize; label: string; hint: string }> = [
  { key: '4:5', label: '4:5', hint: '朋友圈 / 小红书' },
  { key: '1:1', label: '1:1', hint: '头像 / 方图' },
  { key: '9:16', label: '9:16', hint: '竖屏 / Story' },
];

const LAYOUTS: Record<ShareCardSize, CardLayout> = {
  '4:5': {
    W: 1080,
    H: 1350,
    brandY: 96,
    subY: 132,
    heroY: 300,
    unitY: 352,
    kpiY: 404,
    coverX: 720,
    coverY: 168,
    coverSize: 260,
    chartTop: 490,
    chartH: 240,
    cardTop: 790,
    cardBottom: 1260,
    maxSongs: 4,
  },
  '1:1': {
    W: 1080,
    H: 1080,
    brandY: 84,
    subY: 118,
    heroY: 266,
    unitY: 316,
    kpiY: 364,
    coverX: 790,
    coverY: 140,
    coverSize: 200,
    chartTop: 410,
    chartH: 160,
    cardTop: 610,
    cardBottom: 1000,
    maxSongs: 3,
  },
  '9:16': {
    W: 1080,
    H: 1920,
    brandY: 110,
    subY: 148,
    heroY: 360,
    unitY: 414,
    kpiY: 470,
    coverX: 690,
    coverY: 180,
    coverSize: 300,
    chartTop: 570,
    chartH: 500,
    cardTop: 1150,
    cardBottom: 1810,
    maxSongs: 6,
  },
};

const COVER_TIMEOUT_MS = 4_000;
const FONT = "'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif";

const COLOR = {
  bg: '#0b0d14',
  text: '#e8e8f2',
  muted: '#8a8aa4',
  dim: '#6d6d8a',
  accent: '#aa9bff',
  panel: 'rgba(17, 19, 28, 0.82)',
  border: 'rgba(255, 255, 255, 0.09)',
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 网易云图片按 param 取缩略图；已有 query 时用 & 续接 */
function coverUrl(url: string, size: number): string {
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}param=${size}y${size}`;
}

function loadCover(url: string, size: number): Promise<HTMLImageElement | null> {
  const src = coverUrl(url, size);
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const done = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), COVER_TIMEOUT_MS);
    image.crossOrigin = 'anonymous';
    image.onload = () => done(image.naturalWidth > 0 ? image : null);
    image.onerror = () => done(null);
    image.src = src;
  });
}

/** 专辑封面贴片：有图贴图，无图用渐变 + 首字占位（社交卡没有封面也不能留空洞） */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  radius: number,
  title: string,
  fontScale: number,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = size * 0.14;
  ctx.shadowOffsetY = size * 0.06;
  roundRect(ctx, x, y, size, size, radius);
  ctx.fillStyle = 'rgba(170, 155, 255, 0.16)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, 'rgba(170, 155, 255, 0.42)');
    grad.addColorStop(1, 'rgba(114, 226, 231, 0.16)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = 'rgba(232, 232, 242, 0.9)';
    ctx.font = `700 ${Math.round(size * fontScale)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title.slice(0, 1), x + size / 2, y + size / 2 + size * fontScale * 0.35);
  }
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export async function buildShareCardCanvas(input: ShareCardInput): Promise<HTMLCanvasElement> {
  const size = input.size ?? '4:5';
  const layout = LAYOUTS[size];
  const { W, H } = layout;
  const songs = input.topSongs.slice(0, layout.maxSongs);
  // 并发预取，统一在绘制前就绪（封面缺失不影响其余排版）
  const covers = await Promise.all([
    songs[0]?.cover ? loadCover(songs[0].cover, 400) : Promise.resolve(null),
    ...songs
      .slice(1)
      .map((song) => (song.cover ? loadCover(song.cover, 160) : Promise.resolve(null))),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 底：深空 + 光晕
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(90, 60, 420, 'rgba(170, 155, 255, 0.22)');
  glow(W - 60, 180, 380, 'rgba(114, 226, 231, 0.14)');
  glow(W / 2, H - 40, 500, 'rgba(231, 166, 216, 0.08)');

  // 品牌
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR.accent;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText('ATLAS', W / 2, layout.brandY);
  ctx.fillStyle = COLOR.muted;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText('LISTENING · 个人成长系统', W / 2, layout.subY);

  // 主视觉左列：数字 + 窗口 + KPI（右列留给 Top1 封面）
  const minutes = Math.round(input.totalSeconds / 60);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.text;
  ctx.font = `700 132px ${FONT}`;
  ctx.fillText(String(minutes), 90, layout.heroY);
  ctx.fillStyle = COLOR.muted;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`分钟 · ${input.rangeHint}`, 94, layout.unitY);

  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = '#c9c9dc';
  const kpi = `${input.totalPlays} 次播放${input.meRank ? ` · 全站第 ${input.meRank} 名` : ''}`;
  ctx.fillText(kpi, 94, layout.kpiY);

  // 右列：Top1 专辑封面
  drawCover(
    ctx,
    covers[0] ?? null,
    layout.coverX,
    layout.coverY,
    layout.coverSize,
    layout.coverSize * 0.07,
    songs[0]?.title ?? '无',
    0.34,
  );

  // 柱状趋势（最多 14 个桶，避免拥挤）
  const buckets = input.buckets.slice(-14);
  const maxSeconds = Math.max(1, ...buckets.map((b) => b.seconds));
  const chartLeft = 120;
  const chartRight = W - 120;
  const slot = (chartRight - chartLeft) / Math.max(1, buckets.length);
  const barW = Math.min(52, slot * 0.6);
  buckets.forEach((bucket, index) => {
    const x = chartLeft + slot * index + (slot - barW) / 2;
    // 0 秒的桶不画柱体（画最小高度会变成一条莫名其妙的短线）
    if (bucket.seconds > 0) {
      const height = Math.max(6, (bucket.seconds / maxSeconds) * layout.chartH);
      const y = layout.chartTop + layout.chartH - height;
      const grad = ctx.createLinearGradient(0, y, 0, layout.chartTop + layout.chartH);
      grad.addColorStop(0, COLOR.accent);
      grad.addColorStop(1, 'rgba(170, 155, 255, 0.25)');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, height, 8);
      ctx.fill();
    }
    ctx.fillStyle = COLOR.muted;
    ctx.font = `500 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(bucket.label.slice(5), x + barW / 2, layout.chartTop + layout.chartH + 34);
  });

  // Top 歌曲玻璃卡：高度随曲目数收缩，在剩余空间里居中（少歌时不至于空一大片）
  const cardAreaTop = layout.cardTop;
  const cardAreaBottom = layout.cardBottom;
  const cardHeight = Math.min(cardAreaBottom - cardAreaTop, 118 + songs.length * 82);
  const cardTop = cardAreaTop + Math.round((cardAreaBottom - cardAreaTop - cardHeight) / 2);
  ctx.fillStyle = COLOR.panel;
  roundRect(ctx, 90, cardTop, W - 180, cardHeight, 22);
  ctx.fill();
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.text;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('最常播放', 130, cardTop + 58);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLOR.dim;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText('TOP TRACKS', W - 130, cardTop + 56);

  if (songs.length === 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.muted;
    ctx.font = `400 24px ${FONT}`;
    ctx.fillText('这个窗口还没有播放记录', 130, cardTop + 104);
  }

  songs.forEach((song, index) => {
    const rowTop = cardTop + 92 + index * 82;
    const coverSize = 54;
    const coverY = rowTop + 8;

    ctx.textAlign = 'left';
    ctx.fillStyle = index === 0 ? COLOR.accent : COLOR.dim;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(String(index + 1), 130, rowTop + 42);

    drawCover(ctx, covers[index] ?? null, 170, coverY, coverSize, 9, song.title, 0.42);

    ctx.fillStyle = COLOR.text;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(shorten(song.title, 16), 244, rowTop + 33);
    ctx.fillStyle = COLOR.muted;
    ctx.font = `400 21px ${FONT}`;
    ctx.fillText(shorten(song.artist, 18), 244, rowTop + 63);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#c9c9dc';
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(formatDurationReport(song.seconds), W - 130, rowTop + 42);
    ctx.textAlign = 'left';
  });

  // 页脚
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR.dim;
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(
    `ATLAS · 个人成长系统 · ${input.generatedAt.toLocaleDateString('zh-CN')}`,
    W / 2,
    H - 42,
  );
  return canvas;
}

export async function downloadShareCardPng(input: ShareCardInput): Promise<void> {
  const size = input.size ?? '4:5';
  const canvas = await buildShareCardCanvas({ ...input, size });
  const anchor = document.createElement('a');
  anchor.href = canvas.toDataURL('image/png');
  anchor.download = `atlas_listening_share_${size.replace(':', 'x')}_${input.generatedAt
    .toISOString()
    .slice(0, 10)}.png`;
  anchor.click();
}
