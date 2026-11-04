/**
 * 杂项源适配器：一言（hitokoto）、必应每日壁纸、IP 归属地检测。
 */

import { fetchJson } from './http';

export interface Quote {
  text: string;
  from?: string;
  author?: string;
}

interface HitokotoResponse {
  hitokoto?: string;
  from?: string;
  from_who?: string;
}

export async function fetchQuote(): Promise<Quote> {
  const raw = await fetchJson<HitokotoResponse>(
    'https://v1.hitokoto.cn/?c=d&c=e&c=i&c=k&encode=json',
  );
  if (!raw.hitokoto) throw new Error('一言接口返回缺字段');
  return { text: raw.hitokoto, from: raw.from || undefined, author: raw.from_who || undefined };
}

export interface Wallpaper {
  url: string;
  copyright?: string;
  date?: string;
}

interface BingResponse {
  images?: Array<{ url?: string; copyright?: string; startdate?: string }>;
}

export async function fetchWallpaper(): Promise<Wallpaper> {
  const raw = await fetchJson<BingResponse>(
    'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1',
  );
  const image = raw.images?.[0];
  if (!image?.url) throw new Error('必应壁纸接口返回缺字段');
  return {
    url: `https://cn.bing.com${image.url}`,
    copyright: image.copyright,
    date: image.startdate,
  };
}

export interface DetectedLocation {
  city: string;
  region?: string;
  lat: number;
  lon: number;
  source: string;
}

interface IpApiResponse {
  status?: string;
  city?: string;
  regionName?: string;
  lat?: number;
  lon?: number;
}

interface IpWhoResponse {
  success?: boolean;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * 本机部署时，"服务端看到的出口 IP"就是使用者的网络出口：
 * 主源 ip-api（中文城市，免费 HTTP），失败回退 ipwho.is（英文城市，HTTPS）。
 */
export async function detectLocationByIp(): Promise<DetectedLocation> {
  try {
    const raw = await fetchJson<IpApiResponse>(
      'http://ip-api.com/json/?lang=zh-CN&fields=status,city,regionName,lat,lon',
    );
    if (raw.status === 'success' && raw.city && raw.lat != null && raw.lon != null) {
      return {
        city: raw.city,
        region: raw.regionName,
        lat: raw.lat,
        lon: raw.lon,
        source: 'ip-api',
      };
    }
  } catch {
    // 落到备用源
  }
  const raw = await fetchJson<IpWhoResponse>('https://ipwho.is/');
  if (raw.success && raw.city && raw.latitude != null && raw.longitude != null) {
    return {
      city: raw.city,
      region: raw.region,
      lat: raw.latitude,
      lon: raw.longitude,
      source: 'ipwho.is',
    };
  }
  throw new Error('无法通过 IP 识别城市，请手动搜索');
}
