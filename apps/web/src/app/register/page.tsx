'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, Input } from '@atlas/ui';
import { api, ApiError } from '@/lib/api';
import { AuthFrame } from '@/components/auth-frame';

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
    <AuthFrame>
      <div className="mb-10 text-center">
        <p className="text-2xl font-bold tracking-[0.3em] text-primary">ATLAS</p>
        <p className="screen-label mt-2">Personal OS · Create account</p>
      </div>
      <Card className="screen-card shadow-soft">
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
      <p className="mt-8 text-center text-[11px] text-muted/50">你的数据完全属于你，随时可导出</p>
    </AuthFrame>
  );
}
