import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  fetchLikedTracks,
  fetchProfile,
  fetchSongUrl,
  openSecret,
  qrCheck,
  sealSecret,
} from '@atlas/module-dashboard';

/**
 * 网易云适配器与凭据加密盒：
 * 全部走 mock fetch，不依赖外网；关注「真实响应形状 → 归一化结果」与失败路径。
 */

const SECRET_ENV = 'ATLAS_NETEASE_SECRET';
const originalSecret = process.env[SECRET_ENV];

function jsonResponse(body: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

beforeAll(() => {
  process.env[SECRET_ENV] = 'unit-test-secret-0123456789abcdef';
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env[SECRET_ENV];
  else process.env[SECRET_ENV] = originalSecret;
});

describe('网易云凭据加密盒（AES-256-GCM）', () => {
  it('seal → open 往返还原原文，密文不含明文片段', () => {
    const cookie = 'MUSIC_U=secret-token; __csrf=abc; os=pc';
    const sealed = sealSecret(cookie);
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(sealed).not.toContain('MUSIC_U');
    expect(openSecret(sealed)).toBe(cookie);
  });

  it('同一明文两次加密产生不同密文（随机 IV）', () => {
    expect(sealSecret('a=1')).not.toBe(sealSecret('a=1'));
  });

  it('密文被篡改时 open 拒绝解密', () => {
    const sealed = sealSecret('MUSIC_U=x');
    const parts = sealed.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => openSecret(parts.join(':'))).toThrow();
  });

  it('密文格式不合法时抛错而不是返回垃圾数据', () => {
    expect(() => openSecret('not-sealed')).toThrow('格式');
  });
});

describe('网易云二维码登录适配器', () => {
  it('801 → waiting；802 → scanned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 801 })),
    );
    expect(await qrCheck('unikey-a')).toEqual({ status: 'waiting' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 802 })),
    );
    expect(await qrCheck('unikey-a')).toEqual({ status: 'scanned' });
    vi.unstubAllGlobals();
  });

  it('803 → confirmed，从 Set-Cookie 提取整串会话 cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ code: 803 }, ['MUSIC_U=tok123; Path=/;', '__csrf=xyz; Path=/;']),
      ),
    );
    const result = await qrCheck('unikey-b');
    expect(result.status).toBe('confirmed');
    expect(result.cookie).toContain('MUSIC_U=tok123');
    expect(result.cookie).toContain('__csrf=xyz');
    vi.unstubAllGlobals();
  });

  it('confirmed 但缺 MUSIC_U 时视为失败（不落库半凭据）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 803 }, ['__csrf=xyz; Path=/;'])),
    );
    await expect(qrCheck('unikey-c')).rejects.toThrow('登录凭据');
    vi.unstubAllGlobals();
  });

  it('800 → expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 800 })),
    );
    expect(await qrCheck('unikey-d')).toEqual({ status: 'expired' });
    vi.unstubAllGlobals();
  });

  it('空响应体抛可读错误（接口/风控变化的信号）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    await expect(qrCheck('unikey-e')).rejects.toThrow('空响应');
    vi.unstubAllGlobals();
  });
});

describe('网易云账号数据适配器', () => {
  it('fetchProfile：解析 profile.userId/nickname；缺 profile 视为凭据无效', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ code: 200, profile: { userId: 10086, nickname: '测试用户' } }),
      ),
    );
    expect(await fetchProfile('MUSIC_U=tok')).toEqual({ uid: 10086, nickname: '测试用户' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 301, msg: null })),
    );
    await expect(fetchProfile('MUSIC_U=bad')).rejects.toThrow('凭据无效');
    vi.unstubAllGlobals();
  });

  it('fetchLikedTracks：喜欢 id 顺序保留（最近喜欢在前），无详情的 id 跳过', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: String(init?.body ?? '') });
        if (String(url).includes('/api/song/like/get')) {
          return jsonResponse({ code: 200, ids: [3, 1, 2, 999] });
        }
        return jsonResponse({
          code: 200,
          songs: [
            {
              id: 1,
              name: '歌一',
              dt: 111_000,
              ar: [{ name: '甲' }],
              al: { name: '专辑A', picUrl: 'https://p/1.jpg' },
            },
            { id: 2, name: '歌二', dt: 222_000, ar: [{ name: '乙' }, { name: '丙' }], al: {} },
            { id: 3, name: '歌三', dt: 333_000, ar: [], al: { name: '专辑C' } },
          ],
        });
      }),
    );
    const tracks = await fetchLikedTracks('MUSIC_U=tok', 42);
    expect(tracks.map((t) => t.id)).toEqual([3, 1, 2]);
    expect(tracks[2]).toMatchObject({
      id: 2,
      title: '歌二',
      artist: '乙 / 丙',
      album: '',
      durationMs: 222_000,
    });
    // 元数据按 500 一批请求，且表单里带加密 c/ids
    expect(calls.filter((c) => c.url.includes('/api/v3/song/detail'))).toHaveLength(1);
    expect(calls[1]!.body).toContain('c=');
    vi.unstubAllGlobals();
  });

  it('fetchSongUrl：返回真实 CDN 地址；null url 原样透传（VIP/版权限制由上层提示）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 200,
          data: [{ id: 1, url: 'http://m801.music.126.net/xxx.mp3', type: 'mp3' }],
        }),
      ),
    );
    expect(await fetchSongUrl('MUSIC_U=tok', 1)).toEqual({
      url: 'http://m801.music.126.net/xxx.mp3',
      type: 'mp3',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 200, data: [{ id: 1, url: null, type: null }] })),
    );
    expect(await fetchSongUrl('MUSIC_U=tok', 1)).toEqual({ url: null, type: null });
    vi.unstubAllGlobals();
  });
});
