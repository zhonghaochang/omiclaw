---
name: 04-subskill-post-integration-screen-delivery
description: Section 4 Map-Reduce 阶段三。执行 S4.11-S4.fig：合并 block 输出、全局 gate、全局 response-aware 筛选、Section 5 输入包和图包交付。
type: reference
---

# S4 Post Integration Screen Delivery

## 角色

接收各 block 的 raw 矩阵、metadata、QC 和块内候选结果，执行全局整合、label-free gate、严格 LASSO + Boruta、解释性 response-aware 归档、Section 5 输入包和 Fig_S5 图包输出。

不得训练 Section 5 模型，不得正式计算最终 AUC、SHAP、DMI、LODO 或 ablation 结论。

## Composition Debug Override

当运行配置为 `mode = composition_only_debug` 时，本文件只作为 composition-only 后处理规范使用，不得自动补跑或等待 pathway/program、TF/regulon、DE-GSEA/ORA、communication、pseudobulk/HVG、state_multiomics 或 external multiomics block。

在该模式下：

- 唯一 required feature block 是 `S4B_COMPOSITION_RATIO_DIVERSITY`。
- `work/features/composition/` 是唯一必须 completed 的专业模块目录。
- 其他模块缺失必须在 `work/features/integration/input_structure_reconciliation.tsv` 中标记 `not_run_debug_excluded`，不得触发 fatal。
- `raw_biological_numeric_features.tsv.gz`、`fibro_features.tsv` 和 Section5 debug package 只允许由 composition/ratio/diversity 的 raw biological features 与 qc_only metadata 组成。
- composition-only debug 可跳过全局 LASSO/Boruta；若跳过，必须写明 `skipped_debug_composition_only`。正式 full run 不得跳过全局 LASSO/Boruta。
- 非 composition 图只允许输出 blocked/not_run_debug_excluded caption 和 source manifest 记录，不得伪装成真实运行。

## 输入

必须读取：

- `work/features/checkpoints/feature_catalog_summary_checkpoint.tsv`
- `work/features/checkpoints/S4.2_feature_catalog_READY`
- `work/features/mapreduce/frozen_inputs/block_dispatch_manifest.tsv`
- 每个 required block 的 `block_status.tsv`
- 每个 completed block 的 `block_feature_matrix.tsv.gz`
- 每个 completed block 的 `block_feature_meta.tsv`
- 每个 completed block 的 `block_feature_qc.tsv`
- 每个 completed block 的 `block_gate_log.tsv`
- 每个 completed block 的 `block_response_screen.tsv`
- 每个 completed block 的 `block_screened_candidates.tsv`
- `work/features/qc/qc_covariates.tsv`

优先读取各模块目录 `work/features/<module>/` 中的 summary、matrix、meta、QC、gate、candidate 文件。若模块目录缺失但旧兼容路径存在，不得静默 fallback；必须写入 `work/features/integration/input_structure_reconciliation.tsv`。

如果 required block 未 completed 且无 strict 允许的 blocked reason，必须停止。`composition_only_debug` 模式下 required block 仅指 `S4B_COMPOSITION_RATIO_DIVERSITY`。

## S4.11 Matrix Integration

必须输出二元准入和筛选矩阵：

- `work/features/raw_biological_numeric_features.tsv.gz`
- `work/features/block_screened_candidate_features.tsv`
- `work/features/global_screened_candidate_features.tsv`
- `work/features/response_derived_explanatory_index.tsv`
- `work/features/qc/qc_covariates.tsv`

兼容旧下游：

- `work/features/fibro_features_raw.tsv.gz`，所有通过 label-free gate 的 raw biological features。
- `work/features/fibro_features.tsv`，块外 LASSO/Boruta 严格候选。
- `work/features/fibro_features_mechanism.tsv`，机制解释和 response-derived 索引，不作为 raw 建模矩阵。

所有进入 `fibro_features_raw.tsv.gz` 的特征必须满足 `feature_input_class=raw_biological_numeric` 且 `enter_funnel=True`；metadata/provenance 必须在 dictionary 中标记 `feature_input_class=qc_only`、`enter_funnel=False`。

Mandatory gate：

