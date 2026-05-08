---
name: 04-feature-engineering
description: Section 4：特征工程与聚合。在各数据集未整合矩阵上独立计算四层特征，执行严格 metadata backfill 审计，并拆分主分析与机制分析患者级特征表。
type: reference
---

# Section 4：特征工程与聚合

## 概述

| 项 | 说明 |
|---|---|
| 读入 | 优先读取 Section 3 导出的 `work/section4_input/*.h5ad` 与 handoff manifest/schema；仅在其缺失时回退到 legacy `work/annotation/*.section3_annotated.h5ad` |
| 处理 | manifest metadata backfill -> per-dataset score/frac/ratio -> sample-level -> patient-level -> main/mechanism 拆表 |
| 输出 | `fibro_features.tsv`、`fibro_features_mechanism.tsv`、QC/gate/backfill 审计 |

**前置依赖**：Section 3 完成

## Section 3 -> Section 4 正式 handoff

### 正式主入口

Section 4 的正式输入优先级必须为：

1. `work/section4_input/merged.section3_for_section4.h5ad`
2. `work/section4_input/per_dataset/<dataset>.section3_for_section4.h5ad`
3. `work/section4_input/section4_h5ad_export_manifest.tsv`
4. `work/section4_input/section4_obs_schema.tsv`
5. `work/section4_input/section4_feature_eligibility.tsv`

这些文件一旦存在，就构成 Section 4 的正式 handoff contract。

### legacy 回退路径

若 `work/section4_input/` 不存在或缺关键文件，允许回退到：

- `work/annotation/merged.section3_annotated.h5ad`
- `work/annotation/per_dataset/<dataset>.section3_annotated.h5ad`

但必须同时满足：

- 写出 `legacy_section3_input_route = True`
- 写出 `section4_input_fallback_audit.tsv`
- 在最终 QC 中保留 warning，而不是 clean pass

### handoff 读取规则

- `per_dataset/*.section3_for_section4.h5ad` 是正式特征计算入口
- `merged.section3_for_section4.h5ad` 主要用于全局审计、schema 检查、跨数据集一致性检查
- `section4_h5ad_export_manifest.tsv` 必须记录每个输入 h5ad 的路径、来源、n_obs、n_vars、主要 layer、sha256 或等价摘要
- `section4_obs_schema.tsv` 是正式 obs schema 合同
- `section4_feature_eligibility.tsv` 是正式细胞纳入/排除合同

### Section 4 必须验证的 obs 列

正式 handoff 至少必须具备以下 obs 列：

