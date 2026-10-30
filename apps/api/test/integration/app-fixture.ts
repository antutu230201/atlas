import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';

export interface TestApp {
  url: string;
  close: () => Promise<void>;
}

export interface ApiResult {
  status: number;
  // 测试断言便利性优先：用 any 并在 eslint 处豁免（仅测试文件）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  cookie: string | null;
}

/**
 * 集成测试夹具：以真实配置（仅指向 5433 测试库）启动完整 Nest 应用并监听随机端口。
 * EMBEDDED_PG=false —— 数据库由 global-setup 提供。
 */
export async function createTestApp(): Promise<TestApp> {
  process.env.NODE_ENV = 'test';
  process.env.EMBEDDED_PG = 'false';
  process.env.DATABASE_URL = 'postgres://atlas_app:atlas_app@localhost:5433/atlas';
  process.env.DATABASE_URL_ADMIN = 'postgres://atlas:atlas@localhost:5433/atlas';
  process.env.LOG_LEVEL = 'error';

  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.enableCors({ origin: 'http://localhost:3000', credentials: true });
  app.setGlobalPrefix('v1');
  await app.listen(0);
  const url = await app.getUrl();
  return { url, close: () => app.close() };
}

export async function apiFetch(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('atlas_session='));
  return {
    status: response.status,
    body: parsed,
    cookie: setCookie ? (setCookie.split(';')[0] ?? null) : null,
  };
}

export async function register(
  baseUrl: string,
  email: string,
  displayName: string,
): Promise<ApiResult> {
  return apiFetch(baseUrl, '/auth/register', {
    method: 'POST',
    body: { email, password: 'password123', displayName },
  });
}

export async function login(baseUrl: string, email: string): Promise<ApiResult> {
  return apiFetch(baseUrl, '/auth/login', {
    method: 'POST',
    body: { email, password: 'password123' },
  });
}
