import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) rejectPromise(error);
      else resolvePromise(derivedKey);
    });
  });
}

/**
 * 密码哈希（ADR-0005 §5）：Node 内置 scrypt，零依赖。
 * 存储格式 scrypt$N$r$p$salt$hash，参数随哈希存储，未来可平滑迁移 argon2。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw = '', rRaw = '', pRaw = '', saltRaw = '', hashRaw = ''] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(hashRaw, 'base64');
  try {
    const key = await scryptAsync(
      password.normalize('NFKC'),
      Buffer.from(saltRaw, 'base64'),
      expected.length,
      {
        N: n,
        r,
        p,
      },
    );
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
