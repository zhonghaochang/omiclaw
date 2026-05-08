---
name: 04-feature-engineering-major-only
description: Section 4 变体：Major-only 特征工程。严格读取 03d Section 4-ready handoff，但仅以 TopLevel_Compartment 与 Major_CellType 为正式分组轴，优先构建 CAF major 与免疫/肿瘤上下文特征，用于 subtype 质量不稳定或希望快速稳健建模的场景。
type: reference
---

## 固定运行环境与资源路径（Major-only 强制继承）

Major-only 模式必须继承 full hierarchy Section4 的固定环境和资源，不得单独选择临时环境：

- 固定 Rscript：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite/bin/Rscript`
- Section4 Python：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-python/bin/python`
- scCODA Python：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-sccoda/bin/python`
- pySCENIC CLI：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-python/bin/pyscenic`
- MSigDB：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/dataset/msigdb`
- Regulon/TF：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/dataset/regulon`
- Communication：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/dataset/communication` 与 `assets/dataset/cellphonedb/cellphonedb.zip`
- pySCENIC resources：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/dataset/pyscenic`
- 环境 README：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/README.md`

Major-only 通信模块同样不得调用 `liana.select_resource("omnipath")`。LIANA 只使用当前已验证的 `consensus/cellphonedb/cellchatdb` 资源；CellPhoneDB 只使用 Python API + 本地 zip；pySCENIC 只使用 hg38 v10 clustered ranking 与 v10nr motif annotation。

# Section 4 变体：Major-only 特征工程

## 适用场景

当任务满足以下任一条件时，可使用本规范替代 `04-feature-engineering.md`：

- 当前研究重点是 CAF/Fibroblast major 对 ICB response 的预测作用
- Section 3 的 major 注释已通过 QC，但 subtype 注释仍需保守使用
- 需要先形成稳健、低维、可解释的 major-level patient 特征矩阵
- 需要减少 subtype 稀疏性、低细胞数和跨数据集 subtype 命名差异带来的噪声

同一正式 run 中只能选择：

- `04-feature-engineering.md`
- 或本规范 `04-feature-engineering-major-only.md`

两者不得混用。若使用本规范，主输出仍必须写 `work/features/fibro_features.tsv`，以保持 Section 5 兼容；同时额外写 `work/features/fibro_features_major_only.tsv` 作为模式标识副本。

## 核心差异

| 项 | Full hierarchy | Major-only |
|---|---|---|
| 正式 grouping key | `Cell_Subtype` + `Major_CellType` + `TopLevel_Compartment` | `Major_CellType` + `TopLevel_Compartment` |
| subtype fraction | 计算 | 不进入正式特征；只做 QC |
| CAF 特征 | subtype fraction + CAF programs | Fibroblast major 内 program/pathway/module |
| 通讯粒度 | major-major，可选 subtype-subtype | major-major |
| 输出规模 | 约 `1500-3000` raw features | 约 `500-1500` raw features |
| 优先目标 | 全类群细粒度机制 | 稳健主模型与 CAF major 机制 |

Major-only 不等于忽略 `Cell_Subtype`。Section 4 仍必须验证 `Cell_Subtype` 存在并与 `Primary_Cell_Annotation` 一致，但不得把 subtype label 作为正式 feature denominator 或 group key。

## 输入与 handoff

输入、blocked run 边界、Section 3 QC fail-closed、表达 layer、eligibility、metadata backfill 与 `04-feature-engineering.md` 完全一致。

必须读取：

- `work/section4_input/merged.section3_for_section4.h5ad`
- `work/section4_input/per_dataset/<dataset>.section3_for_section4.h5ad`
- `work/section4_input/section4_h5ad_export_manifest.tsv`
- `work/section4_input/section4_obs_schema.tsv`
- `work/section4_input/section4_feature_eligibility.tsv`
- `work/qc/section3_section4_handoff_qc.tsv`
- Section 1 `manifest.tsv`

必须验证：

- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Primary_Cell_Annotation`
- `Primary_Cell_Annotation_Level`
- `Raw_Label_Primary`
- `discard_flag`
- `exclude_from_feature_engineering`
- `section4_ready`

不得在 Section 4 修改任何注释列。

## Major-only Substep 总览

