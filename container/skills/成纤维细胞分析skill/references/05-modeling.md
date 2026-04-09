---
name: 05-modeling
description: Section 5：主模型与 guardrail。基于 canonical main manifest 构建设计矩阵，执行严格 coverage 对账、primary feature audit、LODO 与敏感性分析。
type: reference
---

# Section 5：主模型与 guardrail

## 概述

| 项 | 说明 |
|---|---|
| 读入 | Section 4 的 `fibro_features.tsv` + Section 1 的 `manifest.tsv` |
| 处理 | canonical main manifest inner join -> primary feature audit -> strict coverage reconciliation -> LODO -> sensitivity |
| 输出 | `design_matrix.tsv.gz`、`primary_feature_audit.tsv`、`modeling_coverage_report.tsv`、LODO 与敏感性结果 |

**前置依赖**：Section 4 完成

## 严格主分析合同

建模前必须同时满足：
- 主分析全部来自 `manifest.tsv`
- 主分析全部是 `analysis_unit = patient`
- `fibro_features.tsv` unique patient 数 = `manifest.tsv` unique patient 数
- `design_matrix.tsv.gz` unique patient 数 = `manifest.tsv` unique patient 数

任何一个不等于，都必须直接失败。

## Primary model 的禁止列

以下列只能作为 metadata / provenance，不得进入 `features_used.tsv`、`coefficients.tsv`、`shap_values.tsv.gz`：

- `include_main_analysis`
- `include_mechanism_analysis`
- `analysis_unit`
- `sample_id`
- `lesion_id`
- `source_analysis_unit`
- `source_sample_id`
- `source_lesion_id`
- `dataset_id`
- `cancer_context`
- `cancer_type`
- `platform`
- `response_tier`
- `annotation_method`
- `sample_id_main`
- 任意 `*_x` / `*_y`
- 任意 count-like 技术代理：`n_cells`、`fibro_count`、`total_cells`、`cells_post_qc`、`total_counts`

## 处理流程

### 第 1 步：基于 canonical main manifest 子集化

- 通过 `manifest.tsv` 的 `include_main_analysis = True` 子集化
- 只保留 `response_binary` 为 `Response/Non-response` 的 patient-level 行
- 若 `analysis_unit != patient`，直接报错

### 第 2 步：Primary feature audit

- 生成 `primary_feature_audit.tsv`
- 逐列记录：
  - `feature_name`
  - `include_in_primary`
  - `reason`
- 只要有 forbidden feature 被标记 `include_in_primary = True`，立即 `ERROR: forbidden_primary_feature`

### 第 3 步：Coverage 对账

必须输出 `modeling_coverage_report.tsv`：

| 列 | 含义 |
|---|---|
| `dataset_id` | 数据集 |
| `manifest_patients` | 主 manifest 病人数 |
| `patient_feature_rows` | `fibro_features.tsv` 病人数 |
| `modeled_rows` | 实际进入设计矩阵的病人数 |
| `status` | `ok` / `ERROR` |

正式规则不是 `>= 90%`，而是**严格等量覆盖**：
- `patient_feature_rows != manifest_patients` -> ERROR
- `modeled_rows != manifest_patients` -> ERROR
- 任一主数据集 `modeled_rows = 0` -> ERROR

### 第 4 步：逻辑回归主模型

默认骨架：

```python
model = Pipeline(steps=[
    ("imp", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(
        penalty="l2",
        solver="liblinear",
        max_iter=4000,
        class_weight="balanced",
        random_state=42,
    )),
])
```

### 第 5 步：LODO 与敏感性分析

- LODO 至少要有 3 个有效 fold
- fold AUC `<= 0.55` 必须标记 `near_random`
- 每个 sensitivity / ablation scenario 都必须：
  - 重建 design matrix
  - 重跑完整 LODO
  - 输出独立 `fold_metrics.tsv`
  - 输出独立 `heldout_predictions.tsv`

## 若出现以下情况必须立即失败

- `sample_id_main` 出现在设计矩阵
- 存在 `*_x` / `*_y` merge artifact 列
- route flag 真假混杂
- modeled cohort 相比 manifest 收缩
- `features_used.tsv` 与 `primary_feature_audit.tsv` 不一致

## 强制作图

| 图名 | 目的 |
|---|---|
| `Fig_M1_LODO_fold_performance` | 每个 held-out cohort 的 AUC / PR-AUC 表现 |
| `Fig_M2_heldout_prediction_strip_or_calibration` | held-out 预测概率、校准或 strip plot |
| `Fig_M3_primary_feature_audit_summary` | forbidden / metadata / kept biological features 的构成摘要 |

每张图都必须同步交付：`pdf`、`png`、`*_source_data.tsv`、`*_caption.md`

## Deliverables

| 交付物 | 路径 |
|---|---|
| design matrix | `work/modeling/{run_id}/design_matrix.tsv.gz` |
| primary feature audit | `work/modeling/{run_id}/primary_feature_audit.tsv` |
| coverage report | `work/modeling/{run_id}/modeling_coverage_report.tsv` |
| features used | `work/modeling/{run_id}/features_used.tsv` |
| fold metrics | `work/modeling/{run_id}/fold_metrics.tsv` |
| heldout predictions | `work/modeling/{run_id}/heldout_predictions.tsv` |
| coefficients | `work/modeling/{run_id}/coefficients.tsv` |
| shap values | `work/modeling/{run_id}/shap_values.tsv.gz` |
| sensitivity 明细 | `work/modeling/{run_id}/sensitivity/*__fold_metrics.tsv` |
| Section 5 图包 | `work/figures/main/Fig_M1*`, `Fig_M2*`, `Fig_M3*` |

## 完成检查

- [ ] `primary_feature_audit.tsv` 无 forbidden feature
- [ ] `modeling_coverage_report.tsv` 无 ERROR
- [ ] `fibro_features.tsv`、`design_matrix.tsv.gz` 与主 manifest 行数完全一致
- [ ] `features_used.tsv` 与 `primary_feature_audit.tsv` 一致
- [ ] `fold_metrics.tsv` 已输出，near-random fold 已标注
- [ ] 每个 sensitivity scenario 有独立 `fold_metrics + heldout_predictions`
- [ ] `Fig_M1`、`Fig_M2`、`Fig_M3` 已生成
