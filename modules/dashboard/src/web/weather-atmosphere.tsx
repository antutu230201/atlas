import type { WeatherData } from './types';

export type WeatherScene = 'clear' | 'partly' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

export const WEATHER_SCENE_LABELS: Record<WeatherScene, string> = {
  clear: '晴空模式',
  partly: '晴间多云',
  cloudy: '云层模式',
  rain: '降雨模式',
  storm: '雷雨模式',
  snow: '降雪模式',
  fog: '薄雾模式',
};

/** 把服务端 WMO 天气图标映射成轻量场景，不依赖具体天气文案。 */
export function getWeatherScene(icon: string): WeatherScene {
  switch (icon) {
    case 'sun':
      return 'clear';
    case 'partly':
      return 'partly';
    case 'overcast':
      return 'cloudy';
    case 'fog':
      return 'fog';
    case 'drizzle':
    case 'rain':
    case 'heavy-rain':
      return 'rain';
    case 'snow':
    case 'sleet':
      return 'snow';
    case 'thunder':
      return 'storm';
    default:
      return 'cloudy';
  }
}

export function WeatherAtmosphere({
  icon,
  isDay,
}: {
  icon: WeatherData['now']['icon'];
  isDay: boolean;
}) {
  const scene = getWeatherScene(icon);
  const showSun = scene === 'clear' || scene === 'partly';
  const showCloud =
    scene === 'partly' || scene === 'cloudy' || scene === 'rain' || scene === 'storm';

  return (
    <>
      {/* 背景层：天空、云、雾、阳光 */}
      <div
        className="screen-weather"
        data-scene={scene}
        data-day={isDay ? 'day' : 'night'}
        aria-hidden
      >
        {scene === 'clear' ? <div className="screen-weather-clear" /> : null}
        {showSun ? <div className="screen-weather-sun" /> : null}
        {showCloud ? <div className="screen-weather-cloud" /> : null}
        {scene === 'fog' ? <div className="screen-weather-fog" /> : null}
      </div>

      {/* 前景层：只让雨雪横跨内容，低透明度保证可读性 */}
      {scene === 'rain' || scene === 'storm' || scene === 'snow' ? (
        <div
          className="screen-weather screen-weather-front"
          data-scene={scene}
          data-day={isDay ? 'day' : 'night'}
          aria-hidden
        >
          {scene === 'rain' || scene === 'storm' ? <div className="screen-weather-rain" /> : null}
          {scene === 'snow' ? <div className="screen-weather-snow" /> : null}
          {scene === 'storm' ? <div className="screen-weather-flash" /> : null}
        </div>
      ) : null}
    </>
  );
}
