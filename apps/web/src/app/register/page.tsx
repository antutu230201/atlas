'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, Input } from '@atlas/ui';
import { api, ApiError } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { displayName: string } }>('/auth/me'),
    retry: false,
  });

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.isSuccess) router.replace('/');
  }, [session.isSuccess, router]);

  const register = useMutation({
    mutationFn: () =>
      api('/auth/register', { method: 'POST', json: { email, password, displayName } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : '注册失败'),
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
            <h1 className="text-lg font-semibold">注册</h1>
            <p className="text-sm text-muted">创建你的个人成长空间</p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              register.mutate();
            }}
          >
            <Field id="reg-name" label="昵称" required>
              <Input
                id="reg-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="怎么称呼你"
              />
            </Field>
            <Field id="reg-email" label="邮箱" required>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field
              id="reg-password"
              label="密码"
              required
              hint="至少 8 位"
              error={error ?? undefined}
            >
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" loading={register.isPending}>
              创建账号
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted">
            已有账号？
            <a href="/login" className="text-primary hover:underline">
              登录
            </a>
          </p>
        </Card>
        <p className="mt-8 text-center text-[11px] text-muted/60">你的数据完全属于你，随时可导出</p>
      </div>
    </main>
  );
}
