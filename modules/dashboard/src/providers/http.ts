/**
 * 外部 HTTP 访问的统一出口（宪法 §5：外部服务都经过适配器接口）。
 * 各源均以"浏览器请求"形态直连：UA/Accept/Referer + 严格超时，失败向上抛由调用方兜底。
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface FetchJsonOptions {
  referer?: string;
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'application/json, text/plain, */*',
      ...(opts.referer ? { referer: opts.referer } : {}),
    },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 4500),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** e2e / 离线联调开关：注入假数据源，避免测试依赖外网（见 providers/fixtures.ts） */
export function isFakeMode(): boolean {
  return process.env.ATLAS_DASHBOARD_FAKE === '1';
}
