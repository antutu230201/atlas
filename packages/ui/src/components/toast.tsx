'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '../cn';
import { XIcon } from '../icons';

export type ToastVariant = 'info' | 'ok' | 'err';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<{ toast: (options: ToastOptions) => void } | null>(null);

const variantClass: Record<ToastVariant, string> = {
  info: 'border-border bg-surface text-text',
  ok: 'border-ok/40 bg-ok-soft text-ok',
  err: 'border-err/40 bg-err-soft text-err',
};

/**
 * 全局消息提示（阶段 3b）：provider 挂外壳，业务里 useToast().toast({...})。
 * Radix Toast 负责无障碍与手势；样式全部走令牌。
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useMemo(() => ({ n: 0 }), []);

  const toast = useCallback(
    (options: ToastOptions) => {
      seq.n += 1;
      const id = seq.n;
      setItems((prev) => [...prev.slice(-4), { id, ...options }]);
      return id;
    },
    [seq],
  );

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            duration={4000}
            onSwipeEnd={() => dismiss(item.id)}
            className={cn(
              'z-[var(--z-toast)] rounded-sm border bg-surface px-4 py-3 shadow-md',
              'data-[state=open]:animate-in data-[swipe=end]:opacity-0',
              variantClass[item.variant ?? 'info'],
            )}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <RadixToast.Title className="text-sm font-semibold">{item.title}</RadixToast.Title>
                {item.description ? (
                  <RadixToast.Description className="mt-0.5 text-xs opacity-80">
                    {item.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              <RadixToast.Close
                aria-label="关闭"
                className="rounded-xs p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <XIcon width={12} height={12} />
              </RadixToast.Close>
            </div>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-[var(--z-toast)] flex w-80 flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast 必须在 <ToastProvider> 内使用');
  }
  return { toast: context.toast };
}
