---
name: 04-subskill-block-cell-communication
description: Section 4 Map-Reduce block S4.7。独立运行真实 communication 工具，输出 major_pair 和 subtype_pair LR pair/class 特征，并执行块内局部自净。
type: reference
---

# Block S4.7 Cell Communication

## Block ID

`S4B_CELL_COMMUNICATION`

## 输入

只读：

- `work/features/mapreduce/frozen_inputs/*`
- `work/features/feature_catalog.tsv`
- `work/features/data_based_feature_catalog.tsv`
- Section 3 handoff h5ad
- `assets/dataset/communication/liana_consensus_lr_resource.tsv`
- `assets/dataset/communication/liana_cellphonedb_lr_resource.tsv`
- `assets/dataset/communication/liana_cellchatdb_lr_resource.tsv`
- `assets/dataset/cellphonedb/cellphonedb.zip`

严禁使用共表达 proxy 冒充 communication。严禁调用 `liana.select_resource("omnipath")`。

## 算法优先级

1. LIANA Python：固定使用本地可审计资源名 `consensus`，可对照 `cellphonedb`、`cellchatdb`。
2. R CellChat：记录 CellChatDB 版本与参数。
3. CellPhoneDB Python API：使用本地 `cellphonedb.zip`，不依赖 CLI。

必须记录 LR database 版本、路径、hash、工具版本、参数和运行状态。

## 计算粒度

必须输出两层 pair axis：

- `major_pair`：所有满足支持度的 source major -> target major。
- `subtype_pair`：所有满足支持度的 source subtype -> target subtype，允许跨 major。

重点覆盖：

- CAF/Fibroblast/myoCAF/iCAF/apCAF -> T/NK/Myeloid/Cancer/Epithelial/Endothelial/Pericyte。
- T/NK/Myeloid/DC -> CAF/Fibroblast/myoCAF/iCAF/apCAF。
- Cancer/Epithelial -> CAF/immune/stroma。

最小支持：

- source 和 target 每个 patient 至少 10-20 个 eligible cells，具体阈值写入 `minimum_support_rule`。
- 不满足时 patient-level feature 记 NA，并写 missing reason。
- major_pair 和 subtype_pair 必须分别统计成功、跳过、失败数量。

## 输出特征

Pair-level：

- `lr__major_pair__<source_major>__<target_major>__<ligand>__<receptor>`
- `lr__subtype_pair__<source_subtype>__<target_subtype>__<ligand>__<receptor>`
- 作为 label-free communication score，属于 `raw_biological_numeric`，进入块内漏斗。

Class-level：

- `lrclass__major_pair__<source_major>__<target_major>__<class>`
- `lrclass__subtype_pair__<source_subtype>__<target_subtype>__<class>`
- 作为 label-free class score，属于 `raw_biological_numeric`，进入块内漏斗。

固定 class 至少包含：

- `CHEMOKINE`
- `TGFB`
- `COLLAGEN_ECM`
- `CHECKPOINT`
- `VEGF`
- `IL6`
- `MIF`
- `SPP1`

固定 class 无命中时必须输出 NA/support reason，不能静默消失。

Differential LR 是 `response_derived`，不得进入 raw feature 漏斗。

## 块内局部自净

Label-free gate：

- 工具是否真实运行。
- LR database hash。
- source/target cell 支持。
- pair axis 覆盖。
- patient-feature 唯一性。
- 缺失率、近零方差、单 dataset 信号。
- class feature 与 pair feature 区分。

Response-aware 粗筛：

- 对 class 和 pair 分别做 R/NR rank test。
- 输出 `communication_response_diff.tsv` 和 `communication_pair_response_diff.tsv`。
- `FDR < 0.25` 的 raw communication score 进入 block candidate；differential LR 统计量仍为 `response_derived`，不得入场。

Dynamic L1/L2：

- class-level 若 `p <= 50` 可跳过 ElasticNet。
- pair-level 通常 `p > 50`，必须触发 logistic ElasticNet `alpha=0.5`。
- pair-level response-aware candidates 标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。

## 输出

模块目录主输出：

- `work/features/communication/communication_summary.tsv`
- `work/features/communication/communication_summary.md`
- `work/features/communication/communication_manifest.tsv`
- `work/features/communication/communication_feature_matrix.tsv.gz`
- `work/features/communication/communication_feature_meta.tsv`
- `work/features/communication/communication_feature_qc.tsv`
- `work/features/communication/communication_gate_log.tsv`
- `work/features/communication/communication_response_screen.tsv`
- `work/features/communication/communication_candidate_features.tsv`
- `work/features/communication/communication_issue_list.tsv`

正式 substep 输出：

- `work/communication/communication_matrix_diagnostics.tsv`
- `work/communication/communication_tool_run_manifest.tsv`
- `work/features/substeps/communication_features_patient.tsv`
- `work/features/substeps/communication_class_features_patient.tsv`
- `work/features/explanatory/communication_response_diff.tsv`
- `work/features/explanatory/communication_pair_response_diff.tsv`
- `work/features/qc/communication_feature_qc.tsv`
- `work/features/qc/communication_axis_pair_support_qc.tsv`

Block 输出：

- `work/features/blocks/S4B_CELL_COMMUNICATION/block_status.tsv`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_feature_matrix.tsv.gz`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_feature_meta.tsv`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_feature_qc.tsv`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_gate_log.tsv`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_response_screen.tsv`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_screened_candidates.tsv`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_run_manifest.tsv`
- `work/features/blocks/S4B_CELL_COMMUNICATION/block_issue_list.tsv`

完成后更新 `work/features/process/section4_process_index.tsv`。
