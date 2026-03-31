---
name: 05-modeling
description: Section 5：反作弊门控与基线预测建模。基线子集化、反作弊拦截、LODO 逻辑回归、敏感性分析。
type: reference
---

# Section 5：反作弊门控与基线预测建模

## 概述

| 项 | 说明 |
|---|---|
| **读入** | Section 4 的 `fibro_features.tsv` + Section 1 的 `manifest.tsv` |
| **处理** | 基线子集化 → 反作弊拦截 → LODO 逻辑回归 → 敏感性分析 |
| **输出** | 基线模型性能报告（AUC 等）+ 全局 SHAP 蜂姿图 |

**前置依赖**：Section 4 完成

## 处理流程（严格拦截）

### 第1步：基线样本子集化（Subsetting）

通过 `manifest.tsv` 进行合并（Merge），**强制剔除所有 `include_main_analysis == False` 的行**。确保进入训练矩阵的样本 100% 为基线（PRE）。

### 第2步：反作弊拦截

1. **强制从模型输入特征中剔除宏观物理量**（正则匹配 `*cells*`、`tumor_frac`、`n_cells`、`fibro_count`、`*_count`）
2. **剔除**缺失率 > 50% 或全零/近零方差的特征
3. **保留元数据**：`dataset_id`、`cancer_type`、`cancer_context`、`treatment_group`、`platform`、`response_tier`、`annotation_method` 设为 Metadata，保留在表中用于分组和协变量校正，但**严禁**作为模型的预测特征

**禁止出现在 primary model 的 features_used / coefficients 中的列：**
- `dataset_id_*`、`cancer_context_*`、`cancer_type_*`、`platform_*`、`response_tier_*`、`annotation_method_*`
- `n_cells`、`fibro_count`、`total_cells`、`cells_post_qc`、`cell_count`、`total_counts`

### 第3步：建模覆盖率核对（mandatory）

建模前必须生成 `modeling_coverage_report.tsv`：

| 列 | 含义 |
|---|---|
| `dataset_id` | 数据集 |
| `manifest_patients` | manifest 中主分析病人数 |
| `patient_feature_rows` | 特征表中病人数 |
| `modeled_rows` | 实际进入模型的病人数 |
| `status` | ok / ERROR |

强制规则：
- 总 `modeled_rows` < 主 manifest 的 90% → ERROR
- 任一主数据集损失 > 20% → ERROR
- 任一主数据集 `modeled_rows = 0` → ERROR

### 第4步：建模——带惩罚项的逻辑回归

- 默认用 L2 惩罚（岭回归）
- R:NR 比例超过 2:1 时使用 `class_weight="balanced"`
- 特征板很大且高度相关时用弹性网络

**参考实现骨架（见 `fibro_primary_model_guardrails.py`）：**

```python
model = Pipeline(steps=[
    ("imp", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(
        penalty="l2", solver="liblinear", max_iter=4000,
        class_weight="balanced", random_state=42,
    )),
])
```

### 第5步：辅助验证——树模型

- 随机森林或梯度提升树作为验证
- 用于检测非线性信号和交互效应
- 不用树模型结果替代逻辑回归结果

## 验证策略

### 外部验证：留一数据集验证（LODO）

```text
对 {EGAS_Cohort1, GSE236581, GSE269936, GSE123813} 中的每个数据集 D：
    在除 D 之外的所有数据集上训练
    在 D 上测试
    记录 AUC、precision-recall AUC
报告各 fold 的均值和标准差
```

### LODO 有效性检查

| 检查项 | 规则 |
|---|---|
| 最低 fold 数 | 至少 3 个有效 fold |
| AUC 阈值标注 | fold ROC-AUC ≤ 0.55 → 标注 `validity = near_random` 并解释 |
| 排除 fold 报告 | 排除的数据集必须写明原因 |
| Tier 2 敏感性 | 必须额外报告排除 `tier2_surrogate` 队列后的结果 |
| 置信度估计 | LODO fold ≤ 5 时，必须补充 bootstrap CI（1000 次）或 permutation test |
| 禁止学习元特征 | features_used 中不得出现 dataset_id_*、n_cells 等 |

### 敏感性分析（最低要求）

1. 每次去除一个数据集重新训练
2. 删除缺失率 > 20% 的特征
3. 成纤维细胞专属模型 vs 免疫专属模型 vs 全模型
4. 完全排除 `response_tier = tier2_surrogate` 队列后重新训练
5. `annotation_method` 敏感性：仅 `original_metadata` 队列 vs 全部队列
6. 样本量加权：对严重不平衡的数据集，报告移除后是否稳定

每个 scenario 必须**重建 design matrix 并重新跑 LODO**，落地 `sensitivity/<scenario>__fold_metrics.tsv` 与 `sensitivity/<scenario>__heldout_predictions.tsv`。

## Deliverables（交付物清单）

| 交付物 | 路径 |
|---|---|
| primary_feature_audit.tsv | `work/modeling/{run_id}/primary_feature_audit.tsv` |
| modeling_coverage_report.tsv | `work/modeling/{run_id}/modeling_coverage_report.tsv` |
| features_used.tsv | `work/modeling/{run_id}/features_used.tsv` |
| fold_metrics.tsv | `work/modeling/{run_id}/fold_metrics.tsv` |
| heldout_predictions.tsv | `work/modeling/{run_id}/heldout_predictions.tsv` |
| coefficients.tsv | `work/modeling/{run_id}/coefficients.tsv` |
| shap_values.tsv.gz | `work/modeling/{run_id}/shap_values.tsv.gz` |
| sensitivity 明细 | `work/modeling/{run_id}/sensitivity/*__fold_metrics.tsv` |
| 全局 SHAP 蜂姿图 | `work/figures/main/Fig_M4_SHAP_beeswarm.pdf` |

### 完成检查

- [ ] primary_feature_audit.tsv 无 forbidden_primary_feature
- [ ] modeling_coverage_report.tsv 无 ERROR
- [ ] features_used.tsv 与 primary_feature_audit.tsv 一致
- [ ] LODO fold_metrics.tsv 已输出，near_random fold 已标注
- [ ] 每个 sensitivity scenario 有独立的 fold_metrics + heldout_predictions
- [ ] 全局 SHAP 图已生成

**完成后可暂停并回复用户，提示进入 Section 6。**
