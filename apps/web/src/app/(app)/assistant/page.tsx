'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input, cn } from '@atlas/ui';
import { api } from '@/lib/api';
import { useActiveWorkspace } from '@/hooks/use-workspace';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const QUICK_PROMPTS = [
  '帮我反思今天',
  '我在低落的时候怎么办',
  '帮我分解一个目标',
  '引导我做周复盘',
];

/** 会话持久化：按用户存本机（刷新不丢；跨设备同步留待后端会话存储） */
const chatKey = (userId: string) => `atlas.assistant.chat.${userId}`;
const MAX_MESSAGES = 60;

export default function AssistantPage() {
  const { user } = useActiveWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 按用户恢复会话（useEffect 读取，避免 SSR 水合不一致）
  useEffect(() => {
    if (!user) return;
    try {
      const raw = window.localStorage.getItem(chatKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(
            parsed
              .filter(
                (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
              )
              .slice(-MAX_MESSAGES),
          );
        }
      }
    } catch {
      // 本地会话损坏：从空白开始，不影响使用。
    }
  }, [user]);

  // 会话变化即持久化（截断到上限，防止无限膨胀）
  useEffect(() => {
    if (!user) return;
    try {
      window.localStorage.setItem(chatKey(user.id), JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      // 存储不可用（隐私模式）：对话仍可用，只是刷新后不保留。
    }
  }, [messages, user]);

  const clearChat = () => {
    setMessages([]);
    if (user) {
      try {
        window.localStorage.removeItem(chatKey(user.id));
      } catch {
        // 忽略
      }
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await api<{ text: string }>('/ai/chat', {
        method: 'POST',
        json: { message: text.trim() },
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: result.text }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '抱歉，我暂时无法回应。请稍后再试。' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-2xl flex-col">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">AI 成长助手</h1>
          <p className="screen-label mt-1 !text-[10px]">Assistant · Always here</p>
          <p className="text-xs text-muted">温暖、直接、有智慧——像一位老朋友。</p>
        </div>
        {messages.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={clearChat}>
            清空对话
          </Button>
        ) : null}
      </header>

      <div ref={scrollRef} className="glass flex-1 overflow-y-auto rounded-[var(--radius-lg)] p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-3xl">🌱</p>
            <p className="text-sm font-medium text-text">有什么想聊的？</p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-all duration-200 hover:border-primary/30 hover:text-primary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-[var(--radius-md)] px-4 py-2.5 text-sm',
                  msg.role === 'user'
                    ? 'ml-auto bg-primary text-on-primary'
                    : 'bg-surface-hover text-text',
                )}
              >
                {msg.text}
              </div>
            ))}
            {loading ? (
              <div className="max-w-[85%] rounded-[var(--radius-md)] bg-surface-hover px-4 py-2.5">
                <span className="inline-flex gap-1">
                  <span
                    className="size-1.5 animate-bounce rounded-full bg-muted"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="size-1.5 animate-bounce rounded-full bg-muted"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="size-1.5 animate-bounce rounded-full bg-muted"
                    style={{ animationDelay: '300ms' }}
                  />
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="说点什么…"
          aria-label="AI 助手消息"
          className="flex-1"
        />
        <Button type="submit" loading={loading} disabled={!input.trim()}>
          发送
        </Button>
      </form>

      {user ? (
        <p className="mt-2 text-center text-[11px] text-muted/60">
          当前使用 MockAIProvider · 配置真实 AI 供应商后自动切换
        </p>
      ) : null}
    </div>
  );
}
