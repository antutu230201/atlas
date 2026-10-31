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
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-bold tracking-[0.3em] text-primary">ATLAS</p>
          <p className="mt-1 text-xs text-muted">个人长期成长型系统</p>
        </div>
        <Card className="shadow-md">
          <div className="mb-6 space-y-1">
            <h1 className="text-lg font-semibold">登录</h1>
            <p className="text-sm text-muted">欢迎回来</p>
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
        <p className="mt-8 text-center text-[11px] text-muted/60">
          平台内核 + 可插拔模块 · 数据完全属于你
        </p>
      </div>
    </main>
  );
}
