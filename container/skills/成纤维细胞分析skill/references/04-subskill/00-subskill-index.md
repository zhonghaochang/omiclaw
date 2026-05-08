---
name: 04-subskill-index
description: Section 4 Map-Reduce 分块运行索引。读取旧 Section 4 skill、旧 prompt、flow 文档和用户 V2.0 拆分 prompt 后生成；不替代原文件，只作为分块运行入口。
type: reference
---

# Section 4 Subskill Index

## 来源与优先级

本目录用于把原 `04-feature-engineering.md` 拆成可分块运行的 Map-Reduce 子 skill。生成依据：

- 原 skill：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/references/04-feature-engineering.md`
- 原 prompt：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/references/04-prompt.txt`
- flow 总结：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/04-section4-flow-explanation.md`
- 用户 V2.0 Map-Reduce prompt：以分治、局部自净、全局统合为组织方式。

冲突处理规则：

1. 固定路径、环境、数据库、输入 run、hash、二元入场角色、禁止事项和 fail-closed 规则以原 skill / 原 prompt 为准。
2. V2.0 prompt 的 Map-Reduce 拆分方式、块内方差过滤、宽松 R/NR 单因素 gate、局部 ElasticNet、全局 LASSO/Boruta 作为强制组织逻辑。
3. 只有 `feature_input_class=raw_biological_numeric` 且 `enter_funnel=True` 的 label-free 生物学数值可以进入筛查漏斗；`response_derived` 与 `qc_only` 禁止入场。所有 Wilcoxon、ElasticNet、LASSO、Boruta 结果均必须标记 `response_aware=True` 与 `requires_trainfold_recompute=True`，可产生 Section 5 候选清单和折内重算计划，但不能冒充无泄漏的 raw predictor。

## 固定环境

- Skill 根目录：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill`
- 固定 R 环境：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite`
- 固定 Rscript：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite/bin/Rscript`
- Section4 Python 环境：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-python/bin/python`
- scCODA 独立环境：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-sccoda/bin/python`
- pySCENIC CLI：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-python/bin/pyscenic`
- 数据库目录：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/dataset`

固定资源必须使用本地文件，不得运行中联网拉包、联网下载数据库或启用 proxy。

## 层级与命名

`patient` 是统计、R/NR 比较和 Section 5 建模单位；`all / major / subtype / major_pair / subtype_pair` 是特征生成轴。最终矩阵仍然一行一个 patient，但 feature id 必须保留生成层级：

- `prefix__all__...`
- `prefix__major__<Major_CellType>__...`
- `prefix__subtype__<Cell_Subtype>__...`
- `prefix__major_pair__<source_major>__<target_major>__...`
- `prefix__subtype_pair__<source_subtype>__<target_subtype>__...`

兼容旧 skill 中已有 `lr__major__source__target__LR` 写法时，必须在 `source_cell_axis/target_cell_axis` 和 `feature_axis_coverage_qc.tsv` 中明确该列属于 `major_pair` 或 `subtype_pair`。

## 分块文件

| 文件 | 对应步骤 | 角色 |
|---|---|---|
| `00-output-structure-contract.md` | 全流程 | 模块化输出目录与 summary 规范 |
| `01-orchestrator-preflight-catalog.md` | S4.0-S4.2 | 总控、准入、metadata 回填、catalog 冻结、block dispatch |
| `02-block-composition-ratio-diversity.md` | S4.3 | composition、ratio、diversity、差异丰度 |
| `03-block-pathway-program.md` | S4.4 | pathway/program activity |
| `04-block-tf-regulon.md` | S4.5 | TF/regulon activity、SCENIC/RSS |
| `05-block-de-gsea-ora.md` | S4.6 | R/NR DE、GSEA、ORA，解释性 |
| `06-block-cell-communication.md` | S4.7 | LIANA/CellChat/CellPhoneDB communication |
| `07-block-pseudobulk-hvg-module.md` | S4.8 | pseudobulk、HVG、module |
| `08-block-state-multiomics.md` | S4.9-S4.10 | tumor/immune/CAF state 和外部组学 |
| `09-post-integration-screen-delivery.md` | S4.11-S4.fig | 矩阵整合、全局筛选、Section 5 输入包、图包 |
| `04-mapreduce-run-prompt.txt` | 全流程 | 分块运行 prompt 模板 |

## 推荐运行顺序

