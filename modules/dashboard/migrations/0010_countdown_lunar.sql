-- 倒计时支持农历纪念日与每年循环
alter table "modules.dashboard"."countdown"
  add column if not exists repeat_yearly boolean not null default false,
  add column if not exists lunar boolean not null default false,
  add column if not exists lunar_month smallint,
  add column if not exists lunar_day smallint,
  add column if not exists lunar_label text not null default '';
