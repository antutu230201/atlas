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

/**
 * 必应 th 缩略服务支持按尺寸取图：把 OHR 图 URL 的分辨率段改写为指定尺寸。
 * 壁纸是半透明遮罩下的氛围层，1366x768 比 1920x1080 省约一半带宽，视觉差异可忽略。
 */
export function bingThumbUrl(url: string, size = '1366x768'): string {
  return url.replace(/(_)(\d{3,4}x\d{3,4})(\.jpg)/, `$1${size}$3`);
}

export async function fetchWallpaper(): Promise<Wallpaper> {
  const raw = await fetchJson<BingResponse>(
    'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1',
  );
  const image = raw.images?.[0];
  if (!image?.url) throw new Error('必应壁纸接口返回缺字段');
  return {
    url: bingThumbUrl(`https://cn.bing.com${image.url}`),
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
