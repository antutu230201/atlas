/**
 * 假数据源（ATLAS_DASHBOARD_FAKE=1 时启用）：e2e 与离线联调用，不依赖外网。
 * 结构与真实归一化输出一致；仅测试环境使用，禁止进入生产路径。
 */

import type { HotItem } from './hotlists';

function hot(prefix: string): HotItem[] {
  return Array.from({ length: 12 }, (_, i) => ({
    rank: i + 1,
    title: `${prefix}测试热搜第 ${i + 1} 条`,
    heat: 9_000_000 - i * 300_000,
    tag: i === 0 ? '热' : i === 2 ? '新' : undefined,
    url: `https://example.com/${prefix}/${i + 1}`,
  }));
}

export const fakeHotLists = {
  weibo: hot('微博'),
  douyin: hot('抖音'),
  bilibili: hot('B站'),
  baidu: hot('百度'),
  toutiao: hot('头条'),
} satisfies Record<string, HotItem[]>;

export const fakeWeather = {
  lat: 30.29,
  lon: 120.16,
  now: {
    temperature: 18.4,
    apparent: 17.2,
    humidity: 62,
    windSpeed: 9.8,
    windDir: 135,
    precipitation: 0,
    isDay: true,
    code: 1,
    text: '晴间多云',
    icon: 'partly',
  },
  days: Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      code: [1, 3, 61, 0, 2][i] ?? 0,
      text: ['晴间多云', '阴', '小雨', '晴', '多云'][i] ?? '晴',
      icon: ['partly', 'overcast', 'rain', 'sun', 'partly'][i] ?? 'sun',
      min: 12 + i,
      max: 21 + i,
      precipProb: [10, 20, 80, 5, 15][i] ?? 10,
      sunrise: '06:24',
      sunset: '17:38',
    };
  }),
  hourly: Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.now() + i * 3_600_000).toISOString().slice(0, 13),
    temperature: 18 - Math.round(Math.sin(i / 4) * 4),
    icon: 'partly',
  })),
  air: { usAqi: 42, pm25: 9.5 },
  updatedAt: new Date().toISOString(),
};

export const fakeQuote = { text: '君子不器，周而不比。', from: '论语', author: '孔子' };

export const fakeWallpaper = {
  url: '',
  copyright: '测试壁纸（假数据源）',
  date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
};

export const fakeLocation = {
  city: '杭州',
  region: '浙江',
  lat: 30.29,
  lon: 120.16,
  source: 'fake',
};

export const fakeLyrics = {
  source: 'netease' as const,
  lines: Array.from({ length: 12 }, (_, index) => ({
    time: index,
    text: `假数据歌词 · 第 ${index + 1} 句`,
  })),
};
