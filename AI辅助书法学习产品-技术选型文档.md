# AI 辅助书法学习产品——技术选型文档

> 文档版本：V1.0  
> 文档日期：2026-07-18  
> 关联文档：[AI辅助书法学习产品-系统架构文档.md](./AI辅助书法学习产品-系统架构文档.md)  
> 选型目标：以较小团队完成可验证、可上线、可演进的 MVP

## 1. 选型结论

### 1.1 推荐技术栈

| 层级        | 推荐选择                                  | 用途                         |
| ----------- | ----------------------------------------- | ---------------------------- |
| 移动端      | React Native + Expo 稳定版 + TypeScript   | iOS、Android App             |
| 公开 Web/H5 | Next.js 16 稳定线 + React + TypeScript    | 查字、公开单字页、分享页     |
| 管理后台    | Next.js + React + TypeScript              | 内容、版权、审核和反馈后台   |
| 核心后端    | Node.js 24 LTS + NestJS + Express         | 模块化单体 REST API          |
| API 契约    | OpenAPI 3.1 + 生成客户端                  | App、Web、后台与 API 对齐    |
| ORM 与迁移  | Prisma ORM 稳定版                         | PostgreSQL 数据访问和迁移    |
| AI 服务     | Python 3.12 + FastAPI                     | 图像识别、结构分析与推理接口 |
| 模型训练    | PyTorch                                   | 训练、微调和离线评测         |
| 推理运行时  | ONNX Runtime，必要时保留 PyTorch Runtime  | CPU/GPU 推理与跨平台演进     |
| 图像处理    | OpenCV + Pillow                           | 校正、切分、轮廓与衍生图     |
| 主数据库    | PostgreSQL 18                             | 业务、内容、审核和分析元数据 |
| 向量能力    | pgvector，可选启用                        | 阶段 2 相似字形与风格检索    |
| 缓存与队列  | Redis + BullMQ                            | 缓存、限流、后台任务         |
| 文件存储    | S3 兼容对象存储 + CDN                     | 碑帖图、用户作品和衍生图片   |
| 包与仓库    | pnpm Workspace + Turborepo                | TypeScript Monorepo          |
| 容器        | Docker                                    | 本地、测试和生产一致交付     |
| 测试        | Jest、Testing Library、Playwright、pytest | 单元、集成、端到端与模型测试 |
| 可观测性    | OpenTelemetry + 云日志/指标平台           | 日志、指标和分布式追踪       |
| CI/CD       | GitHub Actions 或等价流水线               | 检查、构建、部署与回滚       |

### 1.2 架构形态

```text
React Native App ─┐
Next.js Web ──────┼→ NestJS 模块化单体 → PostgreSQL / Redis / 对象存储
Next.js Admin ────┘             │
                                └→ FastAPI AI 推理服务
```

首版不采用完整微服务、Kubernetes、Elasticsearch、Kafka、GraphQL 和端侧主模型。

## 2. 版本策略

### 2.1 推荐基线

