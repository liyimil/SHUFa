# Python 依赖与类型基线

> 基线日期：2026-07-22
>
> 运行时：Python 3.12
>
> 锁工具：uv 0.11.31
>
> 类型检查：mypy 2.3 strict

## 权威文件

- `apps/ai-service/pyproject.toml` 定义直接依赖、Python 范围和检查器配置。
- `apps/ai-service/uv.lock` 固定完整的生产及开发依赖解析。
- `.github/workflows/ci.yml` 使用 `uv sync --locked --extra dev`，锁文件过期时直接失败。
- `infrastructure/docker/Dockerfile.ai` 使用相同 uv 版本和锁文件，以 locked 模式构建生产环境；不安装 `dev` extra。

不要手工编辑 `uv.lock`，也不要把本地 `.venv` 当作可复现证据。修改直接依赖后，在 Python 3.12 环境中运行：

```powershell
Set-Location apps/ai-service
uv lock
uv sync --locked --extra dev
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
```

## 静态类型边界

`mypy` 对 `src` 与 `tests` 启用 strict，并额外检查不可达代码。本次首次接入发现并修复了两个真实边界：

- Pillow 的全局最大像素配置类型允许 `None`，业务比较改用明确的整数常量。
- 算法、规则、模型和归一化版本常量显式声明为对应 `Literal`，避免普通字符串绕过响应 Schema 的固定版本约束。

不使用 `ignore_missing_imports`、全局 `disable_error_code` 或无界 `Any` 来换取绿灯。第三方缺失类型若将来出现，应先缩小到具体模块并记录运行时验证证据。

## 当前验证结果

```text
uv lock --check       通过，39 个包的解析与锁文件一致
uv run ruff format --check .  11 files already formatted
uv run ruff check .   All checks passed!
uv run mypy           Success: no issues found in 11 source files
uv run pytest         12 passed
production export     不含 mypy/pytest/Ruff/httpx，包含全部 7 个直接运行时依赖
```

当前机器没有 Docker；AI 镜像已由 [GitHub Actions run 29900054074](https://github.com/liyimil/SHUFa/actions/runs/29900054074) 的 Linux 镜像矩阵实际构建通过。本地 locked 同步和该构建结果仍不能替代 PostgreSQL/Redis/S3 跨服务运行验收。
