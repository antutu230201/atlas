'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@atlas/ui';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

/**
 * 网易云扫码登录弹窗：二维码在浏览器本地生成（unikey 是一次性登录凭据，
 * 绝不发给任何第三方二维码服务）；每 2.5s 轮询扫码状态，过期自动重取。
 * 服务端在 confirmed 时才落库加密 cookie，本组件只展示状态。
 */

interface QrStartPayload {
  unikey: string;
  qrUrl: string;
}

type PollStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired';

const POLL_INTERVAL_MS = 2_500;

export function NeteaseLoginDialog({
  base,
  open,
  onOpenChange,
  onBound,
}: {
  base: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBound: () => void;
}) {
  const queryClient = useQueryClient();
  const [qrImage, setQrImage] = useState('');
  const [pollStatus, setPollStatus] = useState<PollStatus>('waiting');
  const [pollError, setPollError] = useState('');
  const activeUnikeyRef = useRef('');

  const qrQuery = useQuery({
    queryKey: ['dashboard', 'netease-qr'],
    queryFn: () => api<QrStartPayload>(`${base}/neteaseQrStart`, { method: 'POST', json: {} }),
    enabled: open,
    staleTime: 0,
    retry: 1,
  });
  const unikey = qrQuery.data?.unikey ?? '';
  activeUnikeyRef.current = unikey;

  // 二维码本地渲染：qrUrl 含一次性 unikey，只画在用户自己的页面里
  useEffect(() => {
    if (!open || !qrQuery.data?.qrUrl) {
      setQrImage('');
      return;
    }
    setPollStatus('waiting');
    setPollError('');
    let cancelled = false;
    QRCode.toDataURL(qrQuery.data.qrUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrImage(url);
      })
      .catch(() => {
        if (!cancelled) setPollError('二维码生成失败，请重试');
      });
    return () => {
      cancelled = true;
    };
  }, [open, qrQuery.data?.qrUrl]);

  // 轮询：仅弹窗打开且已有 unikey 时；confirmed 交给服务端绑定，这里只反映状态
  useEffect(() => {
    if (!open || !unikey) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await api<{ status: PollStatus; nickname?: string }>(
          `${base}/neteaseQrPoll`,
          { method: 'POST', json: { unikey: activeUnikeyRef.current } },
        );
        if (cancelled) return;
        setPollError('');
        setPollStatus(result.status);
        if (result.status === 'confirmed') {
          await queryClient.invalidateQueries({ queryKey: ['dashboard', 'netease-liked'] });
          await queryClient.invalidateQueries({ queryKey: ['dashboard', 'netease-binding'] });
          onBound();
          onOpenChange(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setPollError(cause instanceof Error ? cause.message : '轮询失败，将继续重试');
        }
      }
    };
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [base, onBound, onOpenChange, open, queryClient, unikey]);

  const refreshQr = () => {
    setPollStatus('waiting');
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'netease-qr'] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>登录网易云音乐</DialogTitle>
          <DialogDescription>
            使用网易云 App 扫码；登录凭据加密存储在本系统，可随时退出登录。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2" data-testid="netease-login-dialog">
          {qrQuery.isPending ? (
            <div className="flex h-[220px] w-[220px] items-center justify-center text-xs text-muted">
              正在生成二维码…
            </div>
          ) : qrQuery.isError ? (
            <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 text-center text-xs text-warn">
              <span>二维码获取失败</span>
              <button
                type="button"
                className="screen-icon-button !min-h-8 !px-3 text-text"
                onClick={refreshQr}
              >
                重试
              </button>
            </div>
          ) : (
            <div className="relative">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt="网易云登录二维码"
                  className="size-[220px] rounded-sm bg-surface"
                />
              ) : (
                <div className="flex h-[220px] w-[220px] items-center justify-center text-xs text-muted">
                  正在生成二维码…
                </div>
              )}
              {pollStatus === 'expired' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/90 text-xs">
                  <span>二维码已过期</span>
                  <button
                    type="button"
                    className="screen-icon-button !min-h-8 !px-3 text-text"
                    onClick={refreshQr}
                  >
                    刷新二维码
                  </button>
                </div>
              ) : null}
              {pollStatus === 'scanned' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ok-soft/90 text-xs text-text">
                  <ScreenIcon name="check" className="size-6 text-ok" />
                  <span>已扫码，请在手机上确认</span>
                </div>
              ) : null}
            </div>
          )}
          <p className="min-h-5 text-center text-[11px] leading-5 text-muted" role="status">
            {pollError ? (
              <span className="text-warn">{pollError}</span>
            ) : pollStatus === 'scanned' ? (
              ''
            ) : (
              '扫码后在手机上点击确认即可'
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