- Node.js：24 LTS。Node.js 官方建议生产应用使用 Active LTS 或 Maintenance LTS；截至本文日期，24 和 22 均处于 LTS，选择 24 以获得更长维护窗口。[Node.js 官方发布计划](https://nodejs.org/en/about/previous-releases)
- Expo：创建项目时使用最新稳定 SDK，不使用 beta 或 canary。当前官方稳定参考线为 SDK 57，对应 React Native 0.86，并要求 Node.js 22.13 以上。[Expo SDK 版本矩阵](https://docs.expo.dev/versions/latest/)
- Next.js：使用 16 稳定线的最新安全修订，不使用 Preview 特性作为核心依赖。[Next.js 官方文档](https://nextjs.org/docs/app)
- PostgreSQL：18 的最新小版本。PostgreSQL 18 官方支持至 2030 年，项目应持续安装同一大版本内的安全与缺陷修订。[PostgreSQL 版本政策](https://www.postgresql.org/support/versioning/)
- Python：3.12。它在现代类型和性能能力与机器学习依赖兼容性之间较稳妥；项目启动时再用完整依赖锁验证。

### 2.2 依赖管理原则

- 只锁定稳定发布，不在生产使用 nightly、beta 或 canary。
- JavaScript 使用 lockfile，Python 使用锁定的依赖文件和镜像摘要。
- 每月进行安全更新，每季度评估框架小版本升级。
- Expo SDK、React Native 和原生模块作为一组升级并执行真机回归。
- 模型版本与代码版本分开管理，但部署清单记录二者组合。
- 文档中的大版本是推荐基线，实际仓库以 lockfile、容器镜像和 ADR 为准。

## 3. 移动端选型

### 3.1 选择：React Native + Expo

#### 选择理由

- 一个 TypeScript 团队可以覆盖 Android、iOS、Web 和后端的大部分业务开发。
- Expo 提供相机、图片选择、文件系统、更新和构建相关能力，适合快速验证拍照练字流程。官方 SDK 包可以在任何安装了 Expo 的 React Native 应用中使用。[Expo SDK 官方参考](https://docs.expo.dev/versions/latest/)
- `expo-image-picker` 支持移动端拍照或从系统图库选择图片，满足 MVP 上传入口。[Expo ImagePicker 官方文档](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- 需要原生能力时可以使用 Development Build 和原生模块，不被 Expo Go 限制。
- 与 Next.js、NestJS 共享 TypeScript 类型、校验规则和接口客户端，降低跨端沟通成本。

#### 实施方式

- 使用 Expo 稳定 SDK 和 Development Build。
- 路由使用 Expo Router。
- 服务端状态使用 TanStack Query。
- 本地轻量状态使用 Zustand；不在首版引入复杂全局状态框架。
- 表单使用 React Hook Form + Zod。
- 安全令牌存储使用系统 Keychain/Keystore 对应的安全存储能力。
- 图片上传走对象存储签名 URL，支持进度和重试。
- 叠加对比先用 React Native 原生视图变换实现；辅助线和复杂绘制经真机性能验证后再引入 Skia。

#### 需要真机验证的风险

- 低端 Android 设备上的大图解码和叠加缩放性能。
- 不同厂商相机返回的方向和 EXIF 差异。
- iOS 与 Android 裁切控件行为差异。
- 大陆网络条件下 Expo 托管服务的可用性。

生产构建不能强依赖海外托管服务。应保留本地原生构建和国内 CI 构建能力，推送、短信和更新通道按部署地区选择可用供应商。

### 3.2 未选择 Flutter 的原因

Flutter 的跨平台 UI 一致性和绘制性能很强，适合重绘制应用。但本项目同时需要 SEO 友好的公开 Web、管理后台和 TypeScript 后端。选择 React Native 可以减少团队语言数量，并与 Web 共享更多领域类型和工具链。

如果现有团队以 Dart/Flutter 为主，或原型证明叠加绘制是绝对核心且 React Native 无法满足性能目标，可以改用 Flutter；服务端架构无需变化。

### 3.3 未选择 uni-app/Taro 作为长期 App 主体的原因

这类方案适合小程序和 H5 快速覆盖，但本产品长期需要相机、图像编辑、复杂手势和可能的端侧推理。首版可以额外制作轻量 H5 或小程序验证入口，但核心 App 使用 React Native 更便于控制原生体验。

## 4. Web 与管理后台选型

### 4.1 选择：Next.js

#### 选择理由

- 公开单字页需要服务端渲染、静态生成、缓存和可控元数据。
- Next.js App Router 支持服务端与客户端组件组合，适合内容页和交互页面共存。[Next.js App Router 官方文档](https://nextjs.org/docs/app)
- Metadata API 可生成页面标题、描述和社交分享图片信息，契合“某字的历代名家写法”和练习分享页。[Next.js Metadata 官方文档](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- Web 和后台可以共享 React 组件、鉴权基础设施和接口客户端。

#### 项目划分

推荐将公开站与后台分成两个 Next.js 应用：

- `apps/web`：面向搜索引擎和普通用户，严格控制公开数据和缓存。
- `apps/admin`：仅授权人员访问，关闭公开索引，强调表格、审核和审计。

二者可共享 `ui-web`、设计令牌和 API 客户端，但不共享路由与权限逻辑。

#### 渲染策略

- 高频单字页：静态生成或增量再验证。
- 长尾单字页：首次访问服务端渲染并缓存。
- 范字详情：服务端渲染公开元数据，高清图片按权限加载。
- 分享页：动态服务端渲染，撤销后立即失效。
- 管理后台：动态渲染，不做 CDN 公共缓存。

### 4.2 UI 组件策略

- 公开站以自建轻量组件和 CSS 变量为主，避免整套后台 UI 影响页面体积。
- 后台选择成熟 React 组件库，但在项目初始化时根据中文表格、表单、可访问性和维护状态做一次小型验证。
- 不强制 App 与 Web 共享组件实现，只共享颜色、字号、间距等设计令牌。

## 5. 核心后端选型

### 5.1 选择：Node.js + NestJS 模块化单体

#### 选择理由

- TypeScript 与移动端、Web 使用同一语言，适合小团队。
- NestJS 的模块、依赖注入、守卫、验证和 OpenAPI 集成适合账号、字库、练习、分享、审核等领域模块。
- 官方支持 Express 和 Fastify；首版选择默认 Express，以获得更广泛的中间件兼容性。[NestJS 官方入门文档](https://docs.nestjs.com/first-steps)
- NestJS 可通过 OpenAPI 描述 REST API，并为客户端生成类型。[NestJS OpenAPI 官方文档](https://docs.nestjs.com/openapi/introduction)
- NestJS 对 Redis 队列有明确集成路径，适合图片衍生、批量切字和重算任务。[NestJS 队列官方文档](https://docs.nestjs.com/techniques/queues)

### 5.2 模块组织

```text
src/modules/
  identity/
  profile/
  catalog/
  search/
  artwork/
  practice/
  analysis/
  collection/
  sharing/
  content-ops/
  feedback/
  audit/
```

每个模块包含领域服务、应用服务、控制器和数据访问。禁止在控制器中直接拼装复杂数据库查询，也禁止任意跨模块写表。

### 5.3 HTTP 适配器选择

首版使用 Express，而不是为了理论吞吐提前切 Fastify。图片走对象存储直传，普通 API 的瓶颈更可能在数据库和 AI。只有压测证明 HTTP 层成为瓶颈时再评估 Fastify。

### 5.4 未选择 Go/Java 的原因

Go 和 Java 都适合长期后端，但 MVP 的主要难点不是极限吞吐，而是数据、模型和产品闭环。Node.js/TypeScript 可以降低团队切换成本。

如果创始团队已有成熟 Java 或 Go 经验，核心后端可以替换，数据库、AI 服务、对象存储和 API 边界不必改变。

### 5.5 未选择 Serverless 作为核心后端的原因

Serverless 适合突发轻量请求，但图片处理、AI 推理、连接池、长任务和大陆云供应商差异会增加约束。公开 Web 可使用平台的边缘或函数能力，核心 API 和 AI 仍以容器部署为主。

## 6. API 与类型选型

### 6.1 选择：REST + OpenAPI

选择理由：

- 资源边界清晰，移动端和后台的请求模式直接。
- 易于生成 TypeScript 客户端和测试契约。
- 图片通过签名地址传输，不需要 GraphQL 文件上传扩展。
- AI 服务也能以明确 schema 暴露内部接口。

### 6.2 不选择 GraphQL 的原因

首版没有大量多层聚合和多客户端任意查询需求。GraphQL 会增加授权、缓存、查询复杂度和客户端生成链路。只有后续社区或机构报表产生明确收益时再评估。

### 6.3 数据验证

- Web/App 表单使用 Zod。
- NestJS 入参使用 DTO 与运行时验证。
- OpenAPI 是跨应用契约，不直接依赖共享源码类型作为唯一契约。
- FastAPI 使用 Pydantic schema。
- CI 中检查 OpenAPI 是否有未提交变更，并生成客户端进行类型检查。

## 7. 数据库选型

### 7.1 选择：PostgreSQL 18

#### 选择理由

- 用户、内容、版权、审核、练习和分析之间有强关系和事务要求。
- 支持丰富索引、JSONB、全文搜索和成熟备份恢复。
- 可通过 pgvector 在同一数据库增加向量检索，避免 MVP 过早维护独立向量库。
- PostgreSQL 官方对每个大版本提供五年支持，18 支持到 2030 年。[PostgreSQL 版本政策](https://www.postgresql.org/support/versioning/)

### 7.2 选择：Prisma ORM

#### 使用范围

- 常规 CRUD、事务、关系查询和迁移。
- schema 作为主要数据结构说明。
- 对复杂报表、锁、原生索引和 pgvector 查询允许使用受审查的原生 SQL。

#### 约束

- 不把 Prisma 模型直接暴露为 API DTO。
- 所有迁移必须进入版本控制并在 Staging 验证。
- 生产迁移不使用危险的自动同步。
- 复杂批量导入避免逐行 ORM 操作，使用批处理或 PostgreSQL 原生能力。

### 7.3 向量检索：pgvector 按需启用

pgvector 支持精确和近似最近邻，并提供 HNSW 与 IVFFlat 索引。[pgvector 官方项目](https://github.com/pgvector/pgvector)

MVP 精确查字不依赖向量。阶段 2 按以下步骤启用：

1. 在离线评测中确定字形向量是否真的改善推荐。
2. 将模型版本与向量列绑定。
3. 数据量较小时使用精确搜索建立基线。
4. 达到延迟瓶颈后再添加 HNSW，并测量召回损失。
5. 字符、书体、发布和版权状态始终先作为结构化过滤条件。

### 7.4 不选择 MongoDB 的原因

核心数据关系明确，内容发布、版权状态和练习记录需要事务与约束。JSONB 已能容纳少量模型输出扩展，无需为灵活 schema 放弃关系完整性。

## 8. 缓存与任务队列选型

### 8.1 选择：Redis

用途：

- 高频公开查字结果缓存。
- 短期幂等键和限流计数。
- 登录风控临时状态。
- BullMQ 任务队列。

Redis Streams 是追加日志结构，支持消费组和确认等处理能力；但本项目 MVP 通过 BullMQ 使用 Redis 的成熟任务抽象，不自行建设通用事件平台。[Redis Streams 官方文档](https://redis.io/docs/latest/develop/data-types/streams/)

### 8.2 选择：BullMQ

- 与 NestJS 和 TypeScript 工具链匹配。
- 支持延迟、重试、并发和任务状态。
- 适合缩略图、预切字、模型重算和删除任务。

业务任务事实仍保存在 PostgreSQL。Redis 故障或数据清理后，可以从 `processing_jobs` 恢复未完成任务。

### 8.3 不选择 Kafka/RabbitMQ 的原因

首版事件量和服务数量有限，没有复杂的多消费者事件流。Redis 已用于缓存和限流，BullMQ 足以支撑任务。出现跨团队事件订阅、长期回放或 Redis 无法满足可靠性要求时再评估专用消息系统。

## 9. AI 技术选型

### 9.1 选择：Python + FastAPI

- Python 是视觉模型、OpenCV、PyTorch 和数据处理的主流环境。
- FastAPI 使用类型标注和 schema 构建接口，适合将推理能力封装为明确内部 API。[FastAPI 官方教程](https://fastapi.tiangolo.com/tutorial/)
- AI 服务与核心业务分开部署，允许独立使用 CPU、GPU 和不同依赖镜像。

### 9.2 选择：PyTorch 训练，ONNX Runtime 推理

- PyTorch 用于研究、训练、微调和离线评测。
- PyTorch 官方支持将模型导出为 ONNX，供 ONNX Runtime 消费。[PyTorch ONNX 官方文档](https://docs.pytorch.org/docs/stable/onnx.html)
- ONNX Runtime 支持 CPU、GPU、移动端和多种执行后端，便于后续优化或评估端侧推理。[ONNX Runtime 官方文档](https://onnxruntime.ai/docs/)

#### 实施顺序

1. 原型阶段允许直接使用 PyTorch Runtime，以最快验证模型质量。
2. 模型稳定后导出 ONNX，验证准确率误差和算子兼容。
3. 对线上推理做 ONNX Runtime 延迟、吞吐和内存基准。
4. 只有服务端成本或隐私需求明确时，才测试 ONNX Runtime Mobile。官方移动运行时支持 iOS 和 Android，但仍需评估模型大小、内存、耗电和设备差异。[ONNX Runtime Mobile 官方文档](https://onnxruntime.ai/docs/get-started/with-mobile.html)

### 9.3 图像处理：OpenCV + Pillow

- OpenCV：透视校正、二值化、轮廓、骨架、形态学操作和几何测量。
- Pillow：格式检查、缩略图、颜色模式转换和简单输出。
- 大批量 Web 缩略图可由对象存储图片处理服务生成，算法衍生图仍由受控 Worker 生成。

### 9.4 建议生成策略

首版采用“几何测量＋专业规则＋模板”的方式，语言模型只作为可选润色层：

```text
模型/算法输出数值
→ 规则判断是否超过阈值
→ 按优先级选择最多三项
→ 模板生成现象、依据、动作
→ 可选语言模型润色
→ schema 与禁用表达校验
```

这样可以降低幻觉风险，保留测量依据，并允许书法老师调整规则。

### 9.5 不采用通用多模态大模型直接评分的原因

- 很难稳定追溯每条建议的测量依据。
- 容易把书家风格差异解释为错误。
- 可能虚构出处或用笔细节。
- 成本、延迟和版本变化不利于建立固定评测基线。

通用模型可以用于内部辅助标注、文案润色或低风险解释，但不能成为名家事实库和唯一判分器。

## 10. 对象存储与图片链路

### 10.1 选择：S3 兼容对象存储

首发根据部署地区选择国内可稳定访问的 OSS/COS/S3 兼容服务，业务代码通过适配层使用统一接口。

### 10.2 Bucket 或前缀隔离

```text
content-original/     碑帖原始档案，严格权限
content-public/       允许公开的范字衍生图
user-private/         用户原始和裁切作品
derived-private/      分析中间产物
share-public/         用户主动生成、可撤销的分享图
model-artifacts/      受控模型文件和摘要
```

### 10.3 上传方案

- 客户端向 API 申请受限上传凭证。
- 凭证限制路径、MIME、大小和有效期。
- 客户端直接上传对象存储。
- API 确认对象存在并校验元数据，再进入识别。
- 后台任务重新编码图片并清理 EXIF。

### 10.4 图片格式建议

- 用户原始上传：保留原格式的受控副本，生成 JPEG/WebP 衍生图。
- 透明叠加字形：PNG 或 WebP lossless。
- 公开缩略图：WebP/AVIF，保留兼容回退。
- 模型输入：服务端统一解码为明确色彩空间和尺寸。

具体格式以真实图像质量、客户端兼容和 CDN 能力测试为准。

## 11. 认证与权限选型

### 11.1 用户认证

推荐首版：

- 手机验证码作为主登录方式。
- 微信登录作为后续或同步接入项，取决于发布形态。
- App 使用短时效 Access Token + 轮换 Refresh Token。
- Web 使用 HttpOnly 安全 Cookie。

不建议自研短信网关，使用符合部署地区要求的云短信服务，并通过适配层隔离供应商。

### 11.2 后台权限

采用 RBAC：

- `CONTENT_EDITOR`：录入和修改草稿。
- `CONTENT_REVIEWER`：审核与发布。
- `RIGHTS_MANAGER`：维护授权和下架。
- `SUPPORT`：查看和处理用户反馈。
- `ADMIN`：用户、角色和系统配置。

审核人不能审核自己提交的关键内容，可通过业务规则实施职责分离。

### 11.3 不选择完整第三方身份平台的原因

大陆手机号、微信和未成年人场景具有本地合规要求。首版由核心后端维护轻量身份模块更可控。若后续进入海外市场或企业 SSO，再评估专用身份服务。

## 12. Monorepo 与工程工具

### 12.1 选择：pnpm Workspace + Turborepo

- pnpm 节省磁盘并严格管理依赖。
- Turborepo 编排 TypeScript 项目的构建、检查和缓存。
- App、Web、后台和 API 共享 lint、格式化、OpenAPI 客户端和稳定领域枚举。

Python AI 服务保留独立虚拟环境和依赖锁，通过根目录任务统一调用，不将 Python 包强行纳入 Node 依赖系统。

### 12.2 代码质量

- TypeScript 开启严格模式。
- ESLint 负责语义检查，Prettier 负责格式化。
- Python 使用 Ruff、mypy 或 Pyright、pytest。
- 提交前运行受影响项目的格式、类型和测试。
- CI 运行完整契约检查、迁移检查和构建。

### 12.3 共享代码边界

可以共享：

- OpenAPI 生成类型与客户端。
- 字符、书体、审核状态等稳定枚举。
- Zod 表单 schema。
- 设计令牌。
- 不依赖平台 API 的计算函数。

不应共享：

- 数据库 ORM 实体到客户端。
- App 与 Web 的具体 UI 组件。
- 后台权限判断到前端作为唯一安全措施。
- AI 内部模型对象到业务层。

## 13. 测试技术选型

| 范围             | 工具                                 | 核心内容                   |
| ---------------- | ------------------------------------ | -------------------------- |
| NestJS 单元/集成 | Jest + Supertest                     | 领域规则、权限和 API       |
| React Native     | Jest + React Native Testing Library  | 页面状态和交互             |
| Next.js          | Vitest/Jest + Testing Library        | 组件与服务端逻辑           |
| Web E2E          | Playwright                           | 查字、详情、分享和后台审核 |
| Python           | pytest                               | 前处理、推理 schema 和规则 |
| API 契约         | OpenAPI schema diff + 生成客户端编译 | 防止客户端破坏             |
| 模型评测         | Python 固定数据集脚本                | 准确率、召回率、偏差和延迟 |

测试不追求空泛覆盖率。优先覆盖发布状态、版权过滤、识别纠错、分享撤销、删除、幂等和 AI 降级等高风险路径。

## 14. 可观测性选型

### 14.1 选择：OpenTelemetry

OpenTelemetry 是供应商中立的日志、指标和追踪标准，适合同时覆盖 Node.js 和 Python 服务。[OpenTelemetry 官方文档](https://opentelemetry.io/docs/)

首版实施：

- API 和 AI 的 HTTP 追踪。
- PostgreSQL、Redis 和外部对象存储调用耗时。
- `trace_id` 贯穿请求和后台任务。
- JSON 日志输出到云日志平台。
- 关键指标导出到云监控或 Prometheus 兼容后端。

JavaScript 的 trace 和 metrics 已标记为稳定，但日志能力仍在发展，因此首版日志继续使用结构化日志库，OpenTelemetry 负责追踪和指标。[OpenTelemetry JavaScript 状态](https://opentelemetry.io/docs/languages/js/)

### 14.2 错误跟踪

可选 Sentry 或部署地区可用的等价服务，用于 App 崩溃、Web 错误和版本关联。错误上报前必须清除用户图片、签名 URL、手机号和令牌。

## 15. 部署与基础设施选型

### 15.1 选择：Docker + 托管基础服务

- App：iOS/Android 原生包发布。
- Web/Admin/API/Worker/AI：独立 Docker 镜像。
- PostgreSQL、Redis、对象存储、CDN：优先托管服务。
- API 至少两个实例滚动发布。
- AI 服务根据 CPU/GPU 实际基准独立选择实例。

### 15.2 暂不选择 Kubernetes

首版服务数量少，托管容器服务或虚拟机编排已经足够。只有出现多模型 GPU 调度、多个团队独立服务、频繁弹性需求或托管平台限制时再引入 Kubernetes。

### 15.3 CI/CD

推荐流水线：

```text
lint / typecheck
→ unit tests
→ integration tests
→ OpenAPI diff
→ build images
→ dependency and image scan
→ deploy staging
→ smoke / E2E / model checks
→ manual approval
→ rolling production deploy
```

若 GitHub Actions 在部署网络中不稳定，可替换为国内云 CI；流水线步骤和制品标准不变。

### 15.4 基础设施即代码

MVP 至少将容器、环境变量清单、数据库扩展、备份策略和网络规则版本化。只有云资源数量和环境数量上升后再全面引入 Terraform，避免首版为了工具本身增加大量维护。

## 16. 安全技术选型

- TLS 1.2 以上。
- App 令牌使用系统安全存储。
- 密码场景使用 Argon2id，不自行设计哈希算法。
- 对象存储使用短时效签名 URL 和最小权限身份。
- 敏感配置使用云密钥管理或部署平台 Secret，不写入仓库。
- 后台高风险操作开启审计和二次确认。
- WAF、IP/账号限流和上传配额用于基础反滥用。
- 依赖、容器镜像和模型制品定期扫描。
- 数据库和对象存储开启静态加密与自动备份。

具体密码学参数、令牌生命周期和合规控制在上线前进行安全评审后确定。

## 17. 成本控制策略

### 17.1 初期主要成本

- 用户和碑帖图片存储及 CDN 流量。
- AI 推理 CPU/GPU。
- 短信登录。
- 内容切分、校对和版权管理的人力。

### 17.2 技术控制

- 图片在客户端适度压缩，原始档案与展示衍生图分层。
- 高频公开页使用 CDN 和应用缓存。
- 识别与结构分析模型分别基准测试，不默认所有请求走 GPU。
- 离线批处理使用可中断的低优先级 Worker。
- 不提前部署搜索集群、Kafka 和 Kubernetes。
- 记录每个模型版本的单位推理成本。

## 18. 备选方案与切换条件

| 当前选择            | 备选                  | 切换条件                                        |
| ------------------- | --------------------- | ----------------------------------------------- |
| React Native/Expo   | Flutter               | RN 无法达到核心绘制性能，或团队以 Flutter 为主  |
| NestJS/Node         | Go、Java/Spring       | 后端团队已有成熟栈，或实测吞吐/内存成为主要瓶颈 |
| PostgreSQL 精确检索 | pgvector              | 相似字形/风格推荐通过离线评测                   |
| PostgreSQL/pgvector | OpenSearch/专用向量库 | 数据和复杂查询超过单库可维护范围                |
| Redis/BullMQ        | RabbitMQ/Kafka        | 需要长期回放、多团队事件订阅或更强投递语义      |
| 服务端推理          | ONNX Runtime Mobile   | 成本、离线或隐私收益超过包体和设备适配成本      |
| 模块化单体          | 微服务                | 独立扩缩容、团队自治、故障隔离或合规需求明确    |
| 托管容器            | Kubernetes            | 多服务、多 GPU 池和弹性调度成为持续需求         |

## 19. ADR 摘要

### ADR-001：采用模块化单体

- 状态：接受。
- 原因：MVP 领域多但团队小，业务数据关系紧密。
- 后果：保持部署简单；必须通过模块接口防止代码耦合。

### ADR-002：AI 服务独立部署

- 状态：接受。
- 原因：Python/GPU 依赖与业务服务不同。
- 后果：增加一次内部网络调用；获得独立扩缩容和模型替换能力。

### ADR-003：移动端采用 React Native/Expo

- 状态：有条件接受。
- 条件：原型必须通过低端 Android 的图片和手势性能测试。
- 后果：共享 TypeScript 能力；需管理原生依赖和真机差异。

### ADR-004：公开 Web 采用 Next.js

- 状态：接受。
- 原因：公开单字页需要 SEO、缓存和分享元数据。
- 后果：需要明确服务端与客户端组件边界。

### ADR-005：PostgreSQL 是唯一业务事实库

- 状态：接受。
- 原因：内容、版权、练习和审核需要关系与事务。
- 后果：Redis、对象存储和向量索引都不能成为业务状态的唯一来源。

### ADR-006：首版不使用通用大模型直接评分

- 状态：接受。
- 原因：需要可解释、可复现和专业受控的建议。
- 后果：前期需要书法老师参与规则和评测集建设。

## 20. 原型阶段技术验证清单

在正式搭建完整工程前，用 2～4 周技术尖峰验证：

1. Expo App 完成拍照、相册、裁切、直传和弱网重试。
2. 在一台目标低端 Android 设备上流畅完成双图叠加、缩放和透明度调整。
3. 50～100 个种子字完成 PostgreSQL 精确检索和 Web 固定页面。
4. AI 服务对真实用户毛笔字返回 Top-3 候选和置信度。
5. 完成用户字与范字的基础重心、高宽比和外轮廓测量。
6. 端到端识别在 CPU 与 GPU 上分别进行延迟和成本基准。
7. 完成一条碑帖原图“上传—预切分—人工审核—发布—检索”的后台链路。
8. 演示范字下架后 App、Web、缓存和分享页的正确变化。

如果第 2 项失败，再决定是否引入 Skia 或评估 Flutter；如果第 4、5 项质量不足，应优先调整数据和模型，不扩大功能范围。

## 21. 首版实施顺序

### 里程碑 A：基础设施与内容闭环

- Monorepo、CI、PostgreSQL、Redis、对象存储。
- 书家、作品、字形、来源和审核模型。
- 管理后台上传、切分、审核、发布。
- Web 输入查字和公开单字页。

### 里程碑 B：移动识别闭环

- App 拍照、裁切和直传。
- AI 质量检测和候选字识别。
- 用户确认与名家同字结果。
- 范字详情、收藏和来源展示。

### 里程碑 C：练习闭环

- 并排与叠加对比。
- 结构测量与规则建议。
- 再练一次、历史记录和分享。
- 质量反馈、监控和降级。

### 里程碑 D：上线准备

- 权限、隐私、版权和删除流程测试。
- 性能、容量和安全检查。
- 数据库恢复与对象误删演练。
- App 真机兼容和发布流程。

## 22. 选型验收标准

- 技术栈覆盖 PRD 的 App、Web、后台和 AI 能力，无关键空白。
- 核心业务只需要一个主数据库和一个业务 API 部署单元。
- AI 可以独立升级、扩容和降级。
- App 能在目标低端设备通过相机、图片和叠加性能验证。
- 公开单字页能够生成服务端 HTML、元数据和分享图片。
- 所有客户端通过 OpenAPI 生成或校验接口类型。
- 精确查字不依赖向量数据库和独立搜索集群。
- 内容发布、下架、版权和审核有数据库强约束与测试。
- 生产依赖使用稳定版本并有 lockfile、镜像摘要和升级策略。
- 在首个版本中没有因预期未来需求引入 Kubernetes、Kafka 或完整微服务。

## 23. 参考资料

- [Node.js 官方发布与 LTS 计划](https://nodejs.org/en/about/previous-releases)
- [Expo SDK 官方版本矩阵](https://docs.expo.dev/versions/latest/)
- [Expo ImagePicker 官方文档](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Next.js App Router 官方文档](https://nextjs.org/docs/app)
- [Next.js Metadata 官方文档](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [NestJS 官方入门与 HTTP 平台说明](https://docs.nestjs.com/first-steps)
- [NestJS OpenAPI 官方文档](https://docs.nestjs.com/openapi/introduction)
- [NestJS 队列官方文档](https://docs.nestjs.com/techniques/queues)
- [FastAPI 官方教程](https://fastapi.tiangolo.com/tutorial/)
- [PostgreSQL 官方版本政策](https://www.postgresql.org/support/versioning/)
- [pgvector 官方项目](https://github.com/pgvector/pgvector)
- [PyTorch ONNX 官方文档](https://docs.pytorch.org/docs/stable/onnx.html)
- [ONNX Runtime 官方文档](https://onnxruntime.ai/docs/)
- [ONNX Runtime Mobile 官方文档](https://onnxruntime.ai/docs/get-started/with-mobile.html)
- [Redis Streams 官方文档](https://redis.io/docs/latest/develop/data-types/streams/)
- [OpenTelemetry 官方文档](https://opentelemetry.io/docs/)
