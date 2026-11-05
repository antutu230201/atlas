/**
 * 热榜源适配器：微博 / 抖音 / B站 / 百度 / 头条。
 * 全部为公开页面的数据接口（无官方契约），归一化为 HotItem；风控失效时抛错由调用方回退缓存。
 */

import { fetchJson, isFakeMode } from './http';
import { fakeHotLists } from './fixtures';

export interface HotItem {
  rank: number;
  title: string;
  url?: string;
  heat?: number;
  /** 源站徽标，如 热 / 爆 / 新 / 置顶 */
  tag?: string;
}

export interface HotSourceDef {
  key: string;
  label: string;
  /** 数据刷新周期（毫秒） */
  ttlMs: number;
  fetchList(): Promise<HotItem[]>;
}

function compact<T>(items: T[]): NonNullable<T>[] {
  return items.filter((item): item is NonNullable<T> => item != null);
}

/* ---------------- 微博热搜 ---------------- */

interface WeiboResponse {
  ok?: number;
  data?: {
    realtime?: Array<{
      word?: string;
      note?: string;
      num?: number;
      realpos?: number;
      icon_desc?: string;
      word_scheme?: string;
    }>;
  };
}

/** 官方契约缺失，字段缺失时跳过该条而不是让整个源失败 */
export function normalizeWeibo(raw: WeiboResponse): HotItem[] {
  const realtime = raw.data?.realtime ?? [];
  return compact(
    realtime.map((entry, index): HotItem | null => {
      const title = entry.word ?? entry.note;
      if (!title) return null;
      const query = entry.word_scheme ?? `#${title}#`;
      return {
        rank: entry.realpos ?? index + 1,
        title,
        heat: entry.num,
        tag: entry.icon_desc || undefined,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(query)}`,
      };
    }),
  ).slice(0, 50);
}

/* ---------------- 抖音热搜 ---------------- */

interface DouyinResponse {
  data?: {
    word_list?: Array<{ word?: string; hot_value?: number }>;
  };
}

export function normalizeDouyin(raw: DouyinResponse): HotItem[] {
  const list = raw.data?.word_list ?? [];
  return compact(
    list.map((entry, index): HotItem | null => {
      if (!entry.word) return null;
      return {
        rank: index + 1,
        title: entry.word,
        heat: entry.hot_value,
        url: `https://www.douyin.com/search/${encodeURIComponent(entry.word)}`,
      };
    }),
  ).slice(0, 50);
}

/* ---------------- B站热搜 ---------------- */

interface BilibiliResponse {
  code?: number;
  data?: {
    trending?: {
      list?: Array<{ keyword?: string; show_name?: string; heat_score?: number }>;
    };
  };
}

export function normalizeBilibili(raw: BilibiliResponse): HotItem[] {
  const list = raw.data?.trending?.list ?? [];
  return compact(
    list.map((entry, index): HotItem | null => {
      const title = entry.show_name ?? entry.keyword;
      if (!title) return null;
      return {
        rank: index + 1,
        title,
        heat: entry.heat_score,
        url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(entry.keyword ?? title)}`,
      };
    }),
  ).slice(0, 50);
}

/* ---------------- 百度热搜 ---------------- */

interface BaiduEntry {
  word?: string;
  url?: string;
  hotScore?: number | string;
  isTop?: boolean;
  /** PC 接口字段：榜单序号（0 起）/ 热标（"0"无 "1"热 "3"新）/ 涨跌 */
  index?: number;
  hotTag?: string;
  hotChange?: string;
}

interface BaiduResponse {
  data?: {
    cards?: Array<{
      content?: Array<BaiduEntry & { content?: BaiduEntry[] }>;
    }>;
  };
}

/** PC 接口用数字编码热标，直接显示会变成 "1"，这里映射成中文 */
const BAIDU_TAG: Record<string, string> = { '1': '热', '3': '新' };

/** 百度 cards 存在两层嵌套（tabTextList → content[].content[]），统一拍平 */
export function normalizeBaidu(raw: BaiduResponse): HotItem[] {
  const entries: BaiduEntry[] = [];
  for (const card of raw.data?.cards ?? []) {
    for (const entry of card.content ?? []) {
      if (Array.isArray(entry.content)) entries.push(...entry.content);
      else entries.push(entry);
    }
  }
  return compact(
    entries.map((entry, index): HotItem | null => {
      if (!entry.word) return null;
      const heatRaw = entry.hotScore;
      const heat = typeof heatRaw === 'string' ? Number(heatRaw) : heatRaw;
      return {
        rank: typeof entry.index === 'number' ? entry.index + 1 : index + 1,
        title: entry.word,
        heat: heat !== undefined && Number.isFinite(heat) ? heat : undefined,
        tag: BAIDU_TAG[entry.hotTag ?? ''] ?? (entry.isTop ? '置顶' : undefined),
        url: entry.url ?? `https://www.baidu.com/s?wd=${encodeURIComponent(entry.word)}`,
      };
    }),
  ).slice(0, 50);
}

