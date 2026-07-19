# AI 辅助书法学习产品：完整 AI 交接文档

> 交接版本：2026-07-19  
> 仓库路径：`C:\Users\asus\Desktop\github\书法`  
> 当前目标：完成《AI辅助书法学习产品-实施目标与任务拆解》中的阶段 0 技术验证和阶段 1 MVP  
> 当前结论：核心工程闭环已实现并可本地构建；完整验收和公开上线尚未完成  
> 配套清单：`TASK_CHECKLIST.md`

## 0. 给下一位 AI 的第一段提示

不要从零重写，也不要先升级依赖。先把本文件、`TASK_CHECKLIST.md`、`PROJECT_STATUS.md`、PRD、架构、技术选型、实施任务和 `docs/decisions` 全部读完，然后以当前代码和命令输出为事实。

当前仓库最容易被误判的五件事：

1. 核心 App 流程已经有大量实现，不是只有脚手架。
2. “识别”目前依靠用户手动确认；没有毛笔字 Top-K 模型，不能声称识别已完成。
3. 目录、后台和权利门禁齐全，但仓库不含真实授权名家字库，不能把示例或任意网络图片当真迹。
4. Compose、迁移、Dockerfile 和运维手册已存在，但本机没有 Docker，真实 PostgreSQL/Redis/MinIO/Staging 链路没有验收。
5. Git 目录存在，但 `main` 没有任何提交；所有项目尚未形成可回退的版本基线。

下一位 AI 的默认起点是完成 M2-14：补齐剩余 38 个管理端 OpenAPI 契约，让 Admin 使用生成类型。不要先做大规模重构。

## 1. 产品目标与不能改变的边界

目标闭环：

```text
拍照/相册
  → 私有直传与图片安全准入
  → 图片质量检测
  → 识别候选或手动确认汉字
  → 检索经过审核且允许公开的名家同字
  → 并排/叠加对比
  → 可解释、可复核且不超过三条的结构建议
  → 再练一次
  → 历史、收藏、分享、反馈和删除
```

必须保持的产品原则：

- 名家、作品、版本、出处和权利只能来自审核后的结构化内容。
- AI 不得修改版权、发布、权限或用户授权事实。
- 没有可靠模型时必须允许手动确认，不能生成看似可信的候选字。
- 没有书法专家规则时只能输出可测量几何现象，不能宣称艺术评分、部件比例或主方向结论。
- 用户图片默认私有；分享必须主动创建，训练授权与公开分享、存储授权相互独立。
- 删除先撤销业务访问和分享，再由可重试 Worker 物理清理对象。
- PostgreSQL 是业务事实库；Redis 和对象存储不能成为唯一业务状态来源。

## 2. 文档阅读顺序

1. `AI辅助书法学习产品需求文档-PRD.md`：用户、范围、流程和验收目标。
2. `AI辅助书法学习产品-系统架构文档.md`：模块边界、数据流和安全设计。
3. `AI辅助书法学习产品-技术选型文档.md`：技术栈与选型理由。
4. `AI辅助书法学习产品-实施目标与任务拆解.md`：M0～M9 的权威任务定义。
5. `PROJECT_STATUS.md`：已经实现的工程闭环、验证基线和外部阻塞。
6. `TASK_CHECKLIST.md`：逐个任务的完成、部分完成和未完成状态。
7. `docs/decisions/0001`～`0008`：隐私、收藏、分享、版权、脱敏、图片安全、失败降级和 OpenAPI 决策。
8. `infrastructure/OPERATIONS.md`：发布、迁移、回滚、备份、删除、告警和上线门禁。
9. `docs/content-import-runbook.md`：真实内容批量导入流程。

## 3. 仓库结构与职责