| Substep | 名称 | 主要输出 |
|---|---|---|
| S4M.0 | handoff 与 major schema 审计 | `major_only_preflight_qc.tsv` |
| S4M.1 | metadata backfill | `feature_metadata_backfill_audit.tsv` |
| S4M.2 | major-only feature catalog | `feature_catalog_major_only.tsv` |
| S4M.3 | Top/major 组成与 diversity | `major_composition_features_patient.tsv` |
| S4M.4 | Major 内 program/pathway activity | `major_program_pathway_features_patient.tsv` |
| S4M.5 | Major-major communication | `major_communication_features_patient.tsv` 或 blocked diagnostics |
| S4M.6 | Major 内 TF/regulon activity | `major_tf_activity_features_patient.tsv` 或 blocked diagnostics |
| S4M.7 | Major pseudobulk/HVG module | `major_pseudobulk_module_features_patient.tsv` |
| S4M.8 | Tumor/CNV/antigen context | `major_tumor_cnv_antigen_features_patient.tsv` |
| S4M.9 | gate、screening、Section 5 input | `fibro_features.tsv`、screening 与 Section 5 bundle |

## Feature catalog major-only 规则

## Research-based 与 Data-based major-only catalog

Research-based 特征只允许来自：

- `assets/transcriptome_feature.tsv`

不得在 major-only 模式下运行时重新检索论文、阅读 `pubmed_document.csv`、阅读 `wos_document.csv`、或根据 `read_papers.tsv` 自行生成新的文献特征。`read_papers.tsv` 只允许作为已存在 PMID 的 provenance 审计。

major-only 也必须对 `transcriptome_feature.tsv` 每一行尽可能尝试实例化：

- 能转成 major-level composition、Fibroblast major 内 program、major-level pathway、major-major communication、major pseudobulk 或真实外部 multiomics 的，尽量计算。
- 依赖 subtype fraction 的文献特征不得直接使用 `Cell_Subtype` 计算，可转化为 Fibroblast major 内 gene program；无法转化时标记 blocked。
- 缺少公式、gene set、权重、外部组学或真实工具时，必须标记 blocked/context-only/not_available；不强求计算，不得伪造 proxy。

Data-based major-only 特征必须使用固定 `data_feature_class`：

- `major_composition`
- `major_diversity`
- `fibroblast_major_program`
- `immune_major_program`
- `tumor_cnv_antigen`
- `major_pathway`
- `major_communication`
- `major_tf_regulon`
- `major_pseudobulk_module`
- `multiomics`
- `interaction`

必须输出：

- `work/features/research_based_feature_realization.tsv`
- `work/features/data_based_feature_catalog.tsv`
- `work/features/checkpoints/feature_catalog_summary_checkpoint.tsv`
- `work/features/checkpoints/S4M.2_feature_catalog_READY`

`feature_catalog_summary_checkpoint.tsv` 至少记录 `feature_origin, data_feature_class, feature_input_class, enter_funnel, n_planned, n_computable, n_blocked, n_raw_biological_numeric, n_response_derived, n_qc_only, blocked_reason_top, checkpoint_status`。若该 checkpoint 缺失，不得进入 S4M.3。

`feature_catalog_major_only.tsv` 至少包含：

- `feature_id`
- `feature_name`
- `feature_origin`
- `feature_family`
- `data_feature_class`
- `research_feature_name`
- `research_variant_type`
- `source_major`
- `target_major`
- `denominator`
- `aggregation_method`
- `expression_layer`
- `gene_set`
- `tool`
- `formula`
- `literature_source`
- `feature_input_class`
- `enter_funnel`
- `response_aware`
- `requires_trainfold_recompute`
- `post_funnel_status`
- `mechanism_only`
- `feature_group_for_ablation`
- `subtype_label_used`

`subtype_label_used` 在正式 trainable feature 中必须为 `False`。若某文献特征天然是 subtype fraction，例如 `fmo2_positive_caf_fraction`，major-only 模式不得使用 Section 3 subtype label 直接计算；只能转化为 `Fibroblast major 内 FMO2/CCL19 program score` 或标记 `not_computed_due_to_subtype_dependency`。

