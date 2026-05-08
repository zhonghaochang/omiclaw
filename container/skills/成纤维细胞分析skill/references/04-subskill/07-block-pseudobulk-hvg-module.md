---
name: 04-subskill-block-pseudobulk-hvg-module
description: Section 4 Map-Reduce block S4.8。独立计算 all/major/subtype pseudobulk、限流 gene expression 和 HVG module，并执行块内局部自净。
type: reference
---

# Block S4.8 Pseudobulk HVG Module

## Block ID

`S4B_PSEUDOBULK_HVG_MODULE`

## 输入

只读：

- `work/features/mapreduce/frozen_inputs/*`
- `work/features/feature_catalog.tsv`
- `work/features/data_based_feature_catalog.tsv`
- Section 3 handoff h5ad
- marker panel 和 Research-based 可实现基因列表。

## 计算规则

正式计算：

1. 每个 dataset、patient、all/major/subtype 生成 pseudobulk。
2. `all` 使用全 eligible cells。
3. `major` 覆盖所有 `Major_CellType`。
4. `subtype` 覆盖所有满足支持度的 `Cell_Subtype`，重点包括 CAF/T/NK/Myeloid/B/Cancer/Epithelial。
5. 使用 `counts` 聚合。
6. 标准化为全基因 library-size logCPM。
7. 不得用 marker subset 总和作为 CPM denominator。
8. 记录 source cell 数、library size、detected genes、gene overlap。

## 允许进入的表达特征

- 文献基因和 marker gene 的受控 pseudobulk。
- 每个 major 的 HVG/pseudobulk 数值特征。
- 每个重点 subtype 和满足支持度的非重点 subtype 的 HVG/pseudobulk 数值特征。
- 若工程上需要分块存储高维 gene-level raw matrix，必须先完整登记 raw 特征和支持度，再交由块内 ElasticNet 与块外 LASSO/Boruta 缩减；不得用人工等级预先筛掉。
- 每个 major 和重点 subtype 都必须生成 `hvg__major__<major>__module_topN` 或 `hvg__subtype__<subtype>__module_topN` module 特征；不得只输出 major module。

Feature id：

- `pb__all__<gene>`
- `pb__major__<Major_CellType>__<gene>`
- `pb__subtype__<Cell_Subtype>__<gene>`
- `hvg__all__module_topN`
- `hvg__major__<Major_CellType>__module_topN`
- `hvg__subtype__<Cell_Subtype>__module_topN`

raw `pb__...`、`hvg__...`、module/marker-supported summary 均为 label-free `raw_biological_numeric`，通过支持度 QC 后进入同一漏斗。

## 生物学一致性

必须有：

- `celltype_allowed_gene_panel` 或 marker coherence 审计。
- 免疫 marker 不得无约束套到 epithelial/endothelial/B cell 等不合理组合后作为可信 raw biological feature。
- 异常跨谱系表达必须标记 `gene_celltype_incoherent`，可移除或仅作为 QC，不得静默入场。

## 块内局部自净

Label-free gate：

- source cell 支持。
- library size 和 detected genes。
- gene-celltype coherence。
- patient-feature 唯一性。
- 缺失率、近零方差、单 dataset 信号。
- family cap。

Response-aware 粗筛：

- Wilcoxon/rank test，BH FDR。
- `FDR < 0.25` 进入候选。

Dynamic L1/L2：

- module/HVG summary 若 `p <= 50` 跳过 ElasticNet。
- raw gene-level `p > 50` 时必须触发 logistic ElasticNet `alpha=0.5`。
- raw pb response-aware candidates 标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。

## 输出

模块目录主输出：

- `work/features/pseudobulk_hvg/pseudobulk_hvg_summary.tsv`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_summary.md`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_manifest.tsv`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_feature_matrix.tsv.gz`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_feature_meta.tsv`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_feature_qc.tsv`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_gate_log.tsv`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_response_screen.tsv`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_candidate_features.tsv`
- `work/features/pseudobulk_hvg/pseudobulk_hvg_issue_list.tsv`

正式 substep 输出：

- `work/features/substeps/pseudobulk_manifest.tsv`
- `work/features/substeps/pseudobulk_features_patient.tsv`
- `work/features/substeps/hvg_module_features_patient.tsv`
- `work/features/qc/pseudobulk_feature_qc.tsv`
- `work/features/qc/pseudobulk_gene_celltype_coherence.tsv`
- `work/features/qc/pseudobulk_axis_support_qc.tsv`

Block 输出：

- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_status.tsv`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_feature_matrix.tsv.gz`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_feature_meta.tsv`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_feature_qc.tsv`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_gate_log.tsv`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_response_screen.tsv`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_screened_candidates.tsv`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_run_manifest.tsv`
- `work/features/blocks/S4B_PSEUDOBULK_HVG_MODULE/block_issue_list.tsv`

完成后更新 `work/features/process/section4_process_index.tsv`。
