/** API 客户端：跨域携带会话 Cookie，统一错误与 JSON 处理 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; json?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: init.json === undefined ? {} : { 'content-type': 'application/json' },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
    signal: init.signal,
  });
  const raw = await response.text();
  const parsed: unknown = raw.length > 0 ? JSON.parse(raw) : null;
  if (!response.ok) {
    const body = parsed as { error?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      body?.error ?? 'atlas.unknown',
      body?.message ?? `请求失败（${response.status}）`,
    );
  }
  // 204 等空响应（登出/删除）返回 null
  if (parsed === null) return null as T;
  return (parsed as { data: T }).data;
}

export const apiUrl = API_URL;
