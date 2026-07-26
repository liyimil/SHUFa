# 贡献与代码评审约定

## 分支与提交

- `main` 必须保持可构建；功能改动从最新 `main` 创建短生命周期分支。
- 分支使用 `feature/<主题>`、`fix/<主题>`、`docs/<主题>` 或 `chore/<主题>`。
- 一次提交只表达一个可验证意图，提交信息使用祈使语气并说明结果。
- 不提交 `.env`、访问令牌、用户图片、私有原帖、依赖目录、缓存或构建产物。

## 提交前检查

```bash
pnpm format:check
pnpm lint
pnpm contract:check
pnpm typecheck
pnpm test
pnpm build
```

修改 API 路由、请求或响应后，先运行 `pnpm contract:generate`，提交生成的
`packages/api-contract/openapi.json` 与 `packages/api-contract/src/generated.ts`，再运行
`pnpm contract:check` 确认没有契约漂移。

## Pull Request

- PR 说明必须列出用户可见结果、数据迁移、配置变化、测试证据和已知风险。
- 涉及内容发布、版权状态、隐私、身份或删除链路的改动必须由对应责任人复核。
- 作者不能批准自己的 PR；至少一名非作者完成代码评审后才能合并。
- CI 全绿且所有阻塞意见解决后，使用 squash merge；不要绕过质量门禁直接推送功能提交到 `main`。
- 破坏性数据库变更必须提供向前兼容步骤、备份/恢复方案和回滚说明。

## 内容与 AI 边界

- 名家范字必须记录真实来源、授权状态和人工审核，禁止用无来源图片填充正式字库。
- 模型指标必须来自固定评测集；没有模型或专业复核时，必须明确降级或返回不可用，不能伪造候选、准确率或专家结论。