- 方差 `< 1e-10` 移除。
- 主分析缺失率 `> 50%` 移除。
- 非缺失 patient `< 10` 移除。
- 非缺失主数据集 `< 2` 移除。
- 单一数据集信号移除。
- 绝对相关 `r > 0.99` 保留优先级更高者。
- source cell 支持不足移除或 mechanism-only。
- 直接 fraction ratio 移除。
- route/provenance/QC/count-like proxy 移到 `qc_only`，`enter_funnel=False`。
- response 参与 raw feature 生成时移到 `response_derived` 或移除，`enter_funnel=False`。
- 工具未真实运行移除。
- family cap 只能在 raw 全量输出后用于候选优先级，不得入场前丢弃。
- gene-celltype 不一致移除或转 `qc_only`。

最低输出：

- `work/features/integration/integration_summary.tsv`
- `work/features/integration/integration_summary.md`
- `work/features/integration/integration_manifest.tsv`
- `work/features/integration/integration_feature_matrix.tsv.gz`
- `work/features/integration/integration_feature_meta.tsv`
- `work/features/integration/integration_feature_qc.tsv`
- `work/features/integration/integration_gate_log.tsv`
- `work/features/integration/integration_response_screen.tsv`
- `work/features/integration/integration_candidate_features.tsv`
- `work/features/integration/integration_issue_list.tsv`
- `work/features/integration/input_structure_reconciliation.tsv`
- `work/features/fibro_feature_meta.tsv`
- `work/features/fibro_feature_qc.tsv`
- `work/features/feature_gate_log.tsv`
- `work/features/feature_matrix_manifest.tsv`
- `work/features/checkpoints/research_based_feature_summary_checkpoint.tsv`
- `work/features/checkpoints/data_based_feature_summary_checkpoint.tsv`
- `work/features/checkpoints/feature_matrix_build_summary_checkpoint.tsv`
- `work/features/checkpoints/S4.11_feature_matrix_READY`
- `work/features/qc/feature_axis_coverage_qc.tsv`
- `work/features/qc/patient_feature_integrity_qc.tsv`

`feature_gate_log.tsv` 必须一行一个 feature；多原因用分号合并，不得重复 feature 行导致计数混乱。

## 全局严格 Response-Aware Funnel

正式 full run 必须执行块外严格 LASSO + Boruta。composition-only debug 可跳过，但必须写入 skip reason。执行规则：

1. 输入只能来自 `feature_input_class=raw_biological_numeric` 且通过 label-free gate 的 block candidates；`response_derived` 与 `qc_only` 禁止入场。
2. 全局 LASSO/Boruta 是严格候选筛选层，输出 `global_screen_*` 文件，并生成 Section 5 candidate manifest。
3. 被 LASSO/Boruta 选中的 feature 必须标记：
   - `response_aware=True`
   - `global_lasso_status=nonzero` 或 `zero/rejected/skipped_debug`
   - `boruta_status=Confirmed/Tentative/Rejected/not_run_debug`
   - `requires_trainfold_recompute=True`
4. Section 5 若使用这些候选，必须在训练折内重算块内 gate、ElasticNet、LASSO 和 Boruta。

全局 LASSO：

- 对合并后的 block candidates 做标准化 logistic LASSO，`alpha=1`。
- 使用交叉验证选择 lambda。
- 只输出非零系数、稳定性、方向，不输出最终模型性能结论。

Boruta / shadow feature：

- 对 LASSO 幸存者或 family-capped 候选运行 Boruta 或带 shadow feature 的 XGBoost/RandomForest。
- 输出 `Confirmed / Tentative / Rejected`。
- 结果用于解释和 Section 5 candidate manifest，不改变 raw 入场身份。

最低输出：

- `work/features/screening/global_lasso_screen.tsv`
- `work/features/screening/global_boruta_shadow_screen.tsv`
- `work/features/screening/global_confirmed_exploratory_features.tsv`
- `work/features/qc/global_screen_leakage_audit.tsv`

## S4.12 Exploratory Univariate Archive

输入：通过 label-free gate 的 `raw_biological_numeric` features，以及全局 funnel 的严格候选子集。

方法：

- 单变量 logistic regression：OR、CI、p、AUC、direction。
- Wilcoxon/rank test：p、effect size。
- dataset direction consistency。
- BH FDR。
- adjusted exploratory model 可使用 dataset_id/cancer_type/treatment_type 作为协变量，但结果为 `response_derived`，协变量自身 `enter_funnel=False`。

最低输出：

