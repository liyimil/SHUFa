# Node 依赖安全基线

> 基线日期：2026-07-22
>
> 包管理器：pnpm 11.9.0

## 1. 处理结果

修复前 `pnpm audit` 报告 3 个高危、4 个中危公告；修复后：

```text
pnpm security:audit
No known vulnerabilities found
```

CI 现在以 `moderate` 为最低失败等级，不忽略高危公告，也不依赖手工查看安装日志。

## 2. 精确修复

除 API 直接依赖 `sharp` 外，其余都是上游尚未更新范围的传递依赖。pnpm 11 的精确覆盖统一记录在根 `pnpm-workspace.yaml`，不使用宽泛的全包降级或审计忽略列表。

| 依赖                | 修复前  | 固定版本 | 受影响路径与原因                                                      |
| ------------------- | ------- | -------- | --------------------------------------------------------------------- |
| `js-yaml`           | 4.2.0   | 4.3.0    | OpenAPI 生成工具；修复合并键链二次复杂度拒绝服务                      |
| `fast-uri`          | 3.1.3   | 3.1.4    | Prisma 本地流工具的 AJV；修复反斜杠主机解析差异                       |
| `sharp`             | 0.34.5  | 0.35.3   | API 图片准入及 Next 图片栈；修复 libvips 公告并提供 NodeNext 类型导出 |
| `@hono/node-server` | 1.19.11 | 2.0.10   | Prisma 开发工具；覆盖静态路径和 WebSocket 内存泄漏公告                |
| `postcss`           | 8.4.31  | 8.5.19   | Next 构建链；修复 `</style>` 未转义导致的 CSS 输出 XSS                |
| `uuid`              | 7.0.3   | 11.1.1   | Expo 的 xcode 配置工具；修复带输出缓冲区时的边界检查缺失              |

对应的 GitHub Reviewed 公告：

- `GHSA-52cp-r559-cp3m`（js-yaml）
- `GHSA-v2hh-gcrm-f6hx`（fast-uri）
- `GHSA-f88m-g3jw-g9cj`（sharp/libvips）
- `GHSA-92pp-h63x-v22m`、`GHSA-frvp-7c67-39w9`、`GHSA-9mqv-5hh9-4cgg`（Hono Node Server）
- `GHSA-qx2v-qp2m-jg93`（PostCSS）
- `GHSA-w5hq-g745-h8pq`（uuid）

## 3. 兼容性证据

涉及主版本跨越的包不能只凭审计清零判定完成。本次执行了：

- Prisma 7.8 Client 生成和 schema 验证，确认 Hono 覆盖没有破坏 CLI 加载。
- API 严格类型检查、4 项图片完整解码测试和 9 项上传安全/状态测试，确认 sharp 0.35.3 的 NodeNext 类型与运行行为。
- Web/Admin Next.js production standalone 构建，确认 sharp 0.35 与 PostCSS 8.5。
- Expo public config、xcode `generateUuid()` 兼容冒烟、35 项移动测试和 Android 静态导出，确认 uuid 11 的 CommonJS/v4 路径。
- 全仓格式、Lint、OpenAPI 漂移、类型、测试和构建。

本机没有 macOS/iOS 构建环境，因此 xcode 工具链仍需在真实 iOS 预构建/签名流程再次验证；当前证据不能替代 M9-04/M9-21。

## 4. 维护规则

- 这些覆盖是有明确公告与测试证据的临时安全回填。上游 Prisma、Next 或 Expo 接受安全版本后，应先移除相应覆盖、重新安装，再执行相同回归。
- 新增或修改覆盖必须给出旧版本、修复版本、公告和兼容性证据，不能用 `auditConfig.ignoreCves` 隐藏问题。
- 每次 PR 由 CI 运行 `pnpm security:audit`；若注册表新增中危以上公告，先判断路径与可达性，再修复或在交接文档记录无法解决的外部阻塞。
