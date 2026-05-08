---
name: 04-subskill-block-composition-ratio-diversity
description: Section 4 Map-Reduce block S4.3。独立计算 composition、ratio、diversity 和解释性差异丰度，并执行块内局部自净。
type: reference
---

# Block S4.3 Composition Ratio Diversity

## Block ID

`S4B_COMPOSITION_RATIO_DIVERSITY`

## 输入

只读：

- `work/features/mapreduce/frozen_inputs/*`
- `work/features/feature_catalog.tsv`
- `work/features/data_based_feature_catalog.tsv`
- Section 3 handoff per-dataset h5ad
- `work/features/qc/qc_covariates.tsv`

不得重新做 metadata backfill，不得改写 Section 3 注释列。

## Feature 计算

必进 primary 方向：

- top-level fraction
- major fraction
- subtype fraction
- biological safe ratio
- diversity / entropy

Fraction：

- `comp__all__TopLevelCompartment__<group>`
- `comp__major__<Major_CellType>`
- `comp__subtype__<Cell_Subtype>`

必须覆盖：

- top-level：Immune、Stroma、Epithelial_or_cancer_cell、Non_cellular 等实际存在类别。
- major：所有实际出现且通过支持度的 `Major_CellType`。
- subtype：所有 Section 3 acceptance gate 通过的 `Cell_Subtype`。
- CAF context：CAF/Fibroblast 在 all cells、nonimmune、stroma 中比例。
- Immune reference：CD8/Treg/NK/Myeloid/DC/B/Plasma 等 fraction。
- Tumor reference：Cancer/Epithelial fraction。

Ratio：

必须从实际 composition 自动派生，不得只写少数手工 ratio。所有 ratio 使用：

```text
log2_safe_ratio = log2((numerator + 0.1) / (denominator + 0.1))
```

禁止直接 `frac_a / frac_b` 入模。

最低层级：

- `ratio__top__<numerator>_over_<denominator>`：top-level biological pairs。
- `ratio__major__<numerator>_over_<denominator>`：如 `Fibroblast_over_T_cell`、`Myeloid_over_T_cell`、`Cancer_cell_over_Immune`、`CD8_T_cell_over_Treg`、`CAF_over_CD8_T_cell`。
- `ratio__subtype__<numerator>_over_<denominator>`：如 `myoCAF_over_iCAF`、`apCAF_over_iCAF`、`Treg_over_Cytotoxic_CD8`、`Exhausted_CD8_over_Cytotoxic_CD8`、`Macrophage_over_Monocyte`。

denominator 缺失或支持不足时输出 NA 与 reason，不得用错误层级替代。

Diversity：

必须包括全局和 major 内部 subtype diversity：

- `div__all__top_level__shannon/simpson/evenness`
- `div__all__major__shannon/simpson/evenness`
- `div__all__subtype__shannon/simpson/evenness`
- `div__major__Fibroblast__subtype_shannon/simpson/evenness`
- `div__major__T_cell_or_TNK__subtype_shannon/simpson/evenness`
- `div__major__Myeloid__subtype_shannon/simpson/evenness`
- `div__major__B_lineage__subtype_shannon/simpson/evenness`
- `div__major__Tumor_or_Epithelial__subtype_shannon/simpson/evenness`

## 差异丰度

R/NR 差异丰度是 `response_derived`，不得进入 raw feature 漏斗。

算法优先级：

1. scCODA。
2. Milo。
3. `speckle::propeller`。
4. patient-level beta-binomial/quasibinomial GLM。
5. Wilcoxon + BH FDR fallback。

DA 统计量不得作为 raw predictor；composition fraction、safe ratio 和 diversity 这些 label-free 数值本身必须进入块内漏斗。

## 块内局部自净

Label-free gate：

- patient_key 与 patient_id 一致。
- patient-feature 无重复。
- pandas groupby 分类列使用 `observed=True` 或先转 string。
- 主分析缺失率、非缺失 patient 数、近零方差、单 dataset 信号。
- source cell 支持度。

Response-aware 宽口径筛选：

- 对通过 label-free gate 且 `feature_input_class=raw_biological_numeric` 的 feature 做 R vs NR Wilcoxon/logistic/rank test。
- 输出 p、BH FDR、effect size、direction、dataset direction consistency。
- `FDR < 0.25` 进入 `block_screened_candidates.tsv`。

Dynamic L1/L2：

- 若 `p <= 50`，跳过 ElasticNet，标记 `elasticnet_status=skipped_green_channel`。
- 若 `p > 50`，运行标准化 logistic ElasticNet，`alpha=0.5`，交叉验证 lambda，非零系数进入候选。
- ElasticNet 结果为 response-aware，必须标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。

## 输出

模块目录主输出：

- `work/features/composition/composition_summary.tsv`
- `work/features/composition/composition_summary.md`
- `work/features/composition/composition_manifest.tsv`
- `work/features/composition/composition_feature_matrix.tsv.gz`
- `work/features/composition/composition_feature_meta.tsv`
- `work/features/composition/composition_feature_qc.tsv`
- `work/features/composition/composition_gate_log.tsv`
- `work/features/composition/composition_response_screen.tsv`
- `work/features/composition/composition_candidate_features.tsv`
- `work/features/composition/composition_issue_list.tsv`

正式 substep 输出：

- `work/features/substeps/composition_features_sample.tsv`
- `work/features/substeps/composition_features_patient.tsv`
- `work/features/substeps/composition_ratio_features_patient.tsv`
- `work/features/substeps/composition_diversity_features_patient.tsv`
- `work/features/explanatory/composition_differential_abundance.tsv`
- `work/features/qc/composition_feature_support.tsv`

Block 输出：

- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_status.tsv`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_feature_matrix.tsv.gz`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_feature_meta.tsv`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_feature_qc.tsv`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_gate_log.tsv`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_response_screen.tsv`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_screened_candidates.tsv`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_run_manifest.tsv`
- `work/features/blocks/S4B_COMPOSITION_RATIO_DIVERSITY/block_issue_list.tsv`

完成后更新 `work/features/process/section4_process_index.tsv`。
