'use client';

import { useState } from 'react';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Input,
  Pagination,
  Radio,
  RadioGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Textarea,
  ThemeToggle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  XIcon,
} from '@atlas/ui';

/**
 * 设计系统自身的示例应用页（阶段 1 验收面，ADR-0004）。
 * 所有组件只使用 @atlas/tokens 语义令牌；本页用于人工走查亮暗主题、键盘操作与全部状态。
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const [page, setPage] = useState(2);
  const [toast, setToast] = useState(false);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-10 px-6 py-14">
      <header className="space-y-3">
        <Breadcrumb items={[{ label: '首页', href: '/' }, { label: '设计系统' }]} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">设计系统 · 晨白 Dawn</h1>
            <p className="mt-1 text-sm text-muted">
              全部组件与状态。用右上角切换器检查亮色、暗色与跟随系统；全程可键盘操作。
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <Section title="按钮">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>主按钮</Button>
            <Button variant="secondary">次级按钮</Button>
            <Button variant="ghost">幽灵按钮</Button>
            <Button variant="danger">危险操作</Button>
            <Button disabled>禁用</Button>
            <Button loading>加载中</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">小按钮</Button>
            <Button size="md">中按钮</Button>
            <Button size="lg">大按钮</Button>
            <IconButton aria-label="关闭通知" variant="ghost">
              <XIcon />
            </IconButton>
          </div>
        </Card>
      </Section>

      <Section title="输入与表单">
        <Card className="grid gap-5 sm:grid-cols-2">
          <Field id="d-title" label="标题" hint="最多 50 字" required>
            <Input id="d-title" placeholder="记录今天的一件小事…" />
          </Field>
          <Field id="d-title-err" label="标题（错误态）" error="内容不能为空">
            <Input id="d-title-err" invalid />
          </Field>
          <Field id="d-textarea" label="正文" className="sm:col-span-2">
            <Textarea id="d-textarea" placeholder="写点什么…" />
          </Field>
          <Field id="d-select" label="优先级">
            <Select>
              <SelectTrigger id="d-select">
                <SelectValue placeholder="选择优先级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-sm">每日提醒</span>
              <Switch defaultChecked aria-label="每日提醒" />
            </div>
            <Checkbox id="d-cb" label="周末也提醒" defaultChecked />
          </div>
          <Field id="d-radio" label="复盘频率" className="sm:col-span-2">
            <RadioGroup defaultValue="weekly" className="flex gap-4" aria-labelledby="d-radio">
              <Radio id="d-radio-daily" value="daily" label="每天" />
              <Radio id="d-radio-weekly" value="weekly" label="每周" />
              <Radio id="d-radio-monthly" value="monthly" label="每月" />
            </RadioGroup>
          </Field>
        </Card>
      </Section>

      <Section title="标签与徽标">
        <Card className="flex flex-wrap items-center gap-2">
          <Badge>默认</Badge>
          <Badge variant="primary">进行中</Badge>
          <Badge variant="ok">已完成</Badge>
          <Badge variant="warn">即将到期</Badge>
          <Badge variant="err">已逾期</Badge>
          <Badge variant="info">说明</Badge>
          <Tag onRemove={() => undefined}>可移除标签</Tag>
        </Card>
      </Section>

      <Section title="卡片">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>本周回顾</CardTitle>
              <CardDescription>连续打卡 5 天，完成 12 件待办。</CardDescription>
            </div>
            <Badge variant="ok">健康</Badge>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed text-muted">
              卡片是最常用的内容容器：柔和阴影、12px 圆角、纸感边框。
            </p>
          </CardContent>
          <CardFooter>
            <Button size="sm">查看详情</Button>
            <Button size="sm" variant="ghost">
              稍后再看
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="反馈与浮层">
        <Card className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>打开弹窗</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认归档？</DialogTitle>
                <DialogDescription>
                  归档后这条记录会移入档案库，仍可搜索与恢复。此操作会记入审计日志。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>确认归档</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">下拉菜单</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>操作</DropdownMenuLabel>
              <DropdownMenuItem>编辑</DropdownMenuItem>
              <DropdownMenuItem>复制链接</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>移到回收站</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">悬停提示</Button>
              </TooltipTrigger>
              <TooltipContent>反色气泡：bg-text / text-bg</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button variant="ghost" onClick={() => setToast(true)}>
            消息提示（演示）
          </Button>
          {toast ? (
            <span className="text-xs text-muted">
              Toast 组件在阶段 3 随通知中心落地（见 roadmap）。
            </span>
          ) : null}
        </Card>
      </Section>

      <Section title="标签页">
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">今天</TabsTrigger>
            <TabsTrigger value="week">本周</TabsTrigger>
            <TabsTrigger value="month">本月</TabsTrigger>
          </TabsList>
          <TabsContent value="today">今天完成 3 件，专注 2.5 小时。</TabsContent>
          <TabsContent value="week">本周完成 12 件，连续打卡 5 天。</TabsContent>
          <TabsContent value="month">本月趋势平稳向上。</TabsContent>
        </Tabs>
      </Section>

      <Section title="表格">
        <Table>
          <THead>
            <TR>
              <TH>事项</TH>
              <TH>状态</TH>
              <TH>截止</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>整理季度复盘</TD>
              <TD>
                <Badge variant="primary">进行中</Badge>
              </TD>
              <TD className="text-muted">周五</TD>
            </TR>
            <TR selected>
              <TD>晨间跑步 5km</TD>
              <TD>
                <Badge variant="ok">已完成</Badge>
              </TD>
              <TD className="text-muted">今早</TD>
            </TR>
            <TR>
              <TD>提交项目周报</TD>
              <TD>
                <Badge variant="err">已逾期</Badge>
              </TD>
              <TD className="text-muted">昨天</TD>
            </TR>
          </TBody>
        </Table>
      </Section>

      <Section title="分页">
        <Pagination page={page} total={9} onChange={setPage} />
      </Section>

      <Section title="加载与空态">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-3" aria-busy="true">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </Card>
          <EmptyState
            title="还没有待办"
            description="创建第一件待办，开始今天最重要的事。"
            action={<Button size="sm">新建待办</Button>}
          />
        </div>
      </Section>

      <footer className="pt-4 text-center text-xs text-muted">
        视觉值唯一来源：packages/tokens（ADR-0004）· Storybook 与无障碍自动检查在阶段 1 收尾接入
      </footer>
    </main>
  );
}
