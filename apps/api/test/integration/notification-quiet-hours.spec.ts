import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 通知免打扰时段（2026-11-15）：偏好存 user.settings.notificationQuietHours，
 * 窗口允许跨午夜；服务端返回 quietNow 判定（纯函数 isQuietNow 复用）。
 */

let app: TestApp;
let cookie: string;

/** 构造一个必然覆盖"现在"的窗口（前后各 1 小时，处理跨午夜回绕） */
const windowAroundNow = () => {
  const now = new Date();
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const before = new Date(now.getTime() - 60 * 60 * 1000);
  const after = new Date(now.getTime() + 60 * 60 * 1000);
  return { start: fmt(before), end: fmt(after) };
};

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'quiet-hours@example.com', '免打扰验收');
  cookie = (await login(app.url, 'quiet-hours@example.com')).cookie!;
});

afterAll(async () => {
  await app.close();
});

describe('通知免打扰时段偏好', () => {
  it('默认：关闭 + 22:00–08:00，quietNow=false', async () => {
    const res = await apiFetch(app.url, '/notifications/quiet-hours', { cookie });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enabled: false,
      start: '22:00',
      end: '08:00',
      quietNow: false,
    });
  });

  it('开启覆盖当前时刻的跨午夜窗口 → quietNow=true，重读持久化', async () => {
    const put = await apiFetch(app.url, '/notifications/quiet-hours', {
      method: 'PUT',
      cookie,
      body: { enabled: true, ...windowAroundNow() },
    });
    expect(put.status).toBe(200);
    expect(put.body.data.quietNow).toBe(true);

    const reread = await apiFetch(app.url, '/notifications/quiet-hours', { cookie });
    expect(reread.body.data.enabled).toBe(true);
    expect(reread.body.data.quietNow).toBe(true);
  });

  it('校验拒绝：坏格式 / 起止相同 / 非布尔', async () => {
    const bad1 = await apiFetch(app.url, '/notifications/quiet-hours', {
      method: 'PUT',
      cookie,
      body: { enabled: true, start: '24:00', end: '07:00' },
    });
    expect(bad1.status).toBe(400);
    expect(JSON.stringify(bad1.body)).toContain('HH:mm');

    const bad2 = await apiFetch(app.url, '/notifications/quiet-hours', {
      method: 'PUT',
      cookie,
      body: { enabled: true, start: '08:00', end: '08:00' },
    });
    expect(bad2.status).toBe(400);

    const bad3 = await apiFetch(app.url, '/notifications/quiet-hours', {
      method: 'PUT',
      cookie,
      body: { enabled: 'yes', start: '08:00', end: '09:00' },
    });
    expect(bad3.status).toBe(400);
  });

  it('改回关闭 → quietNow=false；未登录 401', async () => {
    const put = await apiFetch(app.url, '/notifications/quiet-hours', {
      method: 'PUT',
      cookie,
      body: { enabled: false, start: '22:00', end: '08:00' },
    });
    expect(put.status).toBe(200);
    expect(put.body.data.quietNow).toBe(false);

    const anon = await apiFetch(app.url, '/notifications/quiet-hours');
    expect(anon.status).toBe(401);
  });
});
