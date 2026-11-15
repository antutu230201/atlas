import { describe, expect, it } from 'vitest';
import { isBlockedAiEndpoint } from '@atlas/core';

/** SSRF 加固（OWASP 自审 2026-11-15）：AI baseUrl 封锁云元数据端点，放行本地代理 */

describe('isBlockedAiEndpoint', () => {
  it('封锁云元数据端点（含变体与链路本地段）', () => {
    expect(isBlockedAiEndpoint('http://169.254.169.254/v1')).toBe(true);
    expect(isBlockedAiEndpoint('http://169.254.169.254:8080/latest/meta-data')).toBe(true);
    expect(isBlockedAiEndpoint('https://metadata.google.internal/computeMetadata/v1')).toBe(true);
    expect(isBlockedAiEndpoint('https://metadata.goog/')).toBe(true);
    expect(isBlockedAiEndpoint('http://169.254.10.20/v1')).toBe(true); // 链路本地段整段封
    expect(isBlockedAiEndpoint('http://[fe80::1]:3000/v1')).toBe(true); // IPv6 链路本地
    expect(isBlockedAiEndpoint('http://[fd00:ec2::254]/v1')).toBe(true); // IPv6 元数据
  });

  it('放行合法供应商与本地代理（本地 mock/自建网关是合法用法）', () => {
    expect(isBlockedAiEndpoint('https://api.openai.com/v1')).toBe(false);
    expect(isBlockedAiEndpoint('https://open.bigmodel.cn/api/paas/v4')).toBe(false);
    expect(isBlockedAiEndpoint('http://127.0.0.1:8080/v1')).toBe(false);
    expect(isBlockedAiEndpoint('http://192.168.1.10:3000/v1')).toBe(false);
    expect(isBlockedAiEndpoint('https://ai.example.com')).toBe(false);
  });

  it('非合法 URL 不封锁（交由 zod 校验报错）', () => {
    expect(isBlockedAiEndpoint('not-a-url')).toBe(false);
  });
});