| 路径                     | 技术                                        | 职责                                                                       | 当前状态                                                     |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/mobile`            | Expo 57、React Native 0.86                  | 拍照、上传、确认、查字、对比、建议、再练、历史、收藏、分享、反馈、删除     | 核心工程流程已实现；无 Top-K、离线草稿和真机验收             |
| `apps/web`               | Next.js 16、React 19                        | 公开查字、范字详情、分享页、OG/Metadata/JSON-LD                            | 功能和模块测试已完成；缺浏览器 E2E、性能与真实 CDN 验收      |
| `apps/admin`             | Next.js 16、React 19                        | 内容录入、权利、原图、预切分、框选、标注、导入、审核、发布、反馈、教师抽检 | 工程功能已实现；OpenAPI 生成类型尚未接入，缺真实内容操作验收 |
| `apps/api`               | NestJS 11、Prisma 7、PostgreSQL             | 模块化单体业务事实和权限边界                                               | 143 项测试通过；22 组迁移；真实数据库未迁移验收              |
| `apps/worker`            | Node 24、BullMQ、AWS S3 SDK                 | 质量、裁切、预切分、结构分析和物理删除任务                                 | 12 项测试通过；真实 Redis/S3/AI 跨服务未验证                 |
| `apps/ai-service`        | Python 3.12、FastAPI、OpenCV、NumPy、Pillow | 图片质量、裁切、预切分、归一化和几何结构比较                               | 12 项 pytest；没有 Top-K 模型和正式固定评测集                |
| `packages/api-contract`  | OpenAPI、openapi-typescript                 | 稳定 OpenAPI 和跨客户端类型                                                | 73 个操作追踪，35 个具体强类型操作，6 项测试                 |
| `packages/observability` | TypeScript                                  | API/Worker 共用路径和诊断脱敏                                              | 3 项测试通过                                                 |
| `packages/domain-types`  | TypeScript                                  | 平台无关领域类型占位包                                                     | 可构建；暂无运行时测试和大规模复用                           |

主要版本：Node 24、pnpm 11.9、TypeScript 5.9、Next 16.2、React 19.2、NestJS 11.1、Prisma 7.8、Expo 57、React Native 0.86、Python 3.12。

## 4. 已完成工作的完整摘要

### 4.1 移动端

- 相机/相册选择、系统图片裁切和权限拒绝提示。
- 匿名会话、SecureStore 持久化、Access/Refresh Token 轮换、撤销和旧 Access Token 会话升级。
- 带 `clientRequestId` 的上传预约、S3 签名直传、完成、取消、丢失响应重试和服务器清理提示。
- 图片质量轮询；`PASSED`、`NEEDS_RETAKE`、`FAILED` 均有终态处理。
- 质检技术失败时停止轮询，只开放手动确认、查字和本地对比，不允许进入结构建议。
- 单字确认、公开目录检索、书家/碑帖/书体筛选、范字详情和来源上下文。
- 并排对比；叠加对比支持移动、缩放、旋转、透明度和恢复默认。
- 中心线、外框和重心辅助线与 AI 几何参数一致。
- 创建练习、异步结构建议、失败终态、再练一次和前后尝试关联。
- 历史列表、同字筛选和任意两次同字作品并排复盘。
- 收藏、取消、分组、移动、上下排序、删除分组和从收藏进入练习。
- 主动分享、撤销分享、反馈提交/进度和作品删除终态轮询。
- 固定事件名、幂等事件 ID 和练习会话所有权约束的埋点。

### 4.2 公开 Web/H5

- 首页单字输入、编码汉字固定路由和服务端渲染。
- 书家、碑帖和书体筛选；固定 Glyph 详情 URL。
- 来源、权利署名、原帖页码/边界框上下文展示。
- 空结果和服务失败降级，不伪造相似字。
- Next 标签缓存；API 通过共享令牌调用内部失效端点。
- 动态 Metadata、Open Graph、Twitter Card 和无内部 ID 的 JSON-LD。
- 公开分享页面、撤销/过期失效页面。
- 分享 OG PNG 只使用不含用户图片地址的最小摘要。

### 4.3 内容管理后台

- 管理员账号使用 scrypt 哈希，角色为 `EDITOR`、`REVIEWER`、`RIGHTS`、`ADMIN`。
- 书家、作品、版本和权利记录的创建、更新、启停和审计。
- 主数据停用时级联归档公开内容，删除公开衍生物并失效 Web 缓存。
- 权利失效时精确归档受影响 Glyph，而不是无差别删除。
- 原图私有直传、SHA-256、已入库和进行中上传重复检测。
- 持久化预切分任务和候选框，Worker 失败终态。
- 五分钟私有原帖预览、缩放拖拽和像素级框选。
- 候选接受/驳回、规范字、观察字、异体类型、释文和标注人。
- CSV 模板、严格表头、BOM/引号处理、最多 200 行、逐行报告和零污染原子提交。
- 异步 Glyph 裁切、双人审核、发布权利门禁、纠错重裁、带原因下架。
- 不可变内容历史、字段差异和通过正常更新链路恢复前一版本。
- 反馈分派、用户可见处理说明、关闭和审计。
- 教师建议抽检、意见、审计和闭环漏斗。

### 4.4 API 与数据库

- 22 组顺序 Prisma 迁移，覆盖目录、用户作品、分析、审计、内容上传、练习分享、反馈、刷新会话、隐私、纠错、主数据生命周期、重复索引、预切分、标注、导入、上传幂等、事件、分析溯源、删除任务、收藏分组和质检终态失败。
- 公开目录严格过滤 `PUBLISHED`、有效公开权利、非 AI 生成、当前有效主数据。
- 上传限制：10 MB、JPEG/PNG/WebP、单边 256～12000、4000 万像素、单帧、完整解码。
- 完成上传时不信任客户端 MIME/尺寸；拒绝后清理私有对象且不进入队列。
- 练习和再次尝试必须绑定本人、质检通过、字符一致的作品和当前可公开范字。
- 建议结果持久化对象键、SHA-256、归一化、测量、模型和规则版本。
- 分享使用高熵令牌，数据库只存 SHA-256；公开摘要不签用户图片 URL。
- 删除在事务中撤销作品访问和分享，再创建可重试物理删除任务；旧 attempt 回调不能覆盖新一轮。
- 三维用户授权：存储、公开分享、模型训练，各自独立时间和审计。
- 反馈引用对象需要属于用户或当前公开，后台负责人不返回给普通用户。
- 业务事件只允许固定字段，没有任意自由文本；漏斗窗口最长 90 天。

### 4.5 Worker 与 AI

Worker 队列：

- `artwork-analysis-v1`：下载私有作品、调用质量服务、回调结果或最终失败。
- Glyph 裁切：调用 AI 裁切、上传不可变公开 WebP、回调尺寸和校验和。
- 原帖预切分：调用 AI、持久化版本化候选框和失败终态。
- 练习结构分析：下载用户和范字、调用几何比较、回调建议/溯源或失败。
- 作品删除：幂等删除私有对象，最多重试五次并回调终态。

AI HTTP 边界：

- `GET /health`
- `POST /v1/image-quality`
- `POST /v1/glyph-crop`
- `POST /v1/source-segmentation`
- `POST /v1/glyph-normalization`
- `POST /v1/structure-comparison`

AI 当前没有 `/recognition` 或 Top-K 接口。`glyph-normalization-v1` 保持原比例放入 512×512 白底画布；`structure-measurement-v2` 输出外框、高宽比、重心、空间分布、置信度和异常。低置信度不输出动作建议；部件比例和主方向明确标为没有验证规则。

### 4.6 安全、隐私、版权与可观测性

- API 安全头、CORS、请求 ID、结构化完成日志和生产配置快速失败。
- 共享脱敏器移除签名 URL、Bearer/JWT、常见凭据、用户对象键、邮箱、手机号和长 Token。
- 公开分享路径在日志中固定替换为 `:shareToken`，查询串不记录。
- 后台角色和内部 Worker Token 分开；用户数据操作验证所有权。
- 原图私有、公开衍生物与权利记录绑定；D 级 AI 生成内容不能公开。
- 8 份 ADR 记录关键决策：隐私默认值、收藏、分享卡、目录版权元数据、日志脱敏、上传准入、质检失败降级、OpenAPI 生成。

### 4.7 OpenAPI 和客户端契约

- `apps/api/src/openapi-document.ts` 是运行时 Swagger与静态生成共用入口。
- `apps/api/src/openapi-contract.ts` 在 Nest 路由扫描上补充真实 Schema。
- `apps/api/scripts/generate-openapi.mts` 稳定排序并写 `packages/api-contract/openapi.json`。
- `openapi-typescript` 生成 `packages/api-contract/src/generated.ts`。
- 已结构化 35/73：身份、目录、上传、质检、隐私、练习、收藏、分享、删除、反馈、埋点和健康。
- 未结构化 38/73：`ContentAdminController` 32、`AdminInsightsController` 3、`AdminFeedbackController` 2、`AdminSessionController` 1。
- Mobile 已消费身份、上传、质检、隐私、练习、收藏、删除、反馈和事件类型；Web 已消费目录类型。
- Admin 仍维护 `apps/admin/lib/api.ts` 手写类型，是下一批迁移对象。

## 5. 当前验证基线

最近一次本地全量验证：2026-07-18。结果：

| 范围          | 结果                                                            |
| ------------- | --------------------------------------------------------------- |
| API           | 143/143 Node 测试；类型和生产构建通过                           |
| API 契约      | 6/6；73 个操作唯一，35 个标记操作均有 JSON Schema，漂移检查通过 |
| Worker        | 12/12；生产构建通过                                             |
| Mobile        | 23/23；类型检查和 Expo Android 静态导出通过                     |
| Web           | 11/11；Next.js standalone 构建通过                              |
| Admin         | 10/10；Next.js standalone 构建通过                              |
| AI            | 12 项 pytest；Ruff 和 FastAPI 边界通过                          |
| Observability | 3/3 脱敏测试                                                    |
| 全仓          | Prettier、ESLint、Turbo 类型/测试/构建通过                      |

已知测试现象：一次全仓运行中 `apps/api/test/app.e2e.test.ts` 子进程整体退出但没有失败断言；单独运行 17/17，通过再次执行全仓测试后 API 143/143。若复现，优先检查 Node 测试并发、资源和子进程退出原因，不要直接放宽业务断言。

## 6. 本地环境和启动方法

### 6.1 必需工具

- Node.js 24+
- pnpm 11.9.0
- Python 3.12（必须 `<3.13`）
- Docker / Docker Compose：当前机器没有；跨服务验收必须换环境

当前机器已有 `node_modules` 和 `.venv`，但交接者应以锁文件/配置重建，不依赖缓存目录。

### 6.2 安装

```powershell
Set-Location 'C:\Users\asus\Desktop\github\书法'
$env:CI='true'
$env:NODE_ENV='development'
pnpm install --frozen-lockfile
Copy-Item .env.example .env