- `cell_id`
- `dataset_id`
- `source_sample_id`
- `source_lesion_id`
- `patient_id`
- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Raw_Label_Primary`
- `Primary_Cell_Annotation`
- `Primary_Cell_Annotation_Level`
- `section3_major_cluster_id`
- `section4_subtype_cluster_id`
- `Annotation_Method`
- `annotation_confidence`
- `discard_flag`
- `exclude_from_feature_engineering`

若缺失以上任一关键列，必须直接失败，除非 `section4_obs_schema.tsv` 明确允许并给出替代来源。

### Section 4 必须验证的 handoff 语义

- `TopLevel_Compartment / Major_CellType / Cell_Subtype / Raw_Label_Primary` 必须作为同一细胞的四层注释视图同时存在
- `Primary_Cell_Annotation` 必须等于 `Cell_Subtype`
- `Primary_Cell_Annotation_Level` 必须固定为 `subtype`
- Section 4 若只消费单一注释列，默认只能使用 `Primary_Cell_Annotation`
- `discard_flag=True` 的细胞不得被物理删除，但默认不得进入正式特征计算
- `exclude_from_feature_engineering=True` 的细胞不得进入正式特征计算
- 只有 `section4_feature_eligibility.tsv` 判定为可用的细胞，才可参与最终特征汇总
- 若 `section4_feature_eligibility.tsv` 与 `.h5ad obs` 中的 `discard_flag / exclude_from_feature_engineering` 冲突，必须直接失败
- Section 4 不得修改 `TopLevel_Compartment / Major_CellType / Cell_Subtype / Raw_Label_Primary`；只能消费 Section 3 的最终输出
- 若发现注释科学性问题，只能写 QC / blocked diagnostics，不得在 Section 4 内部自行重命名细胞类型

### 表达矩阵与 layer 要求

- 正式特征计算必须基于各数据集未整合对象
- 必须保留用于 `score_genes` 和组成特征计算的表达矩阵
- 若 Section 3 handoff 同时保留 `X`、`raw`、或命名 layer，Section 4 必须在 `section4_h5ad_export_manifest.tsv` 中明确采用哪一层作为正式输入
- 若无法确认正式表达层，必须直接失败，不能猜测

## 本阶段要吸收的两个关键经验

### 经验 1：metadata backfill 可以保留，但必须升级

允许从 manifest 回填以下字段：
- `response_binary`
- `response_tier`
- `annotation_method`
- `cancer_context`
- `cancer_type`
- `subtype_unified`
- `treatment_state`

但正式规则是：
- 回填后必须输出 `feature_metadata_backfill_audit.tsv`
- 主分析 patient 行这些字段的覆盖率必须 100%
- 不能用空字符串占位后继续建模

### 经验 2：`sample_id_main` 不再是正式主路径

- 正式路径：直接读取 Section 1 已确定的 `source_sample_id/source_lesion_id`
- legacy repair 允许存在，但必须显式写成 `legacy_route_merge_repair = True`
- 如果 `sample_id_main`、`*_x`、`*_y` 流入设计矩阵，后续必须直接失败

## 特征组装强制规则

- 所有 `score_genes`、frac、score、ratio 都必须在各数据集未整合的原始/归一化矩阵上独立计算
- `Cell_Subtype` 必须来自 Section 3 最终 handoff，不得在 Section 4 内重新改写
- 默认 grouping key 必须是 `Primary_Cell_Annotation`，其值必须等于 `Cell_Subtype`
- ratio 特征统一使用 `(score + 0.1) / (score + 0.1)` 平滑公式
- route/provenance 字段只允许保留在 metadata/provenance 表，不得进入候选特征

## 产物拆分规则

### 主分析特征表

`work/features/fibro_features.tsv`

- 只保留 `include_main_analysis = True` 的 patient-level 行
- 行数必须等于 `manifest.tsv` 的 unique patient 数
- 每个主数据集的 patient 数必须与 manifest 完全一致

### 机制分析特征表

`work/features/fibro_features_mechanism.tsv`

- 只保留 `include_mechanism_analysis = True` 的 patient-level 行
- 允许与主分析特征集合不同，但必须保持 patient-level

## 四层特征体系

### 第一层：组成特征

- `fibro_frac_all`
- `fibro_frac_nonimmune`
- `fibro_subtype_frac_{x}`
- `fibro_diversity`
- `fibro_immune_ratio`
- `mycaf_frac` / `icaf_frac` / `apcaf_frac`
- `nkcyto_frac` / `nkrest_frac`

### 第二层：状态与程序特征

- `myoCAF_score`
- `iCAF_score`
- `apCAF_score`
- `NKcyto_score`
- `NKrest_score`
- `Treg_suppressive_score`
- `CD4_helper_score`
- `Cytotoxic_score`
- `Exhausted_score`
- `M1_like_score`
- `M2_like_score`
- `Mast_activation_score`

### 第三层：互作特征

- `fibro_exhaustedT_cooccurrence`
- `fibro_treg_interaction`
- `fibro_m2_interaction`
- `fibro_nkcyto_antagonism`
- `icaf_mregDC_interaction`
- `apcaf_cd4_treg_axis`

### 第四层：参考舱室特征

- `cd8_frac`
- `tcf7_cd8_frac`
- `exhausted_cd8_frac`
- `mregDC_frac`
- `cDC1_frac`
- `cDC2_frac`
- `mast_frac`
- `Bcell_frac`
- `plasma_frac`

## 聚合规则

1. 基因集打分在归一化表达矩阵上计算
2. 细胞级评分先聚合到样本级
3. 样本级再聚合到病人级
4. 主分析病人如有多个可用基线样本，只能保留 manifest 指定的 `source_sample_id` 或 `source_lesion_id`
5. 所有关键 ratio 使用统一平滑公式

## Feature gate（mandatory）

| 条件 | 动作 | 标记 |
|---|---|---|
| 方差 < `1e-10` | 移除 | `GATE: zero_variance` |
| 缺失率 > `50%` | 移除 | `GATE: high_missing_gt50pct` |
| 所有非零值来自单一数据集 | 移除 | `GATE: single_dataset_signal` |
| 与另一特征 `r > 0.99` | 保留其一 | `GATE: near_duplicate` |
| ratio 由 frac 直接相除 | 移除 | `GATE: frac_ratio_forbidden` |

## 通讯分析处理规则

- 正式通讯分析必须来自真实工具
- 若未运行真实工具，只允许输出 blocked diagnostics
- `communication_matrix_diagnostics.tsv` 必须显式写明：
  - `status`
  - `block_reason`
  - `required_tool`
  - `tool_run`

## 参考实现骨架

```python
def safe_score_ratio(num, den, pseudocount=0.1):
    return (num.astype(float) + pseudocount) / (den.astype(float) + pseudocount)