/* ---------------- 头条热榜 ---------------- */

interface ToutiaoResponse {
  data?: Array<{ Title?: string; Url?: string; HotValue?: number }>;
}

export function normalizeToutiao(raw: ToutiaoResponse): HotItem[] {
  const list = raw.data ?? [];
  return compact(
    list.map((entry, index): HotItem | null => {
      if (!entry.Title) return null;
      return {
        rank: index + 1,
        title: entry.Title,
        heat: entry.HotValue,
        url: entry.Url,
      };
    }),
  ).slice(0, 50);
}

/* ---------------- 源定义（key 与归一化函数一一对应） ---------------- */

export const HOT_SOURCES: HotSourceDef[] = [
  {
    key: 'weibo',
    label: '微博热搜',
    ttlMs: 10 * 60_000,
    fetchList: async () => {
      if (isFakeMode()) return fakeHotLists.weibo;
      const raw = await fetchJson<WeiboResponse>('https://weibo.com/ajax/side/hotSearch', {
        referer: 'https://weibo.com/',
      });
      return normalizeWeibo(raw);
    },
  },
  {
    key: 'douyin',
    label: '抖音热搜',
    ttlMs: 10 * 60_000,
    fetchList: async () => {
      if (isFakeMode()) return fakeHotLists.douyin;
      const raw = await fetchJson<DouyinResponse>(
        'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1&source=6',
        { referer: 'https://www.douyin.com/' },
      );
      return normalizeDouyin(raw);
    },
  },
  {
    key: 'bilibili',
    label: 'B站热搜',
    ttlMs: 15 * 60_000,
    fetchList: async () => {
      if (isFakeMode()) return fakeHotLists.bilibili;
      const raw = await fetchJson<BilibiliResponse>(
        'https://api.bilibili.com/x/web-interface/search/square?limit=50',
        { referer: 'https://www.bilibili.com/' },
      );
      return normalizeBilibili(raw);
    },
  },
  {
    key: 'baidu',
    label: '百度热搜',
    ttlMs: 10 * 60_000,
    fetchList: async () => {
      if (isFakeMode()) return fakeHotLists.baidu;
      const raw = await fetchJson<BaiduResponse>(
        // PC 榜单才带 hotScore（wise 只给 word/url），热度数字全靠它
        'https://top.baidu.com/api/board?platform=pc&tab=realtime',
        { referer: 'https://top.baidu.com/board' },
      );
      return normalizeBaidu(raw);
    },
  },
  {
    key: 'toutiao',
    label: '头条热榜',
    ttlMs: 10 * 60_000,
    fetchList: async () => {
      if (isFakeMode()) return fakeHotLists.toutiao;
      const raw = await fetchJson<ToutiaoResponse>(
        'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
        { referer: 'https://www.toutiao.com/' },
      );
      return normalizeToutiao(raw);
    },
  },
];

export function getHotSource(key: string): HotSourceDef | undefined {
  return HOT_SOURCES.find((source) => source.key === key);
}
