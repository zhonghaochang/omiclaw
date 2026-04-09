---
name: 06-attribution
description: Section 6：归因与证据等级。基于 SHAP、消融和双变量分析评估 CAF 相关信号，并根据模型质量自动降级为 valid 或 weak_evidence。
type: reference
---

# Section 6：归因与证据等级

## 概述

| 项 | 说明 |
|---|---|
| 读入 | Section 5 的全模型、SHAP、LODO 与 sensitivity 结果 |
| 处理 | SHAP 排名 -> marginal ablation -> bivariate antagonism -> evidence grading |
| 输出 | `Fig_M4`、`Fig_M5`、`Fig_M6`、`Fig_M7`、排序表、evidence grade |

**前置依赖**：Section 5 完成

## 证据等级门禁

只有满足以下条件，才允许输出强归因结论：
- mean ROC-AUC `> 0.55`
- 有效 LODO fold `>= 3`
- `primary_feature_audit.tsv` 未记录 forbidden feature 入模
- SHAP top features 与 feature audit 一致

否则本阶段只能输出：

```text
evidence_grade = weak_evidence
```

在 `weak_evidence` 条件下：
- 不得使用“CAF 一票否决权”措辞
- 图注与 `analysis_summary.md` 必须改写为保守表述
- 允许保留诊断性图，但必须直说模型弱、队列异质性高或输入污染风险

## 多视角稳定性要求

单个特征只有在以下维度同时支持时，才能被报告为重要：
- 逻辑回归系数方向与量级
- held-out 测试集泛化
- SHAP 或树模型非线性确认
- 重采样下的秩稳定性

## Step 1：SHAP 排名

- 在全模型上计算 SHAP
- 先与 `primary_feature_audit.tsv` 交叉核对
- 任一 metadata / route / count-like 特征进入 top ranking，都视为建模失败，而不是归因成功

输出：
- `Fig_M4_SHAP_global_beeswarm`
- `Fig_M5_SHAP_CAF_beeswarm`
- `Table_M4_SHAP_global_ranking.tsv`
- `Table_M5_SHAP_CAF_ranking.tsv`

## Step 2：边际消融

所有消融模型都必须：
- 重新构建 design matrix
- 重新跑完整 LODO
- 输出独立 `fold_metrics.tsv` 与 `heldout_predictions.tsv`

推荐最少包括：
- `Drop-Fibro`
- `Drop-Fibro-myoCAF`
- `Drop-Fibro-iCAF`
- `Drop-Fibro-apCAF`
- `Drop-Immune`
- `Drop-Tcell`
- `Drop-NK`
- `Drop-Myeloid`

输出：
- `Fig_M6_ablation_barplot`

## Step 3：双变量分析

若且仅若 evidence gate 通过，才允许做强解释版本的双变量分析：
- X 轴：`Cytotoxic_score` / CD8 infiltration
- Y 轴：`myoCAF_score` / `myoCAF_to_CD8_score_ratio`
- 颜色：`Response` vs `Non-response`

若 evidence gate 未通过，仍可输出 `Fig_M7`，但图注必须标注为诊断性探索图。

## 强制作图

| 图名 | 说明 |
|---|---|
| `Fig_M4_SHAP_global_beeswarm` | 全局 SHAP beeswarm |
| `Fig_M5_SHAP_CAF_beeswarm` | CAF 特征 SHAP beeswarm |
| `Fig_M6_ablation_barplot` | 各消融模型的 AUC 对比 |
| `Fig_M7_bivariate_antagonism` | 双变量分析图；若为弱证据必须在图注中标注 |

每张图都必须同步交付：`pdf`、`png`、`*_source_data.tsv`、`*_caption.md`

## Deliverables

| 交付物 | 路径 |
|---|---|
| 全局 SHAP beeswarm | `work/figures/main/Fig_M4_SHAP_global_beeswarm.pdf` |
| CAF SHAP beeswarm | `work/figures/main/Fig_M5_SHAP_CAF_beeswarm.pdf` |
| 全局 SHAP 排名 | `work/modeling/{run_id}/Table_M4_SHAP_global_ranking.tsv` |
| CAF SHAP 排名 | `work/modeling/{run_id}/Table_M5_SHAP_CAF_ranking.tsv` |
| 边际消融图 | `work/figures/main/Fig_M6_ablation_barplot.pdf` |
| 双变量图 | `work/figures/main/Fig_M7_bivariate_antagonism.pdf` |
| 归因摘要 | `work/modeling/{run_id}/attribution_summary.tsv` |

## 完成检查

- [ ] SHAP 值已计算并通过 `primary_feature_audit.tsv` 一致性检查
- [ ] 所有消融模型已重建 design matrix 并重跑 LODO
- [ ] `evidence_grade` 已明确写成 `valid` 或 `weak_evidence`
- [ ] 若为 `weak_evidence`，图注和 summary 已降级为保守表述
- [ ] `Fig_M4`、`Fig_M5`、`Fig_M6`、`Fig_M7` 已生成