py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".\apps\ai-service[dev]"
```

本项目曾因 `NODE_ENV=production` 导致 pnpm 忽略开发依赖，因此执行开发命令前显式设为 `development`。

### 6.3 基础设施（需要 Docker）

```powershell
docker compose up -d
docker compose ps
pnpm --filter @calligraphy/api db:generate
pnpm --filter @calligraphy/api db:validate
pnpm --filter @calligraphy/api db:migrate
pnpm --filter @calligraphy/api db:seed
```

注意：Compose 只定义 PostgreSQL、Redis 和 MinIO 服务，没有应用容器，也没有自动创建 `calligraphy-private`/`calligraphy-public` 桶的初始化任务。接手者必须补桶初始化或手工创建，并验证私有/公开桶策略。

### 6.4 启动顺序

```powershell
# 1. AI
.venv\Scripts\python -m uvicorn calligraphy_ai.main:app --app-dir apps/ai-service/src --reload --port 8000

# 2. API
pnpm --filter @calligraphy/api dev

# 3. Worker
pnpm --filter @calligraphy/worker dev

# 4. Web / Admin
pnpm --filter @calligraphy/web dev
pnpm --filter @calligraphy/admin dev

# 5. Mobile
pnpm --filter @calligraphy/mobile dev
```

默认端口：Web 3000、API 3001、Admin 3002、AI 8000、PostgreSQL 5432、Redis 6379、MinIO S3 9000、MinIO Console 9001。

开发环境 API 文档：`http://localhost:3001/api/docs`。健康检查：API `/api/v1/health`，AI `/health`。

