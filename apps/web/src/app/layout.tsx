import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '@atlas/tokens';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Atlas · 个人成长系统',
  description: '平台内核 + 可插拔模块的个人长期成长型系统',
  // PWA：可安装到桌面/开始菜单（standalone 窗口；Chrome 对已安装应用放行自动播放，挂墙场景刚需）
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0d0f17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning：防闪烁脚本会在水合前改写 data-theme
    <html lang="zh-CN" data-theme="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className="min-h-screen bg-bg font-sans text-text antialiased"
        style={{ background: 'var(--bg-gradient)', backgroundAttachment: 'fixed' }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
