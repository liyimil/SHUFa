# 公开 Web 性能与可访问性基线

> 基线日期：2026-07-22
>
> 对应任务：M5-09
>
> 适用范围：公开 Web 首页与单字检索首屏

## 1. 验收口径

PRD 要求公开单字页首屏目标加载时间不超过 3 秒；系统架构要求已缓存公开单字页首字节小于 800 ms。为避免只看单一总分，本仓库把持续预算固定为：

| 指标                 | 预算       |
| -------------------- | ---------- |
| Lighthouse 性能      | ≥ 90       |
| Lighthouse 可访问性  | 100        |
| Lighthouse 最佳实践  | ≥ 95       |
| Lighthouse SEO       | ≥ 90       |
| FCP                  | ≤ 3,000 ms |
| LCP                  | ≤ 3,000 ms |
| 服务响应时间（TTFB） | ≤ 800 ms   |
| 总阻塞时间（TBT）    | ≤ 200 ms   |
| 累积布局偏移（CLS）  | ≤ 0.1      |

预算以同一路径三次 Lighthouse 移动端模拟运行的中位数判定，既保留波动证据，也避免一次本机调度抖动直接改变结论。

## 2. 测试方法

- Next.js 16.2.10 production standalone，而不是开发服务器。
- 受控本地 Mock API，只使用明确标记的合成测试图片，不使用或伪造名家内容。
- Lighthouse 13.4.1 默认移动端模拟节流；Playwright Chromium 149.0.7827.55。
- Windows、Node.js 24.15.0、pnpm 11.9.0。
- 首页 `/` 与公开单字页 `/characters/永` 各运行三次，保存每次 HTML/JSON 报告及汇总；这些运行制品不提交 Git，CI 失败时作为制品上传。
- axe-core 在桌面 Chrome 与 Pixel 7 视口检查首页、App 引导、未筛选/已筛选单字结果、范字详情、有效分享和撤销分享七种状态。

运行命令：

```bash
pnpm --filter @calligraphy/web audit:web
pnpm --filter @calligraphy/web e2e
```

CI 已完成全仓构建后可直接运行：

```bash
pnpm --filter @calligraphy/web audit:ci
```

## 3. 2026-07-22 基线结果

下表均为三次运行中位数：

| 页面       | 性能 | 可访问性 | 最佳实践 | SEO | FCP    | LCP      | TTFB  | TBT    | CLS |
| ---------- | ---: | -------: | -------: | --: | ------ | -------- | ----- | ------ | --: |
| 首页       |   99 |      100 |      100 | 100 | 904 ms | 1,734 ms | 7 ms  | 131 ms |   0 |
| “永”单字页 |  100 |      100 |      100 | 100 | 894 ms | 1,708 ms | 13 ms | 49 ms  |   0 |

两页均达到当前预算，单字页 LCP 低于 PRD 的 3 秒目标。axe 的两种视口、七种页面状态没有发现自动可检测违规。审计时还补齐了站点图标，消除了 `/favicon.ico` 404 造成的浏览器控制台错误。

## 4. 结论边界与后续验收

本基线证明生产构建在受控本机和模拟移动网络下达到当前首屏预算，不等同于真实用户监控或生产容量结论。以下仍需在 Staging/真实设备完成：

- 真实 CDN、跨地域网络、公开图片源和 API 数据库延迟下的 LCP/TTFB。
- Safari、iOS VoiceOver、Android TalkBack、纯键盘和高对比度人工操作。
- 基于真实访问的 Core Web Vitals（LCP、INP、CLS）分位数。
- M9-07 的 API P95、并发、容量和完整修复报告。
