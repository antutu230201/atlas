'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

interface BubbleMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * 大屏内嵌 AI 快聊：看完每日小结想追问时不用跳页。
 * 会话只存内存（完整历史在 /assistant 页，持久化到 localStorage），轻量不留痕。
 * 固定在播放器上方，避免遮挡；展开时面板在播放器左侧。
 */
export function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    try {
      const result = await api<{ text: string }>('/ai/chat', {
        method: 'POST',
        json: { message: text },
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: result.text }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: '我暂时连不上，稍后再试一下。' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="screen-icon-button !size-10 rounded-full shadow-soft"
        aria-label="和 AI 聊两句"
        title="和 AI 聊两句（会话不保存）"
      >
        <ScreenIcon name="sparkles" className="size-4" />
      </button>
    );
  }

  return (
    <div
      className="screen-card flex w-80 flex-col overflow-hidden p-0 shadow-soft"
      role="dialog"
      aria-label="AI 快聊"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <ScreenIcon name="sparkles" className="size-3.5 text-primary" />
          <span className="text-xs font-semibold">AI 快聊</span>
          <span className="font-mono text-[9px] tracking-wider text-muted/70">NOT SAVED</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xs p-1 text-muted transition-colors hover:bg-surface-hover hover:text-text"
          aria-label="收起"
        >
          <ScreenIcon name="close" className="size-3.5" />
        </button>
      </header>

      <div ref={scrollRef} className="max-h-72 min-h-28 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted">
            看完今日小结想追问？直接问，比如「帮我安排明天的三件事」。
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[85%] rounded-sm px-2.5 py-1.5 text-[12px] leading-5 ${
                message.role === 'user'
                  ? 'ml-auto bg-primary-soft text-text'
                  : 'bg-surface-hover text-text/90'
              }`}
            >
              {message.text}
            </div>
          ))
        )}
        {loading ? (
          <div className="max-w-[85%] rounded-sm bg-surface-hover px-2.5 py-1.5 text-[12px] text-muted">
            正在想…
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter 直接发送；气泡内不需要 Shift+Enter 多行
            if (event.key === 'Enter') {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="说点什么…"
          aria-label="AI 快聊输入"
          className="min-w-0 flex-1 rounded-xs border border-border bg-bg px-2 py-1.5 text-[12px] outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={loading || input.trim().length === 0}
          className="rounded-xs bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-on-primary transition-opacity disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  );
}
