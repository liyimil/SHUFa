# AI 辅助书法学习平台

本仓库用于实现“拍摄单字—识别确认—检索名家同字—对比—个性化建议—再次练习—记录与分享”的 MVP。

## AI / 开发者接手入口

继续开发前请按顺序阅读：

1. [完整交接文档](HANDOFF.md)
2. [M0～M9 完整任务清单](TASK_CHECKLIST.md)
3. [当前项目状态](PROJECT_STATUS.md)
4. [实施目标与任务拆解](AI辅助书法学习产品-实施目标与任务拆解.md)

交接文档包含架构、历史工作、配置矩阵、运行命令、验证证据、外部阻塞、禁止误报事项和下一步执行顺序。当前 Git `main` 尚无首个提交，不要在未检查 Secret、缓存和构建产物前直接全量暂存。

## 应用目录

- `apps/mobile`：React Native / Expo 移动端。
- `apps/web`：Next.js 公开查字与分享站点。
- `apps/admin`：Next.js 内容管理后台。
- `apps/api`：NestJS 模块化单体业务 API。
- `apps/worker`：异步任务 Worker。
- `apps/ai-service`：FastAPI AI 推理服务。
- `packages/domain-types`：不依赖运行平台的稳定领域类型。

## 本地要求

- Node.js 24 LTS
- pnpm 11
- Python 3.12
- uv 0.11.31
- Docker（数据库、Redis 与对象存储里程碑需要）

## 快速开始

```powershell
pnpm install
Copy-Item .env.example .env
pnpm typecheck
pnpm test
```

需要完整跨服务流程时，先启动 PostgreSQL、Redis 和 MinIO：

```powershell
docker compose up -d
pnpm --filter @calligraphy/api db:generate
pnpm --filter @calligraphy/api db:migrate
pnpm --filter @calligraphy/api db:seed
```

单独启动应用：

```powershell
pnpm --filter @calligraphy/api dev
pnpm --filter @calligraphy/worker dev
pnpm --filter @calligraphy/web dev
pnpm --filter @calligraphy/admin dev
pnpm --filter @calligraphy/mobile dev
```

AI 服务使用独立 Python 环境，具体命令见 `apps/ai-service/README.md`。

## 当前能力边界

App 的核心流程已接通；在毛笔字识别模型和真实评测集完成前，用户通过手动输入确认汉字。结构提示只使用可复核的重心和高宽比差异，不作艺术好坏判断。公开查询只返回 `PUBLISHED`、权利允许公开、未过授权期且非 AI 生成的范字。

真实名家内容必须通过后台的来源、权利、原图校验、裁切和双人审核流程。仓库不附带来历不明的“演示名家图”。

批量生产单字内容时请遵循[批量导入操作手册](docs/content-import-runbook.md)。

当前实现与外部阻塞见 `PROJECT_STATUS.md`，镜像、迁移、备份和回滚见 `infrastructure/OPERATIONS.md`。

隐私设置将产品存储、公开分享和模型训练拆开记录；后两项默认关闭。具体执行语义和仍待合规确认的事项见 `docs/decisions/0001-privacy-defaults.md`。

已保存作品的删除采用两阶段流程：API 先撤销练习图片访问和相关公开分享，再由可重试 Worker 删除私有对象并记录终态。生产环境的物理清理延迟由 `ARTWORK_DELETION_DELAY_SECONDS` 和对象存储非当前版本生命周期共同决定，具体值必须符合已批准的隐私保留策略。

## 设计约束

- PostgreSQL 是业务事实库，Redis 和对象存储不能成为业务状态的唯一来源。
- 名家、作品和出处只能来自经过审核的结构化数据。
- AI 服务不修改权限、发布和版权事实。
- MVP 保持模块化单体，除 AI 推理外不提前拆微服务。