### 6.5 全仓门禁

```powershell
$env:CI='true'
$env:NODE_ENV='development'
pnpm format:check
pnpm lint
pnpm contract:check
pnpm typecheck
pnpm test
pnpm build

Set-Location apps/ai-service
..\..\.venv\Scripts\python -m ruff check .
..\..\.venv\Scripts\python -m pytest
```

## 7. 配置矩阵

### 7.1 已有模板和代码支持

| 变量                                       | 消费方             | 用途                              | 本地模板                      |
| ------------------------------------------ | ------------------ | --------------------------------- | ----------------------------- |
| `NODE_ENV`、`APP_ENV`                      | 全局/API           | 环境和生产门禁                    | 有                            |
| `API_PORT`                                 | API                | 默认 3001                         | 有                            |
| `API_BASE_URL`                             | Worker、Web 服务端 | Worker 回调和 Web 访问 API Origin | 有                            |
| `NEXT_PUBLIC_API_BASE_URL`                 | Web、Admin         | 浏览器 API 根路径/构建参数        | 有                            |
| `EXPO_PUBLIC_API_BASE_URL`                 | Mobile             | App API 根路径                    | 有                            |
| `DATABASE_URL`                             | API/Prisma         | PostgreSQL                        | 有                            |
| `POSTGRES_DB/USER/PASSWORD`                | Compose            | 本地 PostgreSQL                   | 有，仅开发值                  |
| `REDIS_URL`                                | API/Worker         | BullMQ 与 Redis                   | 有                            |
| `JWT_SECRET`                               | API                | 用户和后台签名                    | 有占位，生产必须替换为 32+ 位 |
| `ADMIN_ACCOUNTS_JSON`                      | API                | 后台账号、scrypt 哈希和角色       | 有无效占位；用哈希脚本生成    |
| `INTERNAL_WORKER_TOKEN`                    | API/Worker         | 内部回调                          | 有占位，生产必须替换          |
| `ARTWORK_DELETION_DELAY_SECONDS`           | API                | 物理删除延迟 0～2592000 秒        | 有，默认 0                    |
| `WEB_CACHE_INVALIDATION_URL/TOKEN`         | API/Web            | 目录标签失效                      | 有占位 Token                  |
| `PUBLIC_WEB_URL`                           | API/Web            | 分享链接和卡片 Origin             | 有                            |
| `S3_ENDPOINT/REGION/ACCESS_KEY/SECRET_KEY` | API/Worker         | S3 兼容存储                       | 有本地值                      |
| `S3_BUCKET_PRIVATE/PUBLIC`                 | API/Worker         | 私有用户图/公开内容图             | 有                            |
| `MINIO_ROOT_USER/PASSWORD`                 | Compose            | MinIO 管理账号                    | 有开发值                      |
| `AI_SERVICE_URL`                           | Worker             | AI HTTP Origin                    | 有                            |