Major-only 同样采用二元入场：`raw_biological_numeric` 且 `enter_funnel=True` 的 label-free major-level 生物学数值进入统一漏斗；`response_derived` 与 `qc_only` 禁止进入漏斗。不得用人工等级在入场前丢弃可计算 raw 特征。

## Major-only 特征体系

### 1. Top/major 组成

必须计算：

- `TopLevel_Compartment` fractions
- 所有实际出现 `Major_CellType` fractions
- `Fibroblast` fraction in all eligible cells
- `Fibroblast` fraction in nonimmune
- `Fibroblast` fraction in stroma
- `Cancer_cell` / `Epithelial` fraction
- `T_cell`、`NK_cell`、`B_cell`、`Myeloid`、`Endothelial`、`Pericyte` fractions
- major-level Shannon/Simpson diversity
- dominant major fraction

禁止：

- `iCAF_frac`、`myoCAF_frac`、`apCAF_frac` 这类 subtype fraction 进入正式 major-only feature
- 把 absolute cell count 作为 trainable feature

### 2. Fibroblast major 内 program

在 `Major_CellType == Fibroblast` 的 eligible cells 内计算：

- Fibroblast core ECM
- iCAF-like inflammatory program
- myoCAF-like contractile program
- apCAF-like antigen presentation program
- DCN/desmoplastic program
- FMO2/CCL19/TLS-recruiting program
- FRZB/SPARC/FKBP10 nonresponse risk program
- ECM/collagen remodeling
- TGF-beta/EMT stroma program
- IL6/JAK/STAT3 inflammatory stroma program
- hypoxia/angiogenesis support program

这些是 gene program score，不是 subtype label fraction。

### 3. 免疫与肿瘤 major context

在 major 内计算：

- T cell：cytotoxic、exhaustion、TCF7/memory-like、Treg-suppressive program
- NK cell：cytotoxic/resting program
- Myeloid：M1-like、M2-like、TREM2/APOE/C1QC TAM、mregDC-like program
- B cell：B/plasma/TLS support program
- Cancer/Epithelial：CNV score、HLA class I/II、antigen presentation、IFNG response、CD274/PDCD1LG2、class I loss proxy
- Endothelial/Pericyte：angiogenesis、vascular/perivascular program

### 4. Pathway activity

所有 pathway 均按 major 聚合，优先覆盖：

- TGF-beta
- EMT
- ECM receptor interaction
- collagen formation/degradation
- focal adhesion
- angiogenesis/VEGF
- hypoxia
- IL6-JAK-STAT3
- TNFA-NFKB
- IFNG/IFNA response
- antigen presentation
- chemokine signaling
- WNT/beta-catenin
- complement/coagulation

### 5. Major-major communication

只计算 major-major communication。重点轴：

- `Fibroblast -> T_cell`
- `Fibroblast -> NK_cell`
- `Fibroblast -> Myeloid`
- `Fibroblast -> Cancer_cell`
- `Fibroblast -> Epithelial`
- `Fibroblast -> Endothelial`
- `Myeloid -> T_cell`
- `Cancer_cell/Epithelial -> T_cell/NK_cell/Myeloid/Fibroblast`

必须来自真实工具。若未运行 LIANA、CellChat 或 CellPhoneDB Python API 等真实工具，只输出 blocked diagnostics；不得使用共表达 proxy。LIANA 必须使用已验证资源名 `consensus/cellphonedb/cellchatdb`，不得调用不存在的 `omnipath` 资源名。

通信类别至少包括：

- `CHEMOKINE`
- `TGFB`
- `COLLAGEN_ECM`
- `CHECKPOINT`
- `IL6`
- `MIF`
- `SPP1`
- `VEGF`

### 6. TF/regulon

按 major 计算 regulon activity。若没有真实 regulon 工具或 resource，必须 blocked。不得用 TF mRNA 伪装为 regulon feature。

### 7. Major pseudobulk/HVG module

只做 major-level pseudobulk：

- `Fibroblast`
- `T_cell`
- `NK_cell`
- `Myeloid`
- `B_cell`
- `Cancer_cell`
- `Epithelial`
- `Endothelial`
- `Pericyte`

每个 major 的 raw gene-level 候选不超过 `100`，优先来自 marker、文献、HVG、ICB 机制基因。更多表达信息必须降为 module。

## Gate 与探索性筛选

