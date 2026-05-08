---
name: 04-subskill-block-tf-regulon
description: Section 4 Map-Reduce block S4.5。独立计算 TF/regulon activity、SCENIC 增强和 RSS/RSS-like specificity，并执行块内局部自净。
type: reference
---

# Block S4.5 TF Regulon Activity

## Block ID

`S4B_TF_REGULON`

## 输入

只读：

- `work/features/mapreduce/frozen_inputs/*`
- `work/features/feature_catalog.tsv`
- `work/features/data_based_feature_catalog.tsv`
- Section 3 handoff h5ad
- `assets/dataset/regulon/collectri_human.tsv`
- `assets/dataset/regulon/dorothea_human_abc.tsv`
- `assets/dataset/regulon/progeny_human_top500.tsv`
- pySCENIC cisTarget resources，若启用 SCENIC。

严禁把 TF mRNA 表达伪装成 `tf__` regulon activity。TF mRNA 只能作为 `pb__` 或状态表达特征，并必须标明不是 regulon activity。

## 算法优先级

1. `decoupler + DoRothEA/CollecTRI`：默认必选实现，适合 cell-level 或 patient × all/major/subtype pseudobulk。
2. `pySCENIC/SCENIC`：增强实现。固定使用 hg38 gene-based v10 clustered rankings 与 v10nr motif annotation，不得混用旧 mc9nr 或未记录 hash 的资源。
3. RSS / specificity：
   - 首选 SCENIC regulon AUC + calcRSS。
   - 若 SCENIC 未启用，可对 decoupler TF activity 计算 `tf_rss_like__...`，并在 QC 中明确不是 SCENIC RSS。

若 decoupler/DoRothEA/CollecTRI 与 SCENIC 均不可用，strict 模式必须停止：`blocked_required_module`。

## 层级输出

必须先输出所有通过 regulon overlap / target minimum 的 raw TF activity、SCENIC AUC、RSS/RSS-like specificity；这些 label-free 数值均为 `raw_biological_numeric` 并进入块内漏斗。不得只取全局 top30 后当作原始输出。

Feature id：

- `tf__all__<TF>`
- `tf__major__<Major_CellType>__<TF>`
- `tf__subtype__<Cell_Subtype>__<TF>`
- `tf_rss__major__<Major_CellType>__<TF>`
- `tf_rss__subtype__<Cell_Subtype>__<TF>`
- `tf_rss_like__major__<Major_CellType>__<TF>`
- `tf_rss_like__subtype__<Cell_Subtype>__<TF>`
- `scenic__all__<regulon>`
- `scenic__major__<Major_CellType>__<regulon>`
- `scenic__subtype__<Cell_Subtype>__<regulon>`

## 优先 TF

CAF/stroma：

- SMAD2/3/4、STAT3、RELA/NFKB1、JUN/FOS/AP1、TEAD/YAP、HIF1A、RUNX、SOX4。

T/NK：

- TBX21、EOMES、TOX、TCF7、FOXP3、BATF、PRDM1。

Myeloid/DC：

- IRF1、IRF4、IRF8、NFKB、STAT1、STAT6、CEBPB。

Tumor/Epithelial：

- MYC、E2F、TP53、HIF1A、STAT1/IRF1、SMAD、CTNNB1 proxy where supported。

## 块内局部自净

Label-free gate：

- regulon target overlap。
- TF activity score distribution。
- all/major/subtype 轴覆盖。
- patient-feature 唯一性。
- 缺失率、近零方差、非缺失 patient 和 dataset 数。
- 不得在入场前做人工等级分层；每个 cell state top stable TF 只能作为解释性标签或图表排序，全量通过 QC 的 regulon/TF activity 均进入漏斗。

Response-aware 粗筛：

- Wilcoxon/rank test，BH FDR。
- `FDR < 0.25` 进入候选。

Dynamic L1/L2：

- `p <= 50` 跳过 ElasticNet。
- `p > 50` 运行 logistic ElasticNet，`alpha=0.5`。
- response-aware selected feature 标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。

## 输出

模块目录主输出：

- `work/features/tf_regulon/tf_regulon_summary.tsv`
- `work/features/tf_regulon/tf_regulon_summary.md`
- `work/features/tf_regulon/tf_regulon_manifest.tsv`
- `work/features/tf_regulon/tf_regulon_feature_matrix.tsv.gz`
- `work/features/tf_regulon/tf_regulon_feature_meta.tsv`
- `work/features/tf_regulon/tf_regulon_feature_qc.tsv`
- `work/features/tf_regulon/tf_regulon_gate_log.tsv`
- `work/features/tf_regulon/tf_regulon_response_screen.tsv`
- `work/features/tf_regulon/tf_regulon_candidate_features.tsv`
- `work/features/tf_regulon/tf_regulon_issue_list.tsv`

正式 substep 输出：

- `work/features/substeps/tf_activity_features_patient.tsv`
- `work/features/substeps/tf_activity_features_raw_by_axis.tsv`
- `work/features/substeps/tf_rss_features_patient.tsv`
- `work/features/substeps/scenic_regulon_activity_features_patient.tsv` 若启用 SCENIC
- `work/features/qc/tf_activity_diagnostics.tsv`
- `work/features/qc/tf_axis_coverage_qc.tsv`

Block 输出：

- `work/features/blocks/S4B_TF_REGULON/block_status.tsv`
- `work/features/blocks/S4B_TF_REGULON/block_feature_matrix.tsv.gz`
- `work/features/blocks/S4B_TF_REGULON/block_feature_meta.tsv`
- `work/features/blocks/S4B_TF_REGULON/block_feature_qc.tsv`
- `work/features/blocks/S4B_TF_REGULON/block_gate_log.tsv`
- `work/features/blocks/S4B_TF_REGULON/block_response_screen.tsv`
- `work/features/blocks/S4B_TF_REGULON/block_screened_candidates.tsv`
- `work/features/blocks/S4B_TF_REGULON/block_run_manifest.tsv`
- `work/features/blocks/S4B_TF_REGULON/block_issue_list.tsv`

完成后更新 `work/features/process/section4_process_index.tsv`。
