---
name: 04-subskill-block-state-multiomics
description: Section 4 Map-Reduce block S4.9-S4.10。整合已完成 block 输出形成 tumor/immune/CAF state，并读取真实外部 multiomics 表。
type: reference
---

# Block S4.9 S4.10 State And Multiomics

## Block ID

`S4B_STATE_MULTIOMICS`

## 依赖

本 block 不重复计算基础特征。它从已完成 block 中抽取 component 并组织三类核心状态视图：

- `S4B_COMPOSITION_RATIO_DIVERSITY`
- `S4B_PATHWAY_PROGRAM`
- `S4B_TF_REGULON`
- `S4B_CELL_COMMUNICATION`
- `S4B_PSEUDOBULK_HVG_MODULE`

如果某依赖 block blocked，必须读取其 `block_status.tsv` 和 `block_issue_list.tsv`，在 state component 表中记录缺失来源。不得用简单均值或 proxy 填补。

## State Score

三类状态均需尽可能输出 `raw_biological_numeric` 状态特征并进入统一漏斗，除非对应细胞群、工具或资源缺失并有明确 blocked reason。

状态分数不得直接对异质原始特征做未标准化均值。必须：

1. 对 component feature 做 robust z-score 或 rank-normalization。
2. 记录 component、方向、权重、来源 block、来源层级、缺失处理。
3. 若方向无法确定，输出 state component table，但不合成为单一 primary state score。
4. 保留 `all/major/subtype/major_pair/subtype_pair` 来源列。

## Tumor State

来源：

- Tumor/Epithelial fraction。
- tumor pathway/program activity。
- tumor TF activity。
- CNV/antigen presentation 若 Section 3 提供。
- immune evasion proxy。
- tumor-related communication class。

Feature id：

- `tumor__all__<state>`
- `tumor__major__<Major_CellType>__<state>`
- `tumor__subtype__<Cell_Subtype>__<state>`

## Immune State

来源：

- immune composition。
- CD8/Treg ratio。
- myeloid/T cell ratio。
- cytotoxic/exhaustion/Treg/myeloid/DC pathway/program。
- immune TF activity。
- immune-related communication class。

Feature id：

- `immune__all__<state>`
- `immune__major__<Major_CellType>__<state>`
- `immune__subtype__<Cell_Subtype>__<state>`

## CAF State

来源：

- CAF/iCAF/myoCAF/apCAF fraction。
- CAF program/pathway activity。
- CAF TF activity。
- CAF-centered communication class。
- limited CAF HVG/module。

Feature id：

- `caf__all__<state>`
- `caf__major__<Major_CellType>__<state>`
- `caf__subtype__<Cell_Subtype>__<state>`

## External Multiomics

仅当真实 patient-level 外部表存在时读取：

- mutation、TMB、neoantigen、MSI。
- methylation。
- TCR/BCR clonality。
- miRNA。
- proteomics/IHC/metabolomics。
- spatial features。

禁止从 cancer type、dataset_id、response 或 route metadata 推断外部组学。缺失时输出 not_available，不得填 0 或 cohort median。

## 块内局部自净

Label-free gate：

- component 可追溯。
- direction/weight 有记录。
- robust z-score 或 rank-normalization 已执行。
- patient-feature 唯一性。
- 缺失率、近零方差、单 dataset 信号。

Response-aware 粗筛：

- Wilcoxon/rank test，BH FDR。
- `FDR < 0.25` 进入候选。

Dynamic L1/L2：

- 通常 state features `p <= 50`，跳过 ElasticNet。
- 若 external multiomics 或 component-expanded state `p > 50`，运行 logistic ElasticNet `alpha=0.5`，并标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。

## 输出

模块目录主输出：

- `work/features/state_multiomics/state_multiomics_summary.tsv`
- `work/features/state_multiomics/state_multiomics_summary.md`
- `work/features/state_multiomics/state_multiomics_manifest.tsv`
- `work/features/state_multiomics/state_multiomics_feature_matrix.tsv.gz`
- `work/features/state_multiomics/state_multiomics_feature_meta.tsv`
- `work/features/state_multiomics/state_multiomics_feature_qc.tsv`
- `work/features/state_multiomics/state_multiomics_gate_log.tsv`
- `work/features/state_multiomics/state_multiomics_response_screen.tsv`
- `work/features/state_multiomics/state_multiomics_candidate_features.tsv`
- `work/features/state_multiomics/state_multiomics_issue_list.tsv`

正式 substep 输出：

- `work/features/substeps/tumor_state_features_patient.tsv`
- `work/features/substeps/immune_state_features_patient.tsv`
- `work/features/substeps/caf_state_features_patient.tsv`
- `work/features/qc/state_feature_summary.tsv`
- `work/features/qc/state_score_component_qc.tsv`
- `work/features/qc/multiomics_feature_availability.tsv`
- `work/features/substeps/multiomics_features_patient.tsv`

Block 输出：

- `work/features/blocks/S4B_STATE_MULTIOMICS/block_status.tsv`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_feature_matrix.tsv.gz`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_feature_meta.tsv`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_feature_qc.tsv`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_gate_log.tsv`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_response_screen.tsv`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_screened_candidates.tsv`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_run_manifest.tsv`
- `work/features/blocks/S4B_STATE_MULTIOMICS/block_issue_list.tsv`

完成后更新 `work/features/process/section4_process_index.tsv`。
