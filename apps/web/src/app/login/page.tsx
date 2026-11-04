'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, Input } from '@atlas/ui';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { displayName: string } }>('/auth/me'),
    retry: false,
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.isSuccess) router.replace('/');
  }, [session.isSuccess, router]);

  const login = useMutation({
    mutationFn: () => api('/auth/login', { method: 'POST', json: { email, password } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : '登录失败'),
  });

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      {/* OriginOS 风格渐变背景球 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 size-80 rounded-full bg-ok/8 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 size-72 rounded-full bg-warn/6 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-10 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-primary">ATLAS</p>
          <p className="mt-2 text-xs text-muted">个人长期成长型系统</p>
        </div>
        <Card variant="glass" className="shadow-lg">
          <div className="mb-6 space-y-1">
            <h1 className="text-lg font-semibold">欢迎回来</h1>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              login.mutate();
            }}
          >
            <Field id="login-email" label="邮箱" required>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                invalid={Boolean(error)}
              />
            </Field>
            <Field id="login-password" label="密码" required error={error ?? undefined}>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={Boolean(error)}
              />
            </Field>
            <Button type="submit" className="w-full" loading={login.isPending}>
              登录
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted">
            还没有账号？
            <a href="/register" className="text-primary hover:underline">
              注册
            </a>
          </p>
        </Card>
        <p className="mt-8 text-center text-[11px] text-muted/50">
          平台内核 + 可插拔模块 · 数据完全属于你
        </p>
      </div>
    </main>
  );
}
