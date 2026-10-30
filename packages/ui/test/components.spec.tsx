import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { applyTheme } from '@atlas/tokens';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Switch,
} from '../src';

describe('Button', () => {
  it('渲染文字并可点击', () => {
    let clicked = 0;
    render(<Button onClick={() => (clicked += 1)}>保存</Button>);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(clicked).toBe(1);
  });

  it('loading 态禁用按钮', () => {
    render(<Button loading>提交</Button>);
    const button = screen.getByRole('button', { name: /提交/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('variant 决定语义类名（令牌而非硬编码颜色）', () => {
    render(<Button variant="danger">删除</Button>);
    expect(screen.getByRole('button', { name: '删除' }).className).toContain('bg-err');
  });
});

describe('Field / Input', () => {
  it('error 文案覆盖 hint，输入框带 invalid 标记', () => {
    render(
      <Field id="title" label="标题" hint="最多 50 字" error="内容不能为空" required>
        <Input id="title" invalid />
      </Field>,
    );
    expect(screen.getByText('内容不能为空')).toBeTruthy();
    expect(screen.queryByText('最多 50 字')).toBeNull();
    expect(screen.getByLabelText(/标题/).getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Switch / Checkbox', () => {
  it('Switch 点击切换状态', () => {
    render(<Switch aria-label="开启通知" />);
    const control = screen.getByRole('switch', { name: '开启通知' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('Checkbox 带标签可切换', () => {
    render(<Checkbox id="c1" label="同意条款" />);
    const control = screen.getByRole('checkbox', { name: '同意条款' });
    fireEvent.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Dialog', () => {
  it('打开后展示标题与描述', () => {
    render(
      <Dialog>
        <DialogTrigger>打开</DialogTrigger>
        <DialogContent>
          <DialogTitle>确认归档？</DialogTitle>
          <DialogDescription>归档后仍可恢复。</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByText('确认归档？')).toBeTruthy();
    expect(screen.getByText('归档后仍可恢复。')).toBeTruthy();
  });
});

describe('展示组件', () => {
  it('Badge / Card / EmptyState / Skeleton 正常渲染', () => {
    render(
      <div>
        <Badge variant="ok">已完成</Badge>
        <Card>
          <CardTitle>本周回顾</CardTitle>
        </Card>
        <EmptyState title="还没有待办" description="创建第一件待办开始今天。" />
        <Skeleton className="h-4 w-32" />
      </div>,
    );
    expect(screen.getByText('已完成').className).toContain('bg-ok-soft');
    expect(screen.getByText('本周回顾')).toBeTruthy();
    expect(screen.getByText('还没有待办')).toBeTruthy();
  });
});

describe('applyTheme', () => {
  it('把主题写到 <html data-theme>', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
