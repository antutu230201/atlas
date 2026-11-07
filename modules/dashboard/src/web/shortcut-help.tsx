'use client';

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@atlas/ui';

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'F', action: '进入 / 退出全屏' },
  { keys: 'L', action: '切换低功耗' },
  { keys: 'R', action: '刷新全部数据源' },
  { keys: 'S', action: '打开大屏设置' },
  { keys: 'A', action: '打开 AI 助手' },
  { keys: '空格', action: '播放 / 暂停（播放器聚焦时）' },
  { keys: '?', action: '显示 / 隐藏本列表' },
  { keys: 'Esc', action: '关闭弹层' },
];

/** 键盘快捷键说明：挂墙时通常接键盘，按 ? 随时调出 */
export function ShortcutHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
          <DialogDescription>不在输入框里时生效，随时可关。</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border/60">
          {SHORTCUTS.map((item) => (
            <li key={item.keys} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-muted">{item.action}</span>
              <kbd className="rounded-xs border border-border bg-surface-hover px-2 py-0.5 font-mono text-[11px] text-text">
                {item.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <DialogClose asChild>
            <Button size="sm">知道了</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