生成后台密码：

```powershell
pnpm --filter @calligraphy/api admin:hash-password -- 'replace-with-a-strong-password'
```

把输出放入 `ADMIN_ACCOUNTS_JSON`，角色只能使用 `EDITOR`、`REVIEWER`、`RIGHTS`、`ADMIN`。

### 7.2 代码支持但 `.env.example` 尚未列出的变量

| 变量                    | 用途                                               | 下一步                               |
| ----------------------- | -------------------------------------------------- | ------------------------------------ |
| `CORS_ORIGINS`          | 逗号分隔 API 允许 Origin；缺省只允许本地 Web/Admin | 应补入模板并在生产明确配置           |
| `ENABLE_API_DOCS`       | 生产临时开启 Swagger                               | 正常生产保持未设置/false             |
| `PUBLIC_ASSET_BASE_URL` | 构造公开 Glyph 图片 URL                            | 生产应设置为 CDN/公开桶 HTTPS 根地址 |
| `PORT`                  | Next standalone 运行端口                           | Dockerfile 已设置，不必放客户端环境  |

### 7.3 尚不存在、不能凭空填写的配置

- 没有 `.env` 中的真实 Secret；不得把 `.env.example` 占位值用于生产。
- 没有云 PostgreSQL、Redis、S3、CDN、短信、域名和 TLS 地址。
- 没有 Registry、镜像签名、制品保留和部署平台配置。
- 没有监控平台 DSN、指标后端、告警接收人和 on-call 配置。
- 没有备份存储、PITR、RPO/RTO 和对象非当前版本生命周期的批准值。
- 没有 iOS 签名、Apple/Google 商店、EAS、Android keystore 或内测渠道配置。
- 没有手机号短信供应商、微信登录、账号合并或未成年人监护配置。
- 没有模型文件、模型仓库、GPU、识别阈值或评测数据路径。
- 没有真实书家内容、版权文件、专业审核人账号和负责人名单。

