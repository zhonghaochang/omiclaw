---
name: 04-feature-engineering
description: Section 4：特征工程与聚合。在各数据集未整合矩阵上独立计算四层特征，执行严格 metadata backfill 审计，并拆分主分析与机制分析患者级特征表。
type: reference
---

# Section 4：特征工程与聚合

## 概述

| 项 | 说明 |
|---|---|
| 读入 | Section 3 输出的带标签 `.h5ad`、Section 1 的 manifest、特征表 `characters.xlsx` |
| 处理 | manifest metadata backfill -> per-dataset score/frac/ratio -> sample-level -> patient-level -> main/mechanism 拆表 |
| 输出 | `fibro_features.tsv`、`fibro_features_mechanism.tsv`、QC/gate/backfill 审计 |

**前置依赖**：Section 3 完成

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
- `Cell_Subtype` 确定后，先回写到原始对象，再开始特征工程
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
| `fibro_features.tsv` | 主分析 patient-level 特征表 |
| `fibro_features_mechanism.tsv` | 机制分析 patient-level 特征表 |
| `fibro_feature_meta.tsv` | 特征名、层次、定义、来源程序 |
| `fibro_feature_qc.tsv` | 每个特征的缺失率、值域、门控状态 |
| `feature_gate_log.tsv` | 每个被门控/警告的特征及原因 |
| `feature_metadata_backfill_audit.tsv` | manifest 回填覆盖率与异常审计 |

## Deliverables

| 交付物 | 路径 |
|---|---|
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
- [ ] ratio 特征使用 score + 0.1 平滑公式
- [ ] 主分析 patient 行 metadata backfill 覆盖率为 100%
- [ ] `fibro_features.tsv` 行数与 `manifest.tsv` unique patient 数完全一致
- [ ] `fibro_features_mechanism.tsv` 只包含机制 patient-level 行
- [ ] `sample_id_main` 未作为正式主路径使用
- [ ] `Fig_S5` 与 `Fig_S5b` 已生成