def assert_backfill_coverage(backfill_audit_df):
    main_rows = backfill_audit_df.loc[backfill_audit_df["include_main_analysis"].fillna(False)]
    bad = main_rows.loc[main_rows["coverage_fraction"] < 1.0]
    if not bad.empty:
        raise RuntimeError("ERROR: incomplete_manifest_backfill")
```

## 强制作图

| 图名 | 目的 |
|---|---|
| `Fig_S5_feature_missingness_and_gate` | 展示特征缺失率与 gate 结果 |
| `Fig_S5b_feature_class_distribution` | 展示四层特征的类别构成与保留情况 |

每张图都必须同步交付：`pdf`、`png`、`*_source_data.tsv`、`*_caption.md`

## 输出表格

| 文件名 | 内容 |
|---|---|
| `section4_input_fallback_audit.tsv` | 若走 legacy 回退路径，记录触发原因、缺失文件、回退对象与 warning |
| `fibro_features.tsv` | 主分析 patient-level 特征表 |
| `fibro_features_mechanism.tsv` | 机制分析 patient-level 特征表 |
| `fibro_feature_meta.tsv` | 特征名、层次、定义、来源程序 |
| `fibro_feature_qc.tsv` | 每个特征的缺失率、值域、门控状态 |
| `feature_gate_log.tsv` | 每个被门控/警告的特征及原因 |
| `feature_metadata_backfill_audit.tsv` | manifest 回填覆盖率与异常审计 |

## Deliverables

| 交付物 | 路径 |
|---|---|
| handoff 回退审计 | `work/features/section4_input_fallback_audit.tsv` |
| 主分析患者级特征表 | `work/features/fibro_features.tsv` |
| 机制分析患者级特征表 | `work/features/fibro_features_mechanism.tsv` |
| 特征元数据 | `work/features/fibro_feature_meta.tsv` |
| 特征 QC | `work/features/fibro_feature_qc.tsv` |
| 门控日志 | `work/features/feature_gate_log.tsv` |
| backfill 审计 | `work/features/feature_metadata_backfill_audit.tsv` |
| 通讯诊断 | `work/communication/communication_matrix_diagnostics.tsv` |
| Section 4 图包 | `work/figures/supplementary/Fig_S5*` |

## 完成检查

- [ ] 所有特征在各数据集原始矩阵上独立计算
- [ ] 已优先读取 `work/section4_input/*.section3_for_section4.h5ad`
- [ ] `section4_h5ad_export_manifest.tsv`、`section4_obs_schema.tsv`、`section4_feature_eligibility.tsv` 已通过一致性校验
- [ ] 未在 Section 4 内改写 `Major_CellType / Cell_Subtype`
- [ ] `discard_flag` 与 `exclude_from_feature_engineering` 已被严格执行
- [ ] ratio 特征使用 score + 0.1 平滑公式
- [ ] 主分析 patient 行 metadata backfill 覆盖率为 100%
- [ ] `fibro_features.tsv` 行数与 `manifest.tsv` unique patient 数完全一致
- [ ] `fibro_features_mechanism.tsv` 只包含机制 patient-level 行
- [ ] `sample_id_main` 未作为正式主路径使用
- [ ] 若走 legacy handoff 回退路径，已输出 `section4_input_fallback_audit.tsv` 且最终 QC 为 warning
- [ ] `Fig_S5` 与 `Fig_S5b` 已生成
