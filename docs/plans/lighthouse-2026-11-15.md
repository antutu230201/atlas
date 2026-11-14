# Lighthouse 全站基线（2026-11-15）

**用途：**关闭 roadmap P2「Lighthouse 全站复测」项，为后续优化提供可对比基线。
**口径：**本机生产构建（`pnpm build` + `next start`，端口 3100）、API 走本地 dev（3001）、系统 Chrome headless=new、Lighthouse 默认移动端模拟（Moto G Power）、登录态经 `--extra-headers` 注入会话 Cookie。
**限制：**本机测量不代表发布环境真实用户数据；单用户无并发；API 为 dev 进程。

## 结果汇总（8 条路由）

| 路由                   | Performance | Accessibility | Best Practices | SEO | LCP   | CLS   | TBT  |
| ---------------------- | ----------- | ------------- | -------------- | --- | ----- | ----- | ---- |
| /register              | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 30ms |
| /（登录态大屏）        | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 50ms |
| /m/todo_notes/list     | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 39ms |
| /m/dashboard/listening | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 42ms |
| /m/journal/review      | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 41ms |
| /notifications         | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 29ms |
| /settings              | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 30ms |
| /assistant             | 100         | 100           | 96             | 100 | 0.91s | 0.000 | 37ms |

**结论：**性能全 100、可访问性全 100、SEO 全 100、CLS 全 0、LCP 全部 ≈0.9s（<1.5s 目标达成）、TBT 全部 <60ms。与历史抽测（2026-10-31 register 性能 100 / LCP 0.9s）一致——经过大量功能迭代后分数未退化。

## 已知扣分项（均良性，不计划处理）

- **Best Practices 96**：唯一扣分是公开页的 `/v1/auth/me` 会话探测返回 401（浏览器把失败请求记入 console）。属预期行为；修复需把端点语义改为 200 + {authenticated:false}（API 契约变更），收益不足。
- **unused-javascript（性能内 insight，不计分）**：~96KB 分散在 3 个 chunk（模块分包的固有权衡，按需加载换来首屏脚本 -40.6% 已是净赢）。

## 复测方法

```bash
# 1. 生产构建 + 生产 web（3100）+ dev API（3001）
pnpm build && cd apps/web && PORT=3100 pnpm start

# 2. 登录取会话 cookie（curl -c /tmp/lh-ck.txt），然后：
CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" \
LH_COOKIE="atlas_session=<值>" node .local/tmp/lh-batch.cjs

# 3. 读分：node .local/tmp/read-lh.cjs <路由名>
```

脚本位于 `.local/tmp/`（gitignore，不入库）。
