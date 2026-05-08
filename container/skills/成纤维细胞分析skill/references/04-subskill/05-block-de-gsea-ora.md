---
name: 04-subskill-block-de-gsea-ora
description: Section 4 Map-Reduce block S4.6。独立运行 R/NR DE、GSEA 和 ORA；所有结果均为 response_derived 解释性结果，禁止进入 raw feature 漏斗。
type: reference
---

# Block S4.6 DE GSEA ORA

## Block ID

`S4B_DE_GSEA_ORA`

## 角色

本 block 必做，但只产生 `response_derived` 解释性结果。它不生成 `raw_biological_numeric` 入场特征，不进入 ElasticNet/LASSO/Boruta raw 漏斗。

## 输入

只读：

- `work/features/mapreduce/frozen_inputs/*`
- `work/features/feature_catalog.tsv`
- Section 3 handoff h5ad
- `work/features/qc/qc_covariates.tsv`
- 本地 Hallmark、KEGG、Reactome、GO BP/MF/CC GMT。

## 概念边界

- DE：基因级 R vs NR differential expression。
- GSEA/ORA：基于 DE 统计量或显著基因列表的 response-aware 富集解释。
- pathway/program activity：不使用 R/NR 的 label-free activity feature，可用于建模。

三者必须分离。DE-GSEA/ORA 不得混入 pathway activity primary feature。

## 计算流程

1. 按 `patient × all`、`patient × major`、`patient × subtype` 构建 pseudobulk。
2. 每个层级内执行 R vs NR DE；样本不足的 subtype 必须 blocked 并记录原因。
3. 首选 R `edgeR/limma`。
4. 样本过少时 fallback 到 patient-level rank test。
5. GSEA 使用 `fgsea` 或 `gseapy.prerank`。
6. ORA 使用 `clusterProfiler` 或本地 GMT Fisher/超几何检验。

Gene set 必须来自本地：

- Hallmark。
- KEGG legacy / KEGG Medicus。
- Reactome。
- GO BP/MF/CC。

## 块内 QC

必须输出：

- pseudobulk 样本数。
- 每个 axis/group 的 R/NR patient 数。
- DE 模型可运行状态。
- GSEA/ORA gene set overlap。
- blocked subtype 原因。
- response leakage audit，确认结果仅 explanatory。

本 block 不执行 ElasticNet 进入建模候选；如果为统一合同输出 `block_response_screen.tsv`，其中 `feature_input_class=response_derived`、`enter_funnel=False`。

## 输出

模块目录主输出：

- `work/features/de_gsea_ora/de_gsea_ora_summary.tsv`
- `work/features/de_gsea_ora/de_gsea_ora_summary.md`
- `work/features/de_gsea_ora/de_gsea_ora_manifest.tsv`
- `work/features/de_gsea_ora/de_gsea_ora_feature_matrix.tsv.gz`，可为空矩阵但必须有 patient index 和说明。
- `work/features/de_gsea_ora/de_gsea_ora_feature_meta.tsv`
- `work/features/de_gsea_ora/de_gsea_ora_feature_qc.tsv`
- `work/features/de_gsea_ora/de_gsea_ora_gate_log.tsv`
- `work/features/de_gsea_ora/de_gsea_ora_response_screen.tsv`
- `work/features/de_gsea_ora/de_gsea_ora_candidate_features.tsv`，必须为空或全部 `feature_input_class=response_derived`、`enter_funnel=False`。
- `work/features/de_gsea_ora/de_gsea_ora_issue_list.tsv`

正式 substep 输出：

- `work/features/explanatory/de_genes_by_celltype.tsv`
- `work/features/explanatory/gsea_by_celltype.tsv`
- `work/features/explanatory/ora_by_celltype.tsv`
- `work/features/explanatory/enrichment_summary.tsv`
- `work/features/qc/enrichment_qc.tsv`
- `work/features/qc/enrichment_axis_coverage_qc.tsv`

Block 输出：

- `work/features/blocks/S4B_DE_GSEA_ORA/block_status.tsv`
- `work/features/blocks/S4B_DE_GSEA_ORA/block_feature_matrix.tsv.gz`，可为空矩阵但必须有 patient index 和说明。
- `work/features/blocks/S4B_DE_GSEA_ORA/block_feature_meta.tsv`
- `work/features/blocks/S4B_DE_GSEA_ORA/block_feature_qc.tsv`
- `work/features/blocks/S4B_DE_GSEA_ORA/block_gate_log.tsv`
- `work/features/blocks/S4B_DE_GSEA_ORA/block_response_screen.tsv`
- `work/features/blocks/S4B_DE_GSEA_ORA/block_screened_candidates.tsv`
- `work/features/blocks/S4B_DE_GSEA_ORA/block_run_manifest.tsv`
- `work/features/blocks/S4B_DE_GSEA_ORA/block_issue_list.tsv`

完成后更新 `work/features/process/section4_process_index.tsv`。