1. 运行 `01-orchestrator-preflight-catalog.md`，生成冻结输入、统合 catalog 和 block dispatch manifest。
2. 可并发运行以下 block：`02`、`03`、`04`、`05`、`06`、`07`。每个 block 只能写自己的 `work/features/blocks/<block_id>/`、规定 substep 输出和自己的 QC，不得改写其他 block 输出。
3. `08-block-state-multiomics.md` 依赖 composition、pathway/program、TF、communication、HVG/module 的可用输出，建议在上述 block 结束后运行。
4. 运行 `09-post-integration-screen-delivery.md`，合并 block 输出、做 gate、输出 Section 5 输入包和 Fig_S5 图包。

## Block 通用输入合同

每个 block 必须只读以下冻结文件：

- `work/features/mapreduce/frozen_inputs/block_dispatch_manifest.tsv`
- `work/features/mapreduce/frozen_inputs/patient_manifest_frozen.tsv`
- `work/features/mapreduce/frozen_inputs/eligible_cell_manifest.tsv`
- `work/features/mapreduce/frozen_inputs/h5ad_manifest_frozen.tsv`
- `work/features/feature_catalog.tsv`
- `work/features/data_based_feature_catalog.tsv`
- `work/features/research_based_feature_realization.tsv`
- Section 3 handoff h5ad 和 manifest，只读。

如果冻结文件缺失、hash 不匹配、schema 不匹配或 upstream QC 不 clean，block 必须停止并写 fatal issue，不得自行修复上游。

## Block 通用输出合同

每个 block 必须优先写入模块目录：

`work/features/<module>/`

模块名固定为 `composition`、`pathway_program`、`tf_regulon`、`de_gsea_ora`、`communication`、`pseudobulk_hvg`、`state_multiomics`。每个模块目录必须包含 `<module>_summary.tsv` 和 `<module>_summary.md`，并按 `00-output-structure-contract.md` 输出 manifest、matrix、meta、QC、gate、screen、candidate 和 issue 文件。

原 `work/features/blocks/<block_id>/` 可作为运行时兼容镜像，但不得作为唯一 summary 位置。

每个 block 至少输出：

- `work/features/blocks/<block_id>/block_status.tsv`
- `work/features/blocks/<block_id>/block_feature_matrix.tsv.gz`
- `work/features/blocks/<block_id>/block_feature_meta.tsv`
- `work/features/blocks/<block_id>/block_feature_qc.tsv`
- `work/features/blocks/<block_id>/block_gate_log.tsv`
- `work/features/blocks/<block_id>/block_response_screen.tsv`
- `work/features/blocks/<block_id>/block_screened_candidates.tsv`
- `work/features/blocks/<block_id>/block_run_manifest.tsv`
- `work/features/blocks/<block_id>/block_issue_list.tsv`

同时按原 skill 写入该 substep 的正式输出位置，例如 `work/features/substeps/*`、`work/features/qc/*`、`work/features/explanatory/*`。

## 块内局部漏斗

所有 block 在 raw feature 计算后执行相同的局部漏斗：

1. Label-free gate：仅允许 `raw_biological_numeric` 入场；检查支持度、缺失率、近零方差、重复 patient-feature、patient_key/patient_id 一致性、表达层和工具 provenance。
2. 宽松 R/NR 单因素 gate：Wilcoxon、logistic regression 或合适的 rank test，输出 p、FDR、effect size、AUC、direction；默认 `FDR < 0.25` 进入 `block_screened_candidates.tsv`。
3. 块内 ElasticNet：若 label-free gate 后 `p <= 50`，跳过并记录 `skipped_green_channel`；若 `p > 50`，运行标准化 logistic ElasticNet，`alpha=0.5`，交叉验证选择 lambda，非零系数进入候选。
4. 所有单因素/ElasticNet 候选均标记 `response_aware=True` 和 `requires_trainfold_recompute=True`。

## 必进方向

在 strict 正式模式中，以下方向都应至少有一个 `raw_biological_numeric` 特征进入 raw 漏斗，除非真实工具、数据库或输入缺失并触发 fail-closed：

- composition / ratio / diversity
- pathway / program activity
- TF / regulon activity
- cell communication class
- pseudobulk / HVG module
- tumor state
- immune state
- CAF state
- research-based realization

DE-GSEA/ORA 和 differential communication 是必做 `response_derived` 解释性方向，不进入 raw 漏斗。

## 完成标准

分块运行结束后必须满足：

- 每个 block 的 `block_status.tsv` 为 `completed` 或有明确 fatal/blocked reason。
- `feature_axis_coverage_qc.tsv` 说明 all/major/subtype/major_pair/subtype_pair 覆盖。
- `feature_gate_log.tsv` 一行一个 feature，不重复计数。
- `response_derived` 与 `qc_only` 字段未进入 raw/ElasticNet/LASSO/Boruta biomarker matrix。
- Section 5 输入包生成，但未执行 Section 5 建模、正式 AUC、正式 SHAP、LODO、DMI 或 ablation 结论。
