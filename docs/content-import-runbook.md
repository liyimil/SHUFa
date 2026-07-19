# 单字内容批量导入操作手册

## 适用范围

本流程用于把已经完成来源登记、权利记录和原帖上传的单字框批量送入裁切与审核链路。批量导入不会发布内容，也不能绕过双人审核。

## 操作步骤

1. 使用 `EDITOR` 账号登录内容后台。
2. 在“模板、预检与逐行报告”区域下载最新 CSV 模板。
3. 从同一区域复制不可变的 `source_asset_id`，按原帖像素填写单字框。
4. 上传 CSV 并选择“只预检，不导入”。
5. 查看每行报告。只要存在错误行，整个批次保持 `INVALID`，内容表不会写入任何单字。
6. 修正本地 CSV 后重新预检。原批次作为审计记录保留，不直接修改。
7. 批次状态为 `READY` 时选择“原子提交整批”。所有单字会以 `PROCESSING` 状态一次性写入，并提交幂等裁切任务。
8. 裁切完成后，由不同账号按照现有流程审核；只有权利、图片和审核均合格的单字才能发布。

## 字段约束

- `source_asset_id`：后台显示的 UUID，不使用作品名或页码代替。
- `observed_character`：原帖实际字形，一个汉字。
- `canonical_character`：最终规范字，一个汉字。
- `character_candidates`：可选，使用逗号、顿号或空格分隔，最多十个。
- `variant_type`：原帖字与规范字不同时必填；允许 `SIMPLIFIED`、`TRADITIONAL`、`HISTORICAL`、`COMPATIBILITY`。
- `transcription`：可选释文；包含逗号、换行或引号时应使用标准 CSV 双引号转义。
- `authenticity_grade`：仅允许 `A_ORIGINAL`、`B_RUBBING_OR_AUTHORIZED_EDITION`、`C_MODERN_COPY`。AI 生成内容禁止导入名家字库。
- `bbox_x`、`bbox_y`、`bbox_width`、`bbox_height`：原帖像素整数坐标，宽高必须大于零且不能越界。
- `image_quality`、`beginner_weight`：0～100 的整数。

## 失败与恢复

- 预检失败：修正 CSV 后新建预检批次，不会污染现有内容。
- 提交时来源被停用、坐标被占用或原帖发生冲突：事务零写入；重新预检后再提交。
- 数据库提交成功但队列暂时不可用：再次点击同一批次提交会按固定单字任务 ID 重试尚处于 `PROCESSING` 的裁切任务，不重复创建内容。
- 已提交内容仍可通过现有驳回、下架和内容历史流程处理。
