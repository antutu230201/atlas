import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
  ToastProvider,
  useToast,
} from '../src';

describe('ToastProvider / useToast', () => {
  it('toast 在视口中出现并可通过关闭按钮移除', () => {
    function Demo() {
      const { toast } = useToast();
      return (
        <button
          type="button"
          onClick={() => toast({ title: '已保存', description: '笔记已更新', variant: 'ok' })}
        >
          触发
        </button>
      );
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '触发' }));
    expect(screen.getByText('已保存')).toBeTruthy();
    expect(screen.getByText('笔记已更新')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByText('已保存')).toBeNull();
  });

  it('provider 外使用抛出中文错误', () => {
    function Broken() {
      const { toast } = useToast();
      void toast;
      return null;
    }
    expect(() => render(<Broken />)).toThrow(/useToast 必须在/);
  });
});

describe('Drawer', () => {
  it('打开后展示标题并可通过触发器关闭', () => {
    render(
      <Drawer>
        <DrawerTrigger asChild>
          <button type="button">打开抽屉</button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>导航面板</DrawerTitle>
          <DrawerBody>内容</DrawerBody>
        </DrawerContent>
      </Drawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: '打开抽屉' }));
    expect(screen.getByText('导航面板')).toBeTruthy();
  });
});
