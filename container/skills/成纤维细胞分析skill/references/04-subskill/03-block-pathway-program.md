---
name: 04-subskill-block-pathway-program
description: Section 4 Map-Reduce block S4.4。独立计算 pathway/program activity，覆盖 all/major/subtype，并执行块内局部自净。
type: reference
---

# Block S4.4 Pathway Program Activity

## Block ID

`S4B_PATHWAY_PROGRAM`

## 输入

只读：

- `work/features/mapreduce/frozen_inputs/*`
- `work/features/feature_catalog.tsv`
- `work/features/data_based_feature_catalog.tsv`
- `work/features/research_based_feature_realization.tsv`
- Section 3 handoff h5ad
- 本地 GMT / curated program / marker resources

不得联网下载 gene set，不得只硬编码少数 Hallmark。

## 本地库

固定使用：

- `assets/dataset/msigdb/msigdb_hs_hallmark_v2025.1.gmt`
- `assets/dataset/msigdb/msigdb_hs_kegg_legacy_v2025.1.gmt`
- `assets/dataset/msigdb/msigdb_hs_kegg_medicus_v2025.1.gmt`
- `assets/dataset/msigdb/msigdb_hs_reactome_v2025.1.gmt`
- `assets/dataset/msigdb/go_bp_org_hs_eg_db_3.18.0.gmt`
- `assets/dataset/msigdb/go_mf_org_hs_eg_db_3.18.0.gmt`
- `assets/dataset/msigdb/go_cc_org_hs_eg_db_3.18.0.gmt`
- 本地 curated CAF/ICB programs，若存在。

## 算法优先级

1. UCell 或 AUCell：cell-level rank-based score，再聚合到 patient × axis × group。
2. decoupler gene set activity：cell-level 或 patient × celltype pseudobulk。
3. GSVA/ssGSEA：patient × celltype pseudobulk 或 sample-level matrix。
4. `scanpy.score_genes`：仅作为可审计 fallback。

每个方法必须输出 gene overlap、used genes、dropped genes 和 score distribution。gene set overlap `< 5` 或 `< 20%` 时该 feature 必须 blocked，不能进入 raw 漏斗。

## 层级输出

必须尽可能输出三层：

- `path__all__<library>__<term>`
- `path__major__<Major_CellType>__<library>__<term>`
- `path__subtype__<Cell_Subtype>__<library>__<term>`
- `prog__all__<program>`
- `prog__major__<Major_CellType>__<program>`
- `prog__subtype__<Cell_Subtype>__<program>`

不得把 major/subtype 分数平均成唯一 patient-level 总分后丢失层级。

## Raw 入场规则

所有通过 gene overlap 和 score distribution QC 的 label-free pathway/program activity 分数均为 `raw_biological_numeric`，必须进入块内漏斗。Hallmark、curated CAF/ICB programs、KEGG、Reactome、GO BP/MF/CC 不得因人工等级预分层而在入场前丢弃。

允许在 summary 和图表中标记核心主题，例如 CAF state、immune state、tumor state、antigen presentation、IFN、ECM/TGF-beta；这些标记只用于解释和 ablation group，不影响入场。

## 核心状态覆盖

Tumor state：

- proliferation：E2F、G2M、MYC。
- EMT、hypoxia、IFN response、antigen presentation、WNT/beta-catenin、TGF-beta、p53、apoptosis。

Immune state：

- cytotoxicity、exhaustion、Treg suppressive、myeloid suppressive、TREM2/APOE/C1QC TAM、mregDC、cDC1/cDC2、IFN、chemokine、antigen presentation。

CAF state：

- iCAF、myoCAF、apCAF、ECM/collagen remodeling、TGF-beta/EMT CAF、chemokine/TLS recruiting CAF、FMO2/CCL19 和 FRZB/SPARC/FKBP10 programs where available。

## 块内局部自净

先做 label-free gate：

- gene set overlap 和 score distribution。
- patient-feature 唯一性。
- 缺失率、近零方差、非缺失 patient 数、非缺失 dataset 数。
- all/major/subtype 轴覆盖。

再做 response-aware 粗筛：

- Wilcoxon/rank test，BH FDR。
- `FDR < 0.25` 进入候选。

Dynamic L1/L2：

- `p <= 50` 跳过 ElasticNet。
- `p > 50` 运行 logistic ElasticNet，`alpha=0.5`。
- response-aware selected feature 标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。

## 输出

模块目录主输出：

- `work/features/pathway_program/pathway_program_summary.tsv`
- `work/features/pathway_program/pathway_program_summary.md`
- `work/features/pathway_program/pathway_program_manifest.tsv`
- `work/features/pathway_program/pathway_program_feature_matrix.tsv.gz`
- `work/features/pathway_program/pathway_program_feature_meta.tsv`
- `work/features/pathway_program/pathway_program_feature_qc.tsv`
- `work/features/pathway_program/pathway_program_gate_log.tsv`
- `work/features/pathway_program/pathway_program_response_screen.tsv`
- `work/features/pathway_program/pathway_program_candidate_features.tsv`
- `work/features/pathway_program/pathway_program_issue_list.tsv`

正式 substep 输出：

- `work/features/substeps/program_activity_features_cell_summary.tsv`
- `work/features/substeps/program_activity_features_sample.tsv`
- `work/features/substeps/program_activity_features_patient.tsv`
- `work/features/substeps/pathway_activity_features_patient.tsv`
- `work/features/substeps/pathway_activity_features_by_axis.tsv`
- `work/features/substeps/program_activity_features_by_axis.tsv`
- `work/features/qc/gene_set_overlap_qc.tsv`
- `work/features/qc/pathway_library_coverage_qc.tsv`

Block 输出：

- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_status.tsv`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_feature_matrix.tsv.gz`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_feature_meta.tsv`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_feature_qc.tsv`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_gate_log.tsv`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_response_screen.tsv`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_screened_candidates.tsv`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_run_manifest.tsv`
- `work/features/blocks/S4B_PATHWAY_PROGRAM/block_issue_list.tsv`

完成后更新 `work/features/process/section4_process_index.tsv`。