- `work/features/screening/univariate_response_screen.tsv`
- `work/features/screening/significant_features_exploratory.tsv`
- `work/features/screening/section5_candidate_features_unsupervised.tsv`
- `work/features/screening/section5_candidate_features_trainfold_required.tsv`
- `work/features/qc/univariate_screen_leakage_audit.tsv`

## S4.13 Section 5 输入包

只生成输入，不训练模型。

必须输出：

- `work/features/section5/section5_package_summary.tsv`
- `work/features/section5/section5_package_summary.md`
- `work/features/section5/section5_input_matrix.tsv.gz`
- `work/features/section5/section5_feature_dictionary.tsv`
- `work/features/section5/section5_feature_groups.tsv`
- `work/features/section5/section5_lodo_folds.tsv`
- `work/features/section5/section5_ablation_plan.tsv`
- `work/features/section5/section5_auc_plot_input_template.tsv`
- `work/features/section5/section5_shap_input_manifest.tsv`
- `work/features/section5/section5_dmi_input_matrix.tsv.gz`
- `work/features/section5/section5_modeling_readiness_qc.tsv`

Dictionary 必须区分：

- `feature_input_class`
- `enter_funnel`
- `include_in_section5_candidate`
- `covariate_only_not_biomarker`
- `response_aware`
- `block_univariate_status`
- `block_elasticnet_status`
- `global_lasso_status`
- `boruta_status`
- `requires_trainfold_recompute`

推荐 ablation groups：

- `composition`
- `composition_ratio_diversity`
- `caf_state`
- `immune_state`
- `tumor_state`
- `pathway_program`
- `tf_activity`
- `communication_class`
- `pseudobulk_hvg`
- `research_based_signature`
- `external_multiomics`

## S4.fig

每张图必须输出 `pdf`、`png`、`source_data.tsv`、`caption.md`。若工具 blocked，caption 必须写清 blocked/not_available，不得伪装完成。

同时必须输出：

- `work/features/figures/figures_summary.tsv`
- `work/features/figures/figures_summary.md`
- `work/features/figures/figures_source_data_manifest.tsv`
- `work/features/figures/figures_issue_list.tsv`

必做图：

- `Fig_S5_feature_missingness_and_gate`
- `Fig_S5b_feature_class_distribution`
- `Fig_S5c_univariate_screen_overview`
- `Fig_S5d_section5_readiness`
- `Fig_S5e_composition_ratio_diversity`
- `Fig_S5f_pathway_program_activity`
- `Fig_S5g_tf_activity_or_blocked`
- `Fig_S5h_communication_lr_class_or_blocked`
- `Fig_S5i_hvg_pseudobulk_summary`
- `Fig_S5j_research_feature_realization`

`composition_only_debug` 模式下，真正必做图为 gate/readiness/screen/composition：`Fig_S5_feature_missingness_and_gate`、`Fig_S5b_feature_class_distribution`、`Fig_S5c_univariate_screen_overview`、`Fig_S5d_section5_readiness`、`Fig_S5e_composition_ratio_diversity`、`Fig_S5j_research_feature_realization`。`Fig_S5f/g/h/i` 必须输出 blocked/not_run_debug_excluded caption 和 source manifest 记录，不得要求运行对应模块。

Figure source data 要求：

- Fig_S5e 保留 top/major/subtype。
- Fig_S5f 同时包含 pathway 和 program，保留 all/major/subtype。
- Fig_S5g 包含 TF activity 和 RSS/RSS-like specificity，保留 all/major/subtype。
- Fig_S5h 包含 major_pair/subtype_pair network 或 top LR source data，不得只画全局 class 均值。
- Fig_S5i 包含 major/subtype HVG module summary。
- state summary heatmap source data 必须包含 state component、direction、weight。

## 最终 QC

必须输出：

- `work/qc/section4_qc_report.md`
- `work/qc/section4_issue_list.tsv`
- `work/audit/section4_script_provenance.md`
- `work/features/process/section4_process_index.tsv`

完成检查：

- 所有 required block completed 或有 strict fatal stop。
- `response_derived` 与 `qc_only` 未进入 raw/ElasticNet/LASSO/Boruta matrix。
- all/major/subtype/major_pair/subtype_pair 覆盖可审计。
- Section 5 输入包已生成。
- 未执行 Section 5 建模和正式性能结论。
