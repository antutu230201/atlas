/**
 * 天气源适配器：Open-Meteo（免费、无密钥、支持中文城市检索）。
 * 实时 + 未来 4 天预报 + 未来 24 小时曲线 + 空气质量（us_aqi，可选）。
 */

import { fetchJson } from './http';

export interface CitySuggestion {
  name: string;
  admin?: string;
  country?: string;
  lat: number;
  lon: number;
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

interface GeocodeResponse {
  results?: Array<{
    name: string;
    admin1?: string;
    admin2?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }>;
}

export async function geocodeCity(query: string, count = 8): Promise<CitySuggestion[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=${count}&language=zh&format=json`;
  const raw = await fetchJson<GeocodeResponse>(url);
  return (raw.results ?? []).map((r) => ({
    name: r.name,
    admin: [r.admin1, r.admin2].filter(Boolean).join(' · ') || undefined,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
  }));
}

/** WMO 天气码 → 中文描述 + 图标键（前端 icons.tsx 按键渲染 SVG） */
export function describeWeatherCode(code: number): { text: string; icon: string } {
  if (code === 0) return { text: '晴', icon: 'sun' };
  if (code === 1) return { text: '晴间多云', icon: 'partly' };
  if (code === 2) return { text: '多云', icon: 'partly' };
  if (code === 3) return { text: '阴', icon: 'overcast' };
  if (code === 45 || code === 48) return { text: '雾', icon: 'fog' };
  if (code >= 51 && code <= 55) return { text: '毛毛雨', icon: 'drizzle' };
  if (code === 56 || code === 57) return { text: '冻毛毛雨', icon: 'sleet' };
  if (code === 61) return { text: '小雨', icon: 'rain' };
  if (code === 63) return { text: '中雨', icon: 'rain' };
  if (code === 65) return { text: '大雨', icon: 'heavy-rain' };
  if (code === 66 || code === 67) return { text: '冻雨', icon: 'sleet' };
  if (code === 71) return { text: '小雪', icon: 'snow' };
  if (code === 73) return { text: '中雪', icon: 'snow' };
  if (code === 75) return { text: '大雪', icon: 'snow' };
  if (code === 77) return { text: '霰', icon: 'snow' };
  if (code >= 80 && code <= 82) return { text: '阵雨', icon: 'rain' };
  if (code === 85 || code === 86) return { text: '阵雪', icon: 'snow' };
  if (code === 95) return { text: '雷阵雨', icon: 'thunder' };
  if (code === 96 || code === 99) return { text: '雷阵雨伴冰雹', icon: 'thunder' };
  return { text: '未知', icon: 'cloud' };
}

interface ForecastResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
  };
}

interface AirResponse {
  current?: { us_aqi?: number; pm2_5?: number };
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const base = `latitude=${lat}&longitude=${lon}&timezone=auto`;
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?${base}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
    '&hourly=temperature_2m,weather_code&forecast_days=5';
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${base}&current=us_aqi,pm2_5`;

  const [forecast, air] = await Promise.all([
    fetchJson<ForecastResponse>(forecastUrl),
    fetchJson<AirResponse>(airUrl).catch(() => null),
  ]);

  const cur = forecast.current;
  if (!cur || cur.temperature_2m === undefined || cur.weather_code === undefined) {
    throw new Error('天气接口返回缺字段');
  }
  const now = describeWeatherCode(cur.weather_code);

  const days = (forecast.daily?.time ?? []).map((date, i) => {
    const code = forecast.daily?.weather_code?.[i] ?? 0;
    const desc = describeWeatherCode(code);
    return {
      date,
      code,
      text: desc.text,
      icon: desc.icon,
      min: forecast.daily?.temperature_2m_min?.[i] ?? 0,
      max: forecast.daily?.temperature_2m_max?.[i] ?? 0,
      precipProb: forecast.daily?.precipitation_probability_max?.[i],
      sunrise: forecast.daily?.sunrise?.[i],
      sunset: forecast.daily?.sunset?.[i],
    };
  });

  // 未来 24 小时曲线：从"不早于当前时刻"的下一条开始截取
  const times = forecast.hourly?.time ?? [];
  const startIndex = Math.max(
    0,
    times.findIndex((t) => cur.time !== undefined && t >= cur.time),
  );
  const hourly = times.slice(startIndex, startIndex + 24).map((time, i) => ({
    time,
    temperature: forecast.hourly?.temperature_2m?.[startIndex + i] ?? 0,
    icon: describeWeatherCode(forecast.hourly?.weather_code?.[startIndex + i] ?? 0).icon,
  }));

  return {
    lat,
    lon,
    now: {
      temperature: cur.temperature_2m,
      apparent: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      windSpeed: cur.wind_speed_10m,
      windDir: cur.wind_direction_10m,
      precipitation: cur.precipitation,
      isDay: (cur.is_day ?? 1) === 1,
      code: cur.weather_code,
      text: now.text,
      icon: now.icon,
    },
    days,
    hourly,
    air: air?.current ? { usAqi: air.current.us_aqi, pm25: air.current.pm2_5 } : undefined,
    updatedAt: new Date().toISOString(),
  };
}