### 7.4 生产 API 强制配置

`NODE_ENV=production` 时，API 会强制要求：

```text
ADMIN_ACCOUNTS_JSON
DATABASE_URL
INTERNAL_WORKER_TOKEN
JWT_SECRET
PUBLIC_WEB_URL
REDIS_URL
S3_BUCKET_PRIVATE
S3_BUCKET_PUBLIC
S3_REGION
WEB_CACHE_INVALIDATION_TOKEN
WEB_CACHE_INVALIDATION_URL
```

`JWT_SECRET`、`INTERNAL_WORKER_TOKEN`、`WEB_CACHE_INVALIDATION_TOKEN` 必须至少 32 位且不能包含占位片段。生产默认关闭 Swagger。

当前快速失败门禁仍有边界：它没有强制要求 `CORS_ORIGINS`、`PUBLIC_ASSET_BASE_URL`、S3 凭证/工作负载身份和 Worker 的 `AI_SERVICE_URL`/`API_BASE_URL`。API 可能启动成功但浏览器 Origin、公开图片或 Worker 链路仍不可用；部署清单必须额外校验这些变量。Worker 自身会在启动时拒绝缺少 `AI_SERVICE_URL`、`API_BASE_URL` 或 `INTERNAL_WORKER_TOKEN`。

## 8. 数据、示例内容和版权警告

`apps/api/prisma/seed.ts` 只能用于工程/本地数据结构验证。接手者必须检查 seed 内容的权利状态，不得把它宣传为真实名家真迹，也不得把其存在当作 M0-02/M0-03/M4-13 完成证据。

真实内容上线必须经过：

```text
来源候选与授权证据
  → 权利记录
  → 私有原图和 SHA-256
  → 机器预切分
  → 人工框选/文字/异体/释文
  → 第一人审核
  → 第二人复核
  → 权利门禁
  → 异步公开裁切
  → 发布
```

不得从网络搜索下载名家图片填库，除非用户提供可记录、可核验且允许目标用途的授权证据。

## 9. Git、生成文件和工作区注意事项

- `.git` 存在，当前分支 `main`，但没有任何提交。
- `git status --short` 显示整个项目为未跟踪；不要直接 `git add -A`。
- 建立首个提交前检查 `.env`、`.venv`、`node_modules`、`.next`、`dist`、`.turbo`、临时 deploy 目录、Prisma 生成文件和真实图片是否被 `.gitignore` 覆盖。
- 当前存在 `.tmp-api-deploy`、`.tmp-worker-deploy`、`.ruff_cache`、`.turbo` 等本地产物；不要把它们当源码。
- `packages/api-contract/openapi.json` 和 `packages/api-contract/src/generated.ts` 是受版本控制的生成制品，不得手工修改或用 Prettier 改格式。
- 修改 API 契约后运行 `pnpm contract:generate`，再运行 `pnpm contract:check`。
- 现有代码和文档属于用户；不要用 `git reset --hard`、`git checkout --` 或批量删除来“清理”。

## 10. 下一位 AI 的明确实施顺序

### 10.1 第一批：完成 M2-14

剩余 38 个操作分类：

1. `AdminSessionController` 1 个：后台登录请求和令牌/角色响应。
2. `AdminFeedbackController` 2 个：查询过滤和处理更新。
3. `AdminInsightsController` 3 个：教师样本、意见、漏斗和查询参数。
4. `ContentAdminController` 32 个：主数据、权利、Glyph、原图、预切分、导入、审核、发布、下架和历史。

每完成一组必须：

