---
name: 04-subskill-orchestrator-preflight-catalog
description: Section 4 Map-Reduce 阶段一。执行 S4.0-S4.2：准入审计、metadata 回填、Research/Data catalog 冻结，并为下游 block 生成冻结输入和 dispatch manifest。
type: reference
---

# S4 Orchestrator And Catalog Freeze

## 角色

本子 skill 是 Section 4 分块运行的唯一总控入口。它不计算专业特征，只负责把 Section 3 handoff、manifest、Research-based 表和资源状态冻结成可审计的 block 输入。

## 绝对约束

- 只执行 Section 4 的 S4.0-S4.2。
- 不重跑 Section 1/2/3。
- 不执行 Section 5/6/7。
- 不修改 Section 3 run 中任何文件。
- 不改写 `TopLevel_Compartment`、`Major_CellType`、`Cell_Subtype`、`Raw_Label_Primary`。
- 不读取旧 Section 4 run 的 feature matrix、cache 或脚本冒充本次输出。
- 固定 R/Python 环境、固定数据库和 hash 校验以原 `04-feature-engineering.md` 与 `04-prompt.txt` 为准。

## 输入

正式 Section 3 run 以旧 prompt 为准：

`/vepfs-mlp2/mlp-public/250266/omiclaw/groups/web_chat/run_20260429_043147_section3_only_03d_from_feishu_s2_userstrict`

必须只读：

- `work/section4_input/merged.section3_for_section4.h5ad`
- `work/section4_input/per_dataset/*.section3_for_section4.h5ad`
- `work/section4_input/section4_h5ad_export_manifest.tsv`
- `work/section4_input/section4_obs_schema.tsv`
- `work/section4_input/section4_feature_eligibility.tsv`
- `work/qc/section3_section4_handoff_qc.tsv`
- `work/qc/section3_qc_report.md`
- `work/qc/section3_issue_list.tsv`
- `work/process/process_index.tsv` 或 `work/process_index.tsv`

Research-based 唯一输入：

`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/transcriptome_feature.tsv`

禁止运行时重新检索论文、读取 `pubmed_document.csv` / `wos_document.csv` 生成新文献特征。

## S4.0 Preflight

必须执行：

1. 校验 Section 4 规范、`00-constraints.md`、`transcriptome_feature.tsv`、handoff h5ad、manifest 和核心 assets 的 hash。
2. 读取 Section 3 QC，按结构化上下文解析 hard fail；`## Hard Fail Checks` 下为 `- none` 时视为通过。
3. 校验 obs 必需列、dtype、missing fraction、handoff 语义和 eligibility 一致性。
4. 审计 `counts`、`lognorm`、`X` 和 gene symbol alignment。
5. 若 h5ad 读取因 `/uns/log1p/base` null IOSpec 失败，按原 skill 注册只读 shim 后重试，并记录 `h5ad_null_iospec_shim_applied`。
6. 检查固定 Python、固定 R、scCODA、pySCENIC、MSigDB/GO、regulon、communication、CellPhoneDB 和 pySCENIC 资源。

Fatal error 条件：

- hash 不一致。
- upstream Section 3 QC failed/blocked/hard fail。
- eligibility 与 obs 标志冲突。
- 表达层无法确认。
- gene symbol alignment 失败。
- 必选模块的固定工具或数据库缺失且 strict 模式不允许 blocked。

最低输出：

- `work/features/qc/section4_preflight_qc.tsv`
- `work/features/qc/section4_input_schema_audit.tsv`
- `work/features/qc/section4_h5ad_layer_audit.tsv`
- `work/features/qc/section4_celltype_distribution.tsv`
- `work/features/qc/section4_eligibility_audit.tsv`
- `work/features/qc/section4_environment_preflight.tsv`
- `work/audit/section4_input_hashes.tsv`
- `work/audit/section4_startup_meta.tsv`

## S4.1 Metadata Backfill

从正式 manifest 只读回填：

- `response_binary`
- `response_tier`
- `cancer_type`
- `cancer_context`
- `subtype_unified`
- `treatment_type` 或 `treatment_state`
- `include_main_analysis`
- `include_mechanism_analysis`
- `analysis_unit`
- `source_sample_id`
- `source_lesion_id`

`dataset_id`、`patient_id`、`cancer_type`、`treatment_type`、`platform`、`n_cells_total`、route、QC flag 等全部标记 `qc_only` 或 `covariate_only_not_biomarker`，`enter_funnel=False`，不得进入 biomarker 筛查漏斗。

最低输出：

- `work/features/feature_metadata_backfill_audit.tsv`
- `work/features/qc/patient_route_reconciliation.tsv`
- `work/features/qc/qc_covariates.tsv`

