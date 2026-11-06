import { fetchJson } from './http';

export interface LyricLine {
  /** 行起始时间，秒 */
  time: number;
  text: string;
}

export interface LyricsPayload {
  lines: LyricLine[];
  source: 'netease';
}

interface NeteaseLyricResponse {
  lrc?: { lyric?: string };
  nolyric?: boolean;
  uncollected?: boolean;
}

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const CREDIT_PREFIX =
  /^(作词|作曲|编曲|制作人|监制|出品|发行|吉他|贝斯|鼓|键盘|和声|录音|混音|母带|弦乐|统筹|企划|文案|封面|OP|SP)\s*[:：]/i;

/** 解析 LRC：同一个时间标签可能重复（原文/翻译），保留首条；制作人员名单不进入歌词轮播。 */
export function parseLrc(raw: string): LyricLine[] {
  const byTime = new Map<number, string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tags = [...line.matchAll(TIME_TAG)];
    if (tags.length === 0) continue;
    const text = line.replace(TIME_TAG, '').trim();
    if (!text || CREDIT_PREFIX.test(text)) continue;
    for (const tag of tags) {
      const minutes = Number(tag[1] ?? 0);
      const seconds = Number(tag[2] ?? 0);
      const fraction = (tag[3] ?? '0').padEnd(3, '0').slice(0, 3);
      const time = minutes * 60 + seconds + Number(fraction) / 1000;
      if (!byTime.has(time)) byTime.set(time, text);
    }
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, 600)
    .map(([time, text]) => ({ time, text }));
}

export async function fetchNeteaseLyrics(id: number): Promise<LyricsPayload> {
  const raw = await fetchJson<NeteaseLyricResponse>(
    `https://music.163.com/api/song/lyric?id=${id}&lv=-1&tv=-1`,
    { referer: 'https://music.163.com/', timeoutMs: 6000 },
  );
  return { lines: raw.lrc?.lyric ? parseLrc(raw.lrc.lyric) : [], source: 'netease' };
}
