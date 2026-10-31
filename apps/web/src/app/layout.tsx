import type { Metadata } from 'next';
import { THEME_INIT_SCRIPT } from '@atlas/tokens';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Atlas · 个人成长系统',
  description: '平台内核 + 可插拔模块的个人长期成长型系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning：防闪烁脚本会在水合前改写 data-theme
    <html lang="zh-CN" data-theme="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
