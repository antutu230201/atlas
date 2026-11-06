import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * 用户级凭据的静态加密盒（AES-256-GCM）。
 * 密钥来自环境变量 ATLAS_NETEASE_SECRET（宪法 §4：密钥只在环境变量；未配置则 fail-closed），
 * scrypt 派生为 32 字节密钥。存储格式：v1:<iv>:<tag>:<ciphertext>（均 base64）。
 */

const ENV_KEY = 'ATLAS_NETEASE_SECRET';
const FORMAT_VERSION = 'v1';

export class SecretNotConfiguredError extends Error {
  constructor() {
    super(`环境变量 ${ENV_KEY} 未配置，无法加解密网易云凭据`);
    this.name = 'SecretNotConfiguredError';
  }
}

function isConfigured(): boolean {
  return Boolean(process.env[ENV_KEY] && process.env[ENV_KEY]!.length >= 16);
}

/** 供动作层提前给出可读错误（而不是等加密时才失败） */
export function requireSecretConfigured(): void {
  if (!isConfigured()) throw new SecretNotConfiguredError();
}

function derivedKey(): Buffer {
  const secret = process.env[ENV_KEY]!;
  return scryptSync(secret, 'atlas.netease.cookie.v1', 32);
}

export function seal(plaintext: string): string {
  requireSecretConfigured();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derivedKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    sealed.toString('base64'),
  ].join(':');
}

export function open(sealedText: string): string {
  requireSecretConfigured();
  const [version, ivB64, tagB64, dataB64] = sealedText.split(':');
  if (version !== FORMAT_VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('凭据密文格式不合法');
  }
  const decipher = createDecipheriv('aes-256-gcm', derivedKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
