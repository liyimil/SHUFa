# AI 推理服务

AI 服务保持独立 Python 运行环境，当前提供健康检查、图片质量检测、确定性单字裁切，以及可复现的基础结构测量。

结构链路使用 `glyph-normalization-v1` 将输入按原宽高比放入 512×512 白底画布，只返回变换参数，不覆盖或生成原图副本；`structure-measurement-v2` 输出外框、高宽比、重心、四象限空间分布、置信度与异常状态。比较结果固定携带归一化、测量、规则和模型版本，低置信度时停止给出动作建议。由于尚无经书法专家验证的字符规则，部件比例和主方向明确返回 `UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE`，不生成伪专业结论。

这些输出只描述可复核的几何现象，不承担艺术水平评判；手写单字 Top-K 识别仍需真实模型和固定评测集。

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
.venv\Scripts\python -m uvicorn calligraphy_ai.main:app --reload --port 8000
```