- 从 Controller → Service → Repository 的真实输入和返回形状推导 Schema。
- 核对 Nest 实际 HTTP 状态码；POST 默认通常是 201。
- 补后台 Bearer 鉴权、UUID 路径参数、查询参数和文件/CSV 响应。
- 加入 `typedClientOperationIds`，生成后应带 `x-client-contract: true`。
- 让 `apps/admin/lib/api.ts` 逐组消费 `@calligraphy/api-contract` 类型。
- 扩展 `packages/api-contract/test/contract.test.mjs`，不要只改预期数量。
- 运行 API/契约/Admin 类型和测试，再跑全仓门禁。
- 达到 73/73 后更新 ADR-0008、`PROJECT_STATUS.md`、`TASK_CHECKLIST.md`；此时才可判定 M2-14 工程完成。

### 10.2 第二批：工程可交接质量

- 确认 `.gitignore` 和敏感数据后，由用户授权建立首个 Git 基线提交。
- 为公开 Web 引入浏览器 E2E，覆盖查字、筛选、详情、分享和撤销失效。
- 补 App 未提交图片/裁切草稿持久化和弱网恢复。
- 补 App 内精确单字框选/方向修正，避免只依赖系统 `allowsEditing`。
- 为客户端统一解析 API 错误码和 `X-Request-Id`，显示可提供给客服的追踪 ID。
- 为 AI 日志接入来自 Worker/API 的关联 ID。

### 10.3 第三批：有 Docker/云资源后

- 初始化两个 S3 桶和桶策略，验证私有对象没有永久公开 URL。
- 在空 PostgreSQL 18 执行 22 组迁移和 seed，并验证从备份恢复。
- 启动 Redis，走通五类 BullMQ 任务和最终失败回调。
- 运行上传格式伪装、截断、超大像素、并发完成/取消和拒绝对象清理。
- 验证下架后 API、Web 标签、CDN 和旧公开图片 URL 的失效时间。
- 演练 AI 503/超时、Redis 断连、S3 失败、API 回调断连和迟到重复回调。

### 10.4 外部人员/数据到位后

- 确认 50～100 个种子字、书家、碑帖、授权范围和双人复核人。
- 建立毛笔字 Top-K 模型、固定评测集、错误样本和真实阈值报告。
- 让书法老师复核结构测量、建议规则、字符适用范围和禁用表达。
- 完成 Android/iOS 真机、弱网、低端机和商店内测。
- 完成未成年人、隐私、版权、备份、告警、发布和回滚签字。

## 11. 已知缺口和禁止误报

以下均未完成：

- Top-K 毛笔字识别及其持久化。
- 真实授权种子字库和专业双人复核。
- 专业部件比例/主方向规则。
- Web 浏览器 E2E、App 真机、性能和正式混沌报告。
- Docker 跨服务冒烟、Staging、生产、域名/TLS。
- 数据库/对象存储真实恢复演练和监控告警平台。
- 手机号/微信登录、Web HttpOnly Cookie、未成年人方案。
- App 商店内测和公测上线评审。

不要用下面这些替代完成证据：

- 不能用手动输入页面声称 Top-K 识别已完成。
- 不能用 seed 或后台工具声称真实种子字库已完成。
- 不能用单元测试声称真实 S3/Redis/PostgreSQL 已验收。
- 不能用 Dockerfile 存在声称镜像已在本机成功构建。
- 不能用运维手册声称备份恢复、滚动回滚或告警已演练。
- 不能用通用几何建议声称书法专家规则已通过。
- 不能用 Android 静态导出声称 iOS/Android 内测包已发布。

## 12. 交接完成判定

下一位 AI 读完本文件后，应能回答：

- 项目为何先做 App，同时保留公开 Web 和内容后台。
- 六个应用和三个共享包分别做什么。
- 当前核心闭环哪些已实现、哪些是可靠降级。
- 为什么不能使用无来源书法图和不可验证 AI 结论。
- 如何配置、生成契约、运行测试和启动服务。
- 哪些配置已有模板，哪些必须由用户/云平台/专业人员提供。
- 为什么当前不能公开上线。
- 下一步为何是 38 个管理端 OpenAPI 契约，而不是重构或换技术栈。

如果以上任何一点仍不清楚，先查本文列出的权威文件和代码，不要猜测。