## S4.2 Catalog Freeze

冻结后才允许 block 计算特征；不得边算边临时新增未登记特征。

Research-based realization 必须一行对应 `transcriptome_feature.tsv` 一行。允许状态：

- `computed`
- `computed_partial`
- `blocked_missing_gene_definition`
- `blocked_missing_formula_or_weights`
- `blocked_external_multiomics_unavailable`
- `blocked_tool_not_run`
- `blocked_low_gene_overlap`
- `context_only`
- `not_applicable_to_scRNA`

`computed` 和 `computed_partial` 必须对应真实数值列或实际映射；只有计划、没有数值时不得标为 `computed_partial`。

Data-based catalog 来源：

- Section 3 实际 `TopLevel_Compartment / Major_CellType / Cell_Subtype`
- `assets/stroma_subtype_markers.tsv/xlsx`
- `assets/immune_subtype_markers.tsv`
- MSigDB Hallmark、KEGG legacy、KEGG Medicus、Reactome、GO BP/MF/CC、本地 curated GMT
- DoRothEA、CollecTRI、SCENIC regulon
- LIANA consensus、LIANA CellPhoneDB、LIANA CellChatDB、本地 CellPhoneDB zip、R CellChatDB
- 真实外部 multiomics patient table

`feature_catalog.tsv` 必须至少包含原 skill 中定义的二元入场 schema 字段，特别是：

- `feature_id`
- `feature_origin`
- `feature_family`
- `data_feature_class`
- `feature_input_class`
- `enter_funnel`
- `response_derived`
- `qc_only`
- `post_funnel_status`
- `requires_trainfold_recompute`
- `source_cell_axis`
- `source_cell_group`
- `target_cell_axis`
- `target_cell_group`
- `aggregation_level`
- `aggregation_method`
- `expression_layer`
- `tool`
- `database`
- `minimum_support_rule`
- `compute_status`
- `blocked_reason`
- `leakage_risk`
- `feature_group_for_ablation`
- `checkpoint_group`

## Map Dispatch

当运行配置为 `mode = composition_only_debug` 时，`block_dispatch_manifest.tsv` 只能把 `S4B_COMPOSITION_RATIO_DIVERSITY` 标为 required / runnable；pathway_program、tf_regulon、de_gsea_ora、communication、pseudobulk_hvg、state_multiomics 和 external_multiomics 必须标记 `not_required_debug_excluded` 或 `not_run_debug_excluded`，不得进入自动调度队列。

在 S4.2 结束时生成冻结输入目录：

`work/features/mapreduce/frozen_inputs/`

最低文件：

- `patient_manifest_frozen.tsv`
- `eligible_cell_manifest.tsv`
- `h5ad_manifest_frozen.tsv`
- `block_dispatch_manifest.tsv`
- `resource_hash_freeze.tsv`
- `subskill_hash_freeze.tsv`
- `mapreduce_run_config.tsv`

`block_dispatch_manifest.tsv` 至少包含：

- `block_id`
- `subskill_file`
- `required_module`
- `input_h5ad_scope`
- `expected_output_matrix`
- `expected_output_meta`
- `expected_qc`
- `can_run_parallel`
- `depends_on_block_id`
- `strict_fail_closed`

## Checkpoints

最低输出：

- `work/features/orchestrator/orchestrator_summary.tsv`
- `work/features/orchestrator/orchestrator_summary.md`
- `work/features/orchestrator/orchestrator_manifest.tsv`
- `work/features/orchestrator/orchestrator_issue_list.tsv`
- `work/features/catalog/catalog_summary.tsv`
- `work/features/catalog/catalog_summary.md`
- `work/features/catalog/catalog_manifest.tsv`
- `work/features/catalog/catalog_feature_qc.tsv`
- `work/features/feature_catalog.tsv`
- `work/features/research_based_feature_realization.tsv`
- `work/features/literature_feature_realization.tsv`
- `work/features/data_based_feature_catalog.tsv`
- `work/features/checkpoints/feature_catalog_summary_checkpoint.tsv`
- `work/features/checkpoints/S4.2_feature_catalog_READY`
- `work/features/qc/feature_catalog_qc.tsv`

`feature_catalog_summary_checkpoint.tsv` 必须按 `feature_origin / feature_family / data_feature_class / feature_input_class / enter_funnel` 统计：

- `n_planned`
- `n_computable`
- `n_blocked`
- `n_raw_biological_numeric`
- `n_response_derived`
- `n_qc_only`
- `block_reason_top`
- `checkpoint_status`

完成后更新 `work/features/process/section4_process_index.tsv`。
