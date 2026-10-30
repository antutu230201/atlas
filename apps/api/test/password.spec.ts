import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, newSessionToken, verifyPassword } from '../src/auth/password';

describe('密码哈希（scrypt，ADR-0005 §5）', () => {
  it('哈希可验证：正确密码通过', async () => {
    const hash = await hashPassword('S3cure-Passw0rd!');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('S3cure-Passw0rd!', hash)).resolves.toBe(true);
  });

  it('错误密码拒绝', async () => {
    const hash = await hashPassword('correct-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('同一密码每次哈希不同（随机盐）', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('篡改或畸形存储串安全失败', async () => {
    await expect(verifyPassword('x', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$2a$10$whatever')).resolves.toBe(false);
    const tampered = (await hashPassword('secret123')).replace(/.{4}$/, 'AAAA');
    await expect(verifyPassword('secret123', tampered)).resolves.toBe(false);
  });
});

describe('会话令牌', () => {
  it('token 为 url-safe 随机串且哈希为 sha256 hex', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const hash = createHash('sha256').update(token).digest('hex');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // 随机性抽样：两次生成不同
    expect(newSessionToken()).not.toBe(token);
  });
});

describe('randomBytes 冒烟', () => {
  it('长度符合 base64url 预期（32 字节 → 43 字符）', () => {
    const t = randomBytes(32).toString('base64url');
    expect(t).toHaveLength(43);
  });
});
