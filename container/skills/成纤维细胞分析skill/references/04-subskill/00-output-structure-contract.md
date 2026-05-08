---
name: 04-subskill-output-structure-contract
description: Section 4 Map-Reduce 分块输出目录规范。每个模块必须在 run/work/features/<module>/ 下输出本模块 summary、manifest、QC 和局部筛选结果，同时保留原 skill 的兼容输出路径。
type: reference
---

# Section 4 Output Structure Contract

## 目录原则

本拆分版 Section 4 采用模块化输出。用户所说的 `feature/xxx` 在原 skill 的正式目录体系中实现为：

`<run_dir>/work/features/<module>/`

不得把所有 block 的 summary 混写到 `work/features/substeps/` 或 `work/features/qc/` 后再让下游猜测来源。`substeps/`、`qc/`、`explanatory/`、`screening/`、`section5/` 仍保留为原 skill 兼容接口，但每个模块自己的总结、manifest、QC 和局部筛选结果必须同步写入模块目录。

## 模块目录

| module | 对应步骤 | 模块目录 |
|---|---|---|
| `orchestrator` | S4.0-S4.1 | `work/features/orchestrator/` |
| `catalog` | S4.2 | `work/features/catalog/` |
| `composition` | S4.3 | `work/features/composition/` |
| `pathway_program` | S4.4 | `work/features/pathway_program/` |
| `tf_regulon` | S4.5 | `work/features/tf_regulon/` |
| `de_gsea_ora` | S4.6 | `work/features/de_gsea_ora/` |
| `communication` | S4.7 | `work/features/communication/` |
| `pseudobulk_hvg` | S4.8 | `work/features/pseudobulk_hvg/` |
| `state_multiomics` | S4.9-S4.10 | `work/features/state_multiomics/` |
| `integration` | S4.11-S4.12 | `work/features/integration/` |
| `section5_package` | S4.13 | `work/features/section5/` |
| `figures` | S4.fig | `work/features/figures/` |

## 每个模块必须有的文件

每个 `<module>` 目录至少包含：

- `<module>_summary.tsv`：机器可读总结，一行一个 feature family / axis / feature_input_class / enter_funnel / status 组合。
- `<module>_summary.md`：人类可读总结，写明完成状态、核心数量、blocked 原因和注意事项。
- `<module>_manifest.tsv`：输入、输出、工具、数据库、hash、参数和脚本 provenance。
- `<module>_feature_matrix.tsv.gz`：本模块 patient-level feature matrix；若模块只产生解释性结果，可为空矩阵但必须有 patient index 和说明。
- `<module>_feature_meta.tsv`：本模块 feature dictionary 子集。
- `<module>_feature_qc.tsv`：缺失率、方差、支持度、axis coverage、leakage risk。
- `<module>_gate_log.tsv`：本模块一行一个 feature 的 gate 结果。
- `<module>_response_screen.tsv`：本模块 R/NR 宽口径单因素 gate 结果；不产生 raw 入场特征的模块也要输出空表和说明。
- `<module>_candidate_features.tsv`：本模块交给 post-integration 的候选，来源为宽松单因素 gate 或块内 ElasticNet；response-aware 候选必须标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。
- `<module>_issue_list.tsv`：本模块 warning/error/blocked/fatal issue。

## Summary Schema

`<module>_summary.tsv` 至少包含：

- `module`
- `substep`
- `feature_family`
- `data_feature_class`
- `source_cell_axis`
- `target_cell_axis`
- `feature_input_class`
- `enter_funnel`
- `n_raw_features`
- `n_after_label_free_gate`
- `n_raw_biological_numeric`
- `n_response_derived`
- `n_qc_only`
- `n_univariate_fdr_lt_0_25`
- `n_elasticnet_nonzero`
- `n_block_candidates`
- `n_global_lasso_nonzero`
- `n_boruta_confirmed`
- `n_final_candidates`
- `blocked_status`
- `blocked_reason`
- `requires_trainfold_recompute`
- `summary_status`

## 兼容输出

模块目录是分块运行的主接口；原 skill 的兼容输出仍必须保留：

- S4.3-S4.10 的正式表继续写入 `work/features/substeps/`、`work/features/qc/`、`work/features/explanatory/`。
- Communication 工具运行诊断继续写入 `work/communication/`，并同步在 `work/features/communication/` 写 summary。
- S4.11-S4.12 的合并和筛选继续写入 `work/features/` 与 `work/features/screening/`，并同步在 `work/features/integration/` 写 summary。
- S4.13 继续写入 `work/features/section5/`。
- S4.fig 图包可继续写入 `work/figures/`，但必须在 `work/features/figures/` 写 `figures_summary.tsv/md` 和 source data manifest。

## Post-Integration 读取顺序

`09-post-integration-screen-delivery.md` 必须优先读取各模块目录中的：

- `<module>_feature_matrix.tsv.gz`
- `<module>_feature_meta.tsv`
- `<module>_feature_qc.tsv`
- `<module>_gate_log.tsv`
- `<module>_candidate_features.tsv`
- `<module>_summary.tsv`

若模块目录缺失但兼容路径存在，post-integration 不得静默使用兼容路径；必须写 warning，并在 `work/features/integration/input_structure_reconciliation.tsv` 中记录 fallback 来源。
