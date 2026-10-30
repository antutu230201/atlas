import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/env';

describe('parseEnv', () => {
  it('空输入得到安全的开发默认值', () => {
    const env = parseEnv({});
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.EMBEDDED_PG).toBe(true);
    expect(env.DATABASE_URL).toBe('postgres://atlas:atlas@localhost:5432/atlas');
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000');
  });

  it('接受显式覆盖并自动纠正类型（字符串端口号）', () => {
    const env = parseEnv({ PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });

  it('EMBEDDED_PG=false 关闭内嵌数据库', () => {
    expect(parseEnv({ EMBEDDED_PG: 'false' }).EMBEDDED_PG).toBe(false);
    expect(parseEnv({ EMBEDDED_PG: 'true' }).EMBEDDED_PG).toBe(true);
  });

  it('非法端口直接报错', () => {
    expect(() => parseEnv({ PORT: 'not-a-number' })).toThrow(/环境变量校验失败/);
  });

  it('非法 DATABASE_URL 直接报错', () => {
    expect(() => parseEnv({ DATABASE_URL: 'not a url' })).toThrow(/环境变量校验失败/);
  });

  it('未知 LOG_LEVEL 直接报错', () => {
    expect(() => parseEnv({ LOG_LEVEL: 'verbose' })).toThrow(/环境变量校验失败/);
  });
});
