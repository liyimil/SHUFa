# 本地基础设施

`compose.yaml` 定义 PostgreSQL、Redis 和 S3 兼容对象存储，仅用于本地开发。

```powershell
Copy-Item .env.example .env
docker compose up -d
pnpm --filter @calligraphy/api db:generate
pnpm --filter @calligraphy/api db:migrate -- --name init_catalog
pnpm --filter @calligraphy/api db:seed
```

当前工作机没有安装 Docker，因此容器启动与真实迁移必须在具备 Docker 的环境中再次验证。Prisma schema 的语法验证和客户端生成不依赖正在运行的数据库。

对象存储的 `latest` 镜像只用于本地开发；确定生产供应商后必须使用受支持、可审计的固定版本或托管服务。

## 生产镜像

`infrastructure/docker` 包含 API、Worker、AI、公开 Web 和管理后台的多阶段镜像。Web 与后台的 API 地址在构建时写入：

```powershell
docker build -f infrastructure/docker/Dockerfile.api -t calligraphy-api:local .
docker build -f infrastructure/docker/Dockerfile.worker -t calligraphy-worker:local .
docker build -f infrastructure/docker/Dockerfile.ai -t calligraphy-ai:local .
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 -f infrastructure/docker/Dockerfile.web -t calligraphy-web:local .
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 -f infrastructure/docker/Dockerfile.admin -t calligraphy-admin:local .
```

当前机器未安装 Docker，所以 Node 生产构建、standalone 输出和 deploy 目录已验证，镜像本身仍须在 CI 或具备 Docker 的机器构建后才能标记完成。

生产迁移、备份、回滚和上线门禁见 `infrastructure/OPERATIONS.md`。
