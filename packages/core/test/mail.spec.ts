import { describe, expect, it, vi } from 'vitest';
import { ConsoleMailAdapter } from '../src/mail';

describe('ConsoleMailAdapter（本地开发邮件适配器）', () => {
  it('send 将收件人、主题与正文打印到日志', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = new ConsoleMailAdapter();
    expect(adapter.name).toBe('mail-console');
    await adapter.send({ to: 'a@example.com', subject: '邀请', text: '欢迎使用 Atlas' });
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0]?.join(' ') ?? '';
    expect(output).toContain('a@example.com');
    expect(output).toContain('邀请');
    expect(output).toContain('欢迎使用 Atlas');
    spy.mockRestore();
  });
});