沿用 `04-feature-engineering.md` 的 mandatory gate：

- zero variance
- high missingness
- too few patients
- too few datasets
- single dataset signal
- near duplicate
- insufficient source cells
- forbidden primary feature
- response leakage
- blocked tool not run

探索性单因素筛选同样只输出：

- `work/features/screening/univariate_response_screen.tsv`
- `work/features/screening/significant_features_exploratory.tsv`

该显著表不得作为 Section 5 primary model 的全数据 whitelist；Section 5 若 response-aware 选择特征，必须在 training fold 内重做。

## Section 5 输入包

必须输出与 full hierarchy 模式同名文件：

- `work/features/section5/section5_input_matrix.tsv.gz`
- `work/features/section5/section5_feature_dictionary.tsv`
- `work/features/section5/section5_feature_groups.tsv`
- `work/features/section5/section5_lodo_folds.tsv`
- `work/features/section5/section5_ablation_plan.tsv`
- `work/features/section5/section5_auc_plot_input_template.tsv`
- `work/features/section5/section5_shap_input_manifest.tsv`
- `work/features/section5/section5_dmi_input_matrix.tsv.gz`
- `work/features/section5/section5_modeling_readiness_qc.tsv`

推荐 ablation group：

- `major_composition`
- `fibroblast_major_program`
- `immune_major_program`
- `tumor_cnv_antigen`
- `major_pathway`
- `major_communication`
- `major_tf_regulon`
- `major_pseudobulk_module`
- `multiomics`
- `research_based_major_signature`

## 输出

| 文件 | 内容 |
|---|---|
| `fibro_features.tsv` | Section 5 兼容主分析 patient-level 特征表 |
| `fibro_features_major_only.tsv` | major-only 模式副本 |
| `fibro_features_mechanism.tsv` | 机制分析 patient-level 特征表 |
| `feature_catalog_major_only.tsv` | major-only 统合特征目录 |
| `research_based_feature_realization.tsv` | Research-based 既有文献特征逐行可计算化状态 |
| `data_based_feature_catalog.tsv` | Data-based major-only 特征结构化 catalog |
| `feature_catalog_summary_checkpoint.tsv` | Research/Data feature catalog 汇总 checkpoint |
| `fibro_feature_meta.tsv` | 特征定义、来源、公式、可入模状态 |
| `fibro_feature_qc.tsv` | 缺失率、支持度、gate 状态 |
| `feature_gate_log.tsv` | gate 原因 |
| `univariate_response_screen.tsv` | 探索性单因素 response 相关分析 |
| `significant_features_exploratory.tsv` | 探索性显著相关特征 |
| `section5/*` | Section 5 AUC/SHAP/DMI/LODO/ablation 输入包 |

## 完成检查

- [ ] Section 3 handoff clean；若 blocked，仅 schema dry-run
- [ ] 已验证 required obs、eligibility、layer、gene-axis
- [ ] `Cell_Subtype` 已审计但未作为正式 grouping key
- [ ] `transcriptome_feature.tsv` 中每个 Research-based 特征均已进入 `research_based_feature_realization.tsv`，可计算者尽量计算，信息不足者显式 blocked/context-only
- [ ] Data-based major-only 特征已进入 `data_based_feature_catalog.tsv`，并使用固定 `data_feature_class` 结构
- [ ] `feature_catalog_summary_checkpoint.tsv` 与 `S4M.2_feature_catalog_READY` 已输出
- [ ] 所有正式 feature 的 `source_cell_axis` 为 `TopLevel_Compartment` 或 `Major_CellType`
- [ ] Fibroblast major 内 CAF program 已计算，且不是 subtype fraction
- [ ] 免疫、肿瘤、血管和基质 major context 已计算
- [ ] communication 与 TF/regulon 若未真实运行，已显式 blocked
- [ ] `fibro_features.tsv` 与主 manifest patient 数完全一致
- [ ] `fibro_features_major_only.tsv` 已输出
- [ ] 块内宽松单因素 gate + ElasticNet、块外严格 LASSO + Boruta 已输出；所有 response-aware 候选均标记 `requires_trainfold_recompute=True`
- [ ] Section 5 输入包已输出
- [ ] `Fig_S5*` 图包已生成，caption 标明 major-only 模式
