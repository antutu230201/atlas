export interface ModulePageProps {
  workspaceSlug: string;
  moduleName: string;
}

/** 与服务端 SourceEnvelope<T> 对齐 */
export interface SourceEnvelope<T> {
  status: 'fresh' | 'stale' | 'error' | 'empty';
  fetchedAt: string | null;
  payload: T | null;
  error?: string;
}

export interface HotItem {
  rank: number;
  title: string;
  url?: string;
  heat?: number;
  tag?: string;
}

export interface WeatherData {
  lat: number;
  lon: number;
  now: {
    temperature: number;
    apparent?: number;
    humidity?: number;
    windSpeed?: number;
    windDir?: number;
    precipitation?: number;
    isDay: boolean;
    code: number;
    text: string;
    icon: string;
  };
  days: Array<{
    date: string;
    code: number;
    text: string;
    icon: string;
    min: number;
    max: number;
    precipProb?: number;
    sunrise?: string;
    sunset?: string;
  }>;
  hourly: Array<{ time: string; temperature: number; icon: string }>;
  air?: { usAqi?: number; pm25?: number };
  updatedAt: string;
}

export interface Quote {
  text: string;
  from?: string;
  author?: string;
}

export interface Wallpaper {
  url: string;
  copyright?: string;
  date?: string;
}

export interface CitySetting {
  name: string;
  lat: number;
  lon: number;
}

export interface CountdownItem {
  id: string;
  title: string;
  targetDate: string;
  pinned: boolean;
  deletedAt: string | null;
}

/** 活跃度统计（打卡热力图 / 连续天数，事件订阅累积） */
export interface ActivityStats {
  days: Array<{ day: string; count: number }>;
  streak: number;
  todayCount: number;
}

/** AI 每日摘要（服务端按天缓存） */
export interface DailySummary {
  text: string;
  generatedAt: string;
}

export interface DashboardSnapshot {
  serverTime: string;
  city: CitySetting | null;
  options: { sources: Record<string, boolean>; wallpaper: boolean };
  weather: SourceEnvelope<WeatherData>;
  hot: Record<string, SourceEnvelope<HotItem[]>>;
  quote: SourceEnvelope<Quote>;
  wallpaper: SourceEnvelope<Wallpaper>;
  countdowns: CountdownItem[];
  activity: ActivityStats;
  summary: SourceEnvelope<DailySummary>;
}

export interface CitySuggestion {
  name: string;
  admin?: string;
  country?: string;
  lat: number;
  lon: number;
}

export interface DetectedLocation {
  city: string;
  region?: string;
  lat: number;
  lon: number;
  source: string;
}

/** 热榜源 key → 展示名（与服务端 HOT_SOURCES 顺序一致） */
export const HOT_SOURCE_LABELS: Record<string, string> = {
  weibo: '微博热搜',
  douyin: '抖音热搜',
  bilibili: 'B站热搜',
  baidu: '百度热搜',
  toutiao: '头条热榜',
};
