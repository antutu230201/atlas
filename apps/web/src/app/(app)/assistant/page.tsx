'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
const AI_SOURCE_LABELS = {
  db: '界面配置',
  env: '环境变量',
  mock: '本地 Mock',
} as const;

interface AiConfigView {
  source: keyof typeof AI_SOURCE_LABELS;
}

export default function AssistantPage() {
  const { user } = useActiveWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [historyOwner, setHistoryOwner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const userId = user?.id;
  const historyReady = Boolean(userId && historyOwner === userId);
  const aiConfig = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api<AiConfigView>('/ai/config'),
    retry: false,
  });

  // 按用户恢复会话（useEffect 读取，避免 SSR 水合不一致）
  useEffect(() => {
    if (!userId) return;
    setHistoryOwner(null);
    setMessages([]);
    try {
      const raw = window.localStorage.getItem(chatKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(
            parsed
              .filter(
                (m) =>
                  m !== null &&
                  typeof m === 'object' &&
                  (m.role === 'user' || m.role === 'assistant') &&
                  typeof m.text === 'string',
              )
              .slice(-MAX_MESSAGES),
          );
        } else {
          setMessages([]);
        }
      }
    } catch {
      // 本地会话损坏：从空白开始，不影响使用。
      setMessages([]);
    } finally {
      setHistoryOwner(userId);
    }
  }, [userId]);

  // 会话变化即持久化（截断到上限，防止无限膨胀）
  useEffect(() => {
    if (!userId || historyOwner !== userId) return;
    try {
      window.localStorage.setItem(chatKey(userId), JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      // 存储不可用（隐私模式）：对话仍可用，只是刷新后不保留。
    }
  }, [messages, historyOwner, userId]);

  useEffect(() => () => requestController.current?.abort(), []);

  const clearChat = () => {
    requestController.current?.abort();
    requestController.current = null;
    setLoading(false);
    setFailedPrompt(null);
    setMessages([]);
    if (userId) {
      try {
        window.localStorage.removeItem(chatKey(userId));
      } catch {
        // 忽略
      }
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async (text: string, retry = false) => {
    const prompt = text.trim();
    if (!prompt || loading || !historyReady) return;
    if (!retry) {
      setMessages((prev) =>
        [...prev, { role: 'user' as const, text: prompt }].slice(-MAX_MESSAGES),
      );
      setInput('');
    }
    setFailedPrompt(null);
    setLoading(true);
    const controller = new AbortController();
    requestController.current = controller;

    try {
      const result = await api<{ text: string }>('/ai/chat', {
        method: 'POST',
        json: { message: prompt },
        signal: controller.signal,
      });
      setMessages((prev) =>
        [...prev, { role: 'assistant' as const, text: result.text }].slice(-MAX_MESSAGES),
      );
    } catch {
      if (!controller.signal.aborted) setFailedPrompt(prompt);
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col">
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

      <div
        ref={scrollRef}
        className="glass min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-lg)] p-4"
        aria-label="对话记录"
        role="log"
        aria-relevant="additions"
        aria-busy={!historyReady || loading}
      >
        {!historyReady ? (
          <div className="flex h-full items-center justify-center text-sm text-muted" role="status">
            正在恢复对话…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-3xl">🌱</p>
            <p className="text-sm font-medium text-text">有什么想聊的？</p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading || !historyReady}
                  onClick={() => void send(prompt)}
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
                key={`${msg.role}-${i}`}
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
              <div
                className="max-w-[85%] rounded-[var(--radius-md)] bg-surface-hover px-4 py-2.5"
                role="status"
                aria-label="AI 正在回复"
              >
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
            {failedPrompt ? (
              <div className="flex items-center gap-2 text-xs text-err" role="alert">
                <span>回复失败，请检查连接后重试。</span>
                <Button size="sm" variant="secondary" onClick={() => void send(failedPrompt, true)}>
                  重试
                </Button>
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
          maxLength={2000}
          disabled={!historyReady || loading}
          className="flex-1"
        />
        <Button type="submit" loading={loading} disabled={!input.trim() || !historyReady}>
          发送
        </Button>
      </form>

      {userId ? (
        <p className="mt-2 text-center text-[11px] text-muted/60">
          {aiConfig.isError
            ? 'AI 配置状态暂时不可用。'
            : aiConfig.data
              ? `当前使用 ${AI_SOURCE_LABELS[aiConfig.data.source]} AI 供应商。`
              : '正在读取 AI 配置…'}
        </p>
      ) : null}
    </div>
  );
}
