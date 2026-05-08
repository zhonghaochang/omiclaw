---
name: 04-feature-engineering
description: Section 4：全层次全类群单细胞优先特征工程。严格读取 Section 3 handoff 与既有 Research-based 特征表，将 label-free 的客观生物学数值统一作为 raw_biological_numeric 入场特征，排除 response_derived 与 qc_only 字段，按“块内宽松单因素 gate + ElasticNet、块外严格 LASSO + Boruta”生成 patient-level 特征、解释性 R/NR 结果、QC 协变量和 Section 5 输入包；不重跑 Section 1/2/3，不执行 Section 5 建模。
type: reference
---

## 固定运行环境与资源路径（Section4 强制使用）

Section4 必须优先使用以下固定路径，避免 agent 根据临时环境自行猜测依赖位置。若这些路径不存在或 QC 不通过，strict 正式 run 必须 fail-closed，不得临时换工具、换数据库或用 proxy 冒充。

- Skill 根目录：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill`
- 固定 R 环境：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite`
- 固定 Rscript：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite/bin/Rscript`
- R 源码编译工具链：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-build-tools`
- Section4 Python 环境：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-python/bin/python`
- scCODA 独立 CPU 环境：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-sccoda/bin/python`
- pySCENIC CLI：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-python/bin/pyscenic`
- Section4 数据库目录：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/dataset`
- 环境说明与复现实用命令：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/README.md`

固定数据库/资源路径：

- MSigDB/GO GMT：`assets/dataset/msigdb/msigdb_hs_hallmark_v2025.1.gmt`、`msigdb_hs_kegg_legacy_v2025.1.gmt`、`msigdb_hs_kegg_medicus_v2025.1.gmt`、`msigdb_hs_reactome_v2025.1.gmt`、`go_bp_org_hs_eg_db_3.18.0.gmt`、`go_mf_org_hs_eg_db_3.18.0.gmt`、`go_cc_org_hs_eg_db_3.18.0.gmt`
- Regulon/TF：`assets/dataset/regulon/collectri_human.tsv`、`dorothea_human_abc.tsv`、`progeny_human_top500.tsv`
- LIANA LR：`assets/dataset/communication/liana_consensus_lr_resource.tsv`、`liana_cellphonedb_lr_resource.tsv`、`liana_cellchatdb_lr_resource.tsv`
- CellPhoneDB：`assets/dataset/cellphonedb/cellphonedb.zip`，运行时使用 Python API，不假定存在 `cellphonedb` CLI。
- pySCENIC cisTarget：`assets/dataset/pyscenic/hg38_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather`、`hg38_500bp_up_100bp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather`、`motifs-v10nr_clust-nr.hgnc-m0.001-o0.0.tbl`

通信模块不得调用 `liana.select_resource("omnipath")`，因为当前 LIANA 1.5.1 本地可用资源名不包含 `omnipath`。优先使用 `consensus`，并可审计地对照 `cellphonedb`、`cellchatdb`。若选择 CellPhoneDB 路线，必须调用 `cellphonedb.src.core.methods.cpdb_statistical_analysis_method.call(...)` 或 `cpdb_analysis_method.call(...)` 并显式传入本地 `cellphonedb.zip`。

pySCENIC 增强路线固定为 hg38 gene-based v10 clustered ranking 与 v10nr motif annotation；不得混用旧 mc9nr URL、其他 genome 或未记录 hash 的 ranking 数据库。

运行 R 代码时应显式设置：

```bash
export PATH=/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-build-tools/bin:$PATH
export LD_LIBRARY_PATH=/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/software/section4-build-tools/lib:$LD_LIBRARY_PATH
/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite/bin/Rscript <script.R>
```

当前已验证可用的 Section4 关键包/工具包括：R `Seurat`, `SingleCellExperiment`, `edgeR`, `limma`, `GSVA`, `AUCell`, `UCell`, `fgsea`, `clusterProfiler`, `enrichplot`, `ComplexHeatmap`, `CellChat`, `speckle`, `miloR`, `msigdbr`, `org.Hs.eg.db`, `circlize`, `igraph`, `svglite`, `systemfonts`；Python `scanpy`, `anndata`, `decoupler`, `gseapy`, `liana`, `omnipath`, `cellphonedb`, `pyscenic`；独立 scCODA 环境 `sccoda`。

# Section 4：全层次全类群特征工程

## 主旨

Section 4 的目标是把 Section 3 交付的 cell-level 注释与表达矩阵，转化为严密、可审计、patient-level 的特征体系。所有特征必须来自固定 catalog、固定输入和固定算法优先级；不得由 agent 运行时临场发明。

层级语义必须固定：`patient` 是统计、R/NR 比较和 Section 5 建模单位；`All / Major / Subtype` 是特征生成轴。不得把“patient-level 输出”误解为只允许一个全局 patient 平均分。除 composition 外，pathway/program、TF/regulon、HVG/module 和 communication 也必须尽可能保留层级标签：

- `all`：全 eligible cells 或 patient-level whole-TME pseudobulk。
- `major`：每个 `Major_CellType` 的 patient × major 特征。
- `subtype`：每个 `Cell_Subtype` 的 patient × subtype 特征。
- `major_pair`：communication source-major → target-major。
- `subtype_pair`：communication source-subtype → target-subtype，允许跨 major。

矩阵最终仍是一行一个 patient；层级写入 feature_id，例如 `path__major__Fibroblast__HALLMARK_TGF_BETA_SIGNALING`、`tf__subtype__myoCAF__SMAD3`、`lrclass__subtype__myoCAF__Exhausted_CD8__TGFB`。

本节必须同时满足四个原则：

1. 每个主要生物方向至少提供可计算的 `raw_biological_numeric` 特征；只要是 label-free、客观、patient-level 可数值化的生物学特征，不分低维/高维/贵贱，均进入统一筛查漏斗。
2. 优先调用单细胞层面算法或单细胞生态中成熟方法，但最终建模单位必须是 `patient`，特征列必须保留 `all/major/subtype/pair` 生成层级。
3. `dataset_id`、`patient_id`、`treatment_type`、`n_cells_total`、平台、route、QC flag 等只进入 `qc_only/covariate`，不得进入生物特征筛查漏斗。
4. R/NR 相关分析、DE-GSEA、ORA、differential communication、单因素统计量、LASSO 系数和 Boruta 状态属于 `response_derived` 解释性结果；不得作为 raw predictor 输入漏斗。

## 固定运行范围

- 只执行 Section 4。
- 不重跑 Section 1/2/3。
- 不继续执行 Section 5/6/7。
- 不修改输入 Section 3 run。
- 不改写 `TopLevel_Compartment`、`Major_CellType`、`Cell_Subtype`、`Raw_Label_Primary`。
- 不使用 Harmony embedding、整合矩阵或批次校正 embedding 计算表达特征。
- 不读取旧 Section 4 run 的 feature matrix、cache 或脚本冒充本轮输出。

默认模式为 `full_hierarchy_all_classes`。若用户显式要求 major-only，才读取 `04-feature-engineering-major-only.md`；两种模式不得在同一正式 run 混用。

固定 R 环境：

`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite`

所有 R 包检查和 R 脚本调用必须优先使用该环境的 `bin/Rscript`。

## 输入接口

### Section 3 handoff

正式输入优先级：

1. `work/section4_input/merged.section3_for_section4.h5ad`
2. `work/section4_input/per_dataset/<dataset>.section3_for_section4.h5ad`
3. `work/section4_input/section4_h5ad_export_manifest.tsv`
4. `work/section4_input/section4_obs_schema.tsv`
5. `work/section4_input/section4_feature_eligibility.tsv`
6. `work/qc/section3_section4_handoff_qc.tsv`
7. `work/qc/section3_qc_report.md`
8. `work/qc/section3_issue_list.tsv`
9. `work/process/process_index.tsv` 或 `work/process_index.tsv`

`per_dataset/*.section3_for_section4.h5ad` 是正式计算入口；`merged.section3_for_section4.h5ad` 只用于 schema、分布和一致性审计。

若 Section 3 QC 文件的结构化结论显示 failed、blocked、hard fail、ERROR 或 unresolved critical issue，正式生产必须停止并写：

`ERROR: upstream_section3_not_clean`

QC 判断必须读取上下文或表格状态，不得仅因标题文字误判。例如 `## Hard Fail Checks` 后接 `- none` 表示无 hard fail，不是阻断项。若无法解析 QC 状态，停止并写 `ERROR: upstream_section3_qc_status_ambiguous`。

只有 `schema_dry_run_only=True` 时允许读取 blocked run 做结构测试；该模式不得输出正式 `fibro_features.tsv` 或 Section 5 输入包。

### 必须验证的 obs 列

- `cell_id`
- `dataset_id`
- `source_sample_id`
- `source_lesion_id`
- `patient_id`
- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Raw_Label_Primary`
- `Primary_Cell_Annotation`
- `Primary_Cell_Annotation_Level`
- `section3_major_cluster_id`
- `section4_subtype_cluster_id`
- `Annotation_Method`
- `annotation_confidence`
- `discard_flag`
- `exclude_from_feature_engineering`
- `section4_ready`

兼容额外列，例如 `CNV_Score`、`Epithelial_CNV_Label`、`score_*`、`raw_subtype_label_*`。这些列可作为 QC 或特征来源，但不得用于重命名正式注释。

### handoff 语义

- `Primary_Cell_Annotation == Cell_Subtype`
- `Primary_Cell_Annotation_Level == subtype`
- `discard_flag=True` 的细胞默认不得参与特征计算。
- `exclude_from_feature_engineering=True` 的细胞不得参与特征计算。
- 只有 `section4_feature_eligibility.tsv` 中 `eligibility_status=eligible` 且 obs 标志一致的细胞可参与正式特征汇总。
- eligibility 表与 obs 标志冲突时停止：`ERROR: section4_eligibility_conflict`

### 表达矩阵

- `counts` layer：pseudobulk、HVG、部分 communication 工具输入。
- `lognorm` layer：program/pathway score、UCell/AUCell/decoupler 类连续分数。
- 若缺 `lognorm` 但 `X` 可证明为 log-normalized，可使用 `X`，并写 `feature_matrix_layer_audit.tsv`。
- 若无法确认表达层，停止：`ERROR: ambiguous_expression_layer`
- 必须审计 gene symbol 轴；核心 marker 如 `ACTA2/COL1A1/CD8A/PTPRC/EPCAM/HLA-DRA` 大面积缺失时停止：`ERROR: Gene_Symbol_Alignment_Failed`

### H5AD 读取兼容 shim

当前 Section 3 handoff h5ad 可能包含 `/uns/log1p/base` 的 `encoding_type='null'` 元数据。若固定 Python 环境的 `anndata.read_h5ad(..., backed='r')` 报 `IORegistryError` 且错误指向 `uns/log1p/base` 或 `IOSpec(encoding_type='null', encoding_version='0.1.0')`，Section 4 必须在读入前注册只读兼容 reader 后重试：

```python
import h5py
from anndata._io.specs.registry import _REGISTRY, IOSpec

try:
    @_REGISTRY.register_read(h5py.Dataset, IOSpec('null', '0.1.0'))
    def _section4_read_null_dataset(elem, *, _reader):
        return None
except Exception:
    pass
```

该 shim 只影响内存中的 reader registry，不修改输入 h5ad，不改变表达矩阵、obs、var 或 layer。正式 run 必须在 `section4_h5ad_layer_audit.tsv` 记录 `h5ad_null_iospec_shim_applied=True/False`。若注册后仍无法读取，停止：`ERROR: h5ad_read_failed_after_null_iospec_shim`。

### Research-based 既有特征

唯一 Research-based 输入：

`assets/transcriptome_feature.tsv`

不得运行时重新检索论文、阅读 `pubmed_document.csv`、阅读 `wos_document.csv`，或根据 `read_papers.tsv` 新增文献特征。`read_papers.tsv` 只允许做 provenance 审计。

`transcriptome_feature.tsv` 每一行都必须进入 `research_based_feature_realization.tsv`。能由单细胞表达、composition、program/pathway、communication、TF activity、pseudobulk/HVG 或真实外部组学实现的特征应尽可能计算；信息不足者必须显式 `blocked/context_only/not_available`，不得填 0 或伪造 proxy。`computed` 或 `computed_partial` 必须对应真实计算结果、映射到既有 data-based feature 或实际 `research__...` 矩阵列；如果只登记计划而没有生成数值，不得标为 `computed_partial`。

## 特征入场角色（二元 gate）

所有 feature/meta/catalog 行必须写入以下字段：

- `feature_input_class`
- `enter_funnel`
- `response_aware`
- `requires_trainfold_recompute`
- `post_funnel_status`

`feature_input_class` 只允许以下取值：

| class | 入场 | 定义 |
|---|---|---|
| `raw_biological_numeric` | 是 | Label-free、未使用疗效标签生成的客观生物学数字。例如细胞比例、安全 log2 ratio、diversity、pathway/program activity、TF/regulon activity、RSS/RSS-like、communication probability/class score、pseudobulk expression、HVG/module/NMF/state score、可实现的 research-based signature。 |
| `response_derived` | 否 | 任何使用 R/NR 或疗效标签计算出来的结果。例如 DE logFC/p 值、GSEA/ORA NES/p/FDR、differential LR、单因素 OR/AUC/p/FDR、ElasticNet/LASSO 系数、Boruta confirmed 状态。 |
| `qc_only` | 否 | dataset、patient_id、cancer、treatment、n_cells、platform、route、QC flag、hash、工具状态、batch/provenance/count-like 技术指标。 |

硬规则：

- `enter_funnel=True` 仅允许 `feature_input_class=raw_biological_numeric`。
- 所有 `raw_biological_numeric` 先输出 raw patient-level 数值矩阵，再进入统一筛查漏斗；不得因为“高维”“不是 primary”“看起来不重要”在入场前丢弃。
- `response_binary` 只可用于块内宽松单因素 gate、块内 ElasticNet、块外 LASSO/Boruta 和解释性归档，不得参与 raw feature 生成。
- `response_derived` 与 `qc_only` 永远不得进入 raw feature matrix、block ElasticNet、global LASSO 或 Boruta。
- `cancer_type`、`dataset_id`、`treatment_type` 可用于分层、QC、敏感性分析或 adjusted exploratory model metadata，但 `enter_funnel=False`，标记为 `qc_only` 或 `covariate_only_not_biomarker`。
- Section 5 若使用任何 response-aware 筛选后的候选，必须在训练折内重算对应筛选，标记 `requires_trainfold_recompute=True`。

## Substep 总览

| Substep | 名称 | 主要输出 |
|---|---|---|
| S4.0 | preflight、环境与 handoff 审计 | `section4_preflight_qc.tsv`、环境 preflight |
| S4.1 | manifest metadata backfill | `feature_metadata_backfill_audit.tsv`、`qc_covariates.tsv` |
| S4.2 | feature catalog 冻结 | `feature_catalog.tsv`、research/data catalog、READY checkpoint |
| S4.3 | composition、ratio、diversity、DA | composition 特征和解释性 DA |
| S4.4 | pathway/program activity | 单细胞优先 activity score |
| S4.5 | TF/regulon activity | decoupler/SCENIC activity 或 blocked diagnostics |
| S4.6 | DE-GSEA/ORA | explanatory enrichment |
| S4.7 | cell communication | LR pair/class 特征或 blocked diagnostics |
| S4.8 | HVG/pseudobulk/module | 限流表达特征 |
| S4.9 | tumor/immune/CAF state | 状态特征整合视图 |
| S4.10 | external multiomics | 可用外部组学或 not_available |
| S4.11 | matrix integration 与 unsupervised gate | 四类矩阵、gate、meta/QC |
| S4.12 | exploratory response screen | 单因素 R/NR 解释性筛选 |
| S4.13 | Section 5 输入包 | AUC/SHAP/DMI/LODO/ablation 输入，不建模 |
| S4.fig | Section 4 图包 | supplementary diagnostics |

每个 substep 必须更新 `work/features/process/section4_process_index.tsv`。

## S4.0：Preflight、环境与 handoff 审计

必须执行：

1. 校验 Section 4 规范、`00-constraints.md`、输入 h5ad、manifest 和 assets 的 hash。
2. 读取 Section 3 QC 文件并 fail-closed。
3. 校验 `.h5ad.obs` 必需列、dtype、missing fraction 和 handoff 语义。
4. 校验 `section4_feature_eligibility.tsv` 与 obs 标志一致。
5. 审计 `counts/lognorm/X` layer、var_names、gene symbol alignment。
6. 检查 Python 与固定 R 环境中的关键包和数据库资源。
7. 输出每个必选模块的 `available / missing_package / missing_database / blocked` 状态。

最低输出：

- `work/features/qc/section4_preflight_qc.tsv`
- `work/features/qc/section4_input_schema_audit.tsv`
- `work/features/qc/section4_h5ad_layer_audit.tsv`
- `work/features/qc/section4_celltype_distribution.tsv`
- `work/features/qc/section4_eligibility_audit.tsv`
- `work/features/qc/section4_environment_preflight.tsv`
- `work/audit/section4_input_hashes.tsv`
- `work/audit/section4_startup_meta.tsv`

环境检查必须覆盖：

- Python：`scanpy`、`anndata`、`pandas`、`numpy`、`scipy`、`statsmodels`、`sklearn`
- 单细胞/通路：`decoupler`、`gseapy`
- communication：Python `liana` 使用固定 `consensus/cellphonedb/cellchatdb` 资源、R `CellChat`，或 CellPhoneDB Python API + 本地 `cellphonedb.zip`
- compositional DA：独立 Python `section4-sccoda` 环境中的 `sccoda`，或 R `speckle/miloR`
- R：`edgeR`、`limma`、`GSVA`、`fgsea`、`clusterProfiler`、`ComplexHeatmap`、`CellChat`
- assets：MSigDB Hallmark/KEGG/Reactome/GO GMT、DoRothEA/CollecTRI/PROGENy regulon、LIANA consensus/CellPhoneDB/CellChatDB LR resource、CellPhoneDB zip、pySCENIC cisTarget resources 若启用 SCENIC

## S4.1：Manifest metadata backfill 与 QC-only 协变量

允许从正式 manifest 只读回填：

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

必须输出 `qc_covariates.tsv`，包含但不限于：

- `patient_id`
- `dataset_id`
- `cancer_type`
- `treatment_type`
- `platform`
- `source_sample_id`
- `source_lesion_id`
- `n_cells_total`
- `n_cells_eligible`
- `median_genes`
- `percent_mito` 若存在
- Section 3 QC flags

这些字段默认 `feature_input_class=qc_only`、`enter_funnel=False`，不得进入 raw biological feature matrix 或任何筛查漏斗。

最低输出：

- `work/features/feature_metadata_backfill_audit.tsv`
- `work/features/qc/patient_route_reconciliation.tsv`
- `work/features/qc/qc_covariates.tsv`

## S4.2：Research-based 与 Data-based catalog 冻结

Section 4 必须先冻结统合 catalog，再计算特征；不得边算边临时新增未登记特征。

### Research-based realization

`research_based_feature_realization.tsv` 至少包含：

- `research_feature_name`
- `variant_type`
- `method`
- `literature_source`
- `realization_status`
- `realized_feature_id`
- `realized_feature_family`
- `required_input_type`
- `available_input_type`
- `required_tool`
- `tool_run`
- `gene_set`
- `formula`
- `blocked_reason`
- `feature_input_class`
- `enter_funnel`
- `post_funnel_status`
- `mechanism_only`
- `notes`

允许状态：

- `computed`
- `computed_partial`
- `blocked_missing_gene_definition`
- `blocked_missing_formula_or_weights`
- `blocked_external_multiomics_unavailable`
- `blocked_tool_not_run`
- `blocked_low_gene_overlap`
- `context_only`
- `not_applicable_to_scRNA`

### Data-based catalog

Data-based 特征来源：

- Section 3 实际 `TopLevel_Compartment / Major_CellType / Cell_Subtype`
- `assets/stroma_subtype_markers.tsv/xlsx`
- `assets/immune_subtype_markers.tsv`
- 固定 pathway library：MSigDB Hallmark、KEGG、Reactome、GO BP/MF/CC、本地 curated GMT
- 固定 regulon：DoRothEA、CollecTRI、SCENIC regulon
- 固定 LR database：LIANA consensus、LIANA CellPhoneDB、LIANA CellChatDB、本地 CellPhoneDB zip、R CellChatDB
- 真实外部 multiomics patient table

`data_feature_class` 固定枚举：

- `composition`
- `composition_ratio`
- `diversity`
- `composition_differential_abundance`
- `program_activity`
- `pathway_activity`
- `tf_activity`
- `scenic_regulon`
- `differential_enrichment`
- `communication_pair`
- `communication_class`
- `communication_differential`
- `pseudobulk_gene`
- `hvg_module`
- `tumor_state`
- `immune_state`
- `caf_state`
- `external_multiomics`
- `interaction`
- `qc_covariate`

### 统合 catalog schema

`feature_catalog.tsv` 至少包含：

- `feature_id`
- `feature_name`
- `feature_origin`
- `feature_family`
- `data_feature_class`
- `feature_input_class`
- `enter_funnel`
- `response_derived`
- `qc_only`
- `post_funnel_status`
- `block_univariate_status`
- `block_elasticnet_status`
- `global_lasso_status`
- `boruta_status`
- `requires_trainfold_recompute`
- `required_primary_direction`
- `research_feature_name`
- `source_cell_axis`
- `source_cell_group`
- `target_cell_axis`
- `target_cell_group`
- `denominator`
- `aggregation_level`
- `aggregation_method`
- `expression_layer`
- `gene_set`
- `gene_set_source`
- `tool`
- `database`
- `formula`
- `minimum_support_rule`
- `compute_status`
- `blocked_reason`
- `leakage_risk`
- `feature_group_for_ablation`
- `checkpoint_group`

Data-based catalog 必须是一行一个可计算 feature 或可计算 feature 模板，并在 S4.11 前回填实际展开结果；不得只用 `composition__planned` 这类大类占位行冒充冻结 catalog。若 feature 数量只能运行时由 Section3 cell groups 决定，S4.2 至少输出模板 catalog，S4.11 必须输出 expanded catalog 并与 `fibro_feature_meta.tsv`/`feature_gate_log.tsv` 一致。

正式命名空间：

- `comp__...`：composition fraction
- `ratio__...`：composition-derived safe ratio
- `div__...`：diversity/entropy
- `prog__...`：program score
- `path__...`：pathway activity
- `tf__...`：TF/regulon activity
- `scenic__...`：SCENIC regulon activity
- `depath__...`：R/NR DE-GSEA/ORA explanatory result
- `lr__...`：LR pair communication
- `lrclass__...`：LR class communication
- `hvg__...`：HVG/module feature
- `pb__...`：limited pseudobulk gene expression
- `tumor__...`：tumor state
- `immune__...`：immune state
- `caf__...`：CAF state
- `multiomics__...`：external multiomics
- `research__...`：Research-based realization
- `qc__...`：QC-only/covariate, never trainable

强制 checkpoint：

- `work/features/feature_catalog.tsv`
- `work/features/research_based_feature_realization.tsv`
- `work/features/literature_feature_realization.tsv`
- `work/features/data_based_feature_catalog.tsv`
- `work/features/checkpoints/feature_catalog_summary_checkpoint.tsv`
- `work/features/checkpoints/S4.2_feature_catalog_READY`
- `work/features/qc/feature_catalog_qc.tsv`

`feature_catalog_summary_checkpoint.tsv` 必须按 `feature_origin / feature_family / data_feature_class / feature_input_class / enter_funnel` 统计 `n_planned/n_computable/n_blocked/n_raw_biological_numeric/n_response_derived/n_qc_only/block_reason_top/checkpoint_status`。

## S4.3：Composition、Ratio、Diversity 与差异丰度

### 必进 raw_biological_numeric

- top-level fraction
- major fraction
- subtype fraction
- 预定义 biological ratios
- diversity/entropy

### 计算内容

- Top-level fraction：`Immune`、`Stroma`、`Epithelial_or_cancer_cell`、`Non_cellular`，feature id 使用 `comp__all__TopLevelCompartment__<group>`。
- Major fraction：所有实际出现的 `Major_CellType`，feature id 使用 `comp__major__<major>`。
- Subtype fraction：所有通过 Section 3 acceptance gate 的 `Cell_Subtype`，feature id 使用 `comp__subtype__<subtype>`。
- CAF context：CAF/Fibroblast 在 all cells、nonimmune、stroma 中比例。
- Immune reference：CD8/Treg/NK/Myeloid/DC/B/Plasma 等 fraction。
- Tumor reference：Cancer/Epithelial fraction。
- Safe ratio 不得只写少数手工 5 个；必须从实际 composition 自动派生并限流。最低包含 top-level pairwise、major-level biological ratios、subtype-level biological ratios。
- Diversity 不得只做全局 top/major/subtype 12 个；必须补充每个 major 内的 subtype diversity，例如 Fibroblast subtype diversity、T/NK subtype diversity、Myeloid subtype diversity、B lineage diversity、Tumor/Epithelial diversity。

ratio 必须使用：

```python
safe_ratio = (numerator + 0.1) / (denominator + 0.1)
log2_safe_ratio = log2(safe_ratio)
```

禁止直接 `frac_a / frac_b` 入模。

ratio 生成规则：

- `ratio__top__<numerator>_over_<denominator>`：top-level biological pairs。
- `ratio__major__<numerator>_over_<denominator>`：major-level pairs，例如 `Fibroblast_over_T_cell`、`Myeloid_over_T_cell`、`Cancer_cell_over_Immune`。
- `ratio__subtype__<numerator>_over_<denominator>`：subtype-level pairs，例如 `myoCAF_over_iCAF`、`apCAF_over_iCAF`、`Treg_over_Cytotoxic_CD8`、`Exhausted_CD8_over_Cytotoxic_CD8`、`Macrophage_over_Monocyte`。
- 任何 denominator 缺失或 source cell 支持不足时输出 NA 和 missing reason，不得用错误层级替代。

composition/ratio/diversity 表必须强制 QC：`patient_key` 后缀必须与 `patient_id` 一致；每个 patient-feature 只能一行；若 pandas 分类列参与 groupby，必须使用 `observed=True` 或先转为 string，防止未观察组合产生 patient_key/patient_id 错配。

### 单细胞优先差异丰度

R/NR 差异丰度是 `response_derived`：

- 首选：`scCODA` 或 `Milo`，适合 compositional / neighborhood DA。
- R 备选：`speckle::propeller`。
- fallback：patient-level beta-binomial/quasibinomial GLM 或 Wilcoxon + BH FDR。

DA 结果不得进入 raw feature 漏斗；只用于解释性图表、差异丰度表和候选解释。

最低输出：

- `work/features/substeps/composition_features_sample.tsv`
- `work/features/substeps/composition_features_patient.tsv`
- `work/features/substeps/composition_ratio_features_patient.tsv`
- `work/features/substeps/composition_diversity_features_patient.tsv`
- `work/features/explanatory/composition_differential_abundance.tsv`
- `work/features/qc/composition_feature_support.tsv`

## S4.4：Pathway 与 Program Activity

### 必进 primary

每个核心状态方向至少保留低维 pathway/program activity：

- CAF state
- immune state
- tumor state
- antigen presentation / IFN context
- ECM/TGF-beta context

### 算法优先级

优先单细胞层面算法：

1. `UCell` 或 `AUCell`：cell-level rank-based score，随后聚合到 patient × axis × group。
2. `decoupler` gene set activity：可用于 cell-level 或 patient × celltype pseudobulk。
3. `GSVA/ssGSEA`：用于 patient × celltype pseudobulk 或 sample-level matrix。
4. `scanpy.score_genes`：仅作为可审计 fallback。

每个方法必须输出 gene overlap、used genes、dropped genes、score distribution。gene set overlap `< 5` 或 `< 20%` 时该 feature 必须真正 blocked，不能只在 QC 表标记后继续进入 raw 漏斗。

### pathway library

优先顺序：

1. MSigDB Hallmark：低维核心库，全部通过 overlap QC 后进入 raw 漏斗。
2. 本地 curated CAF/ICB programs：低维核心 program，全部通过 overlap QC 后进入 raw 漏斗。
3. KEGG legacy / KEGG Medicus：全库通过 overlap QC 后进入 raw 漏斗。
4. Reactome：全库通过 overlap QC 后进入 raw 漏斗。
5. GO BP/MF/CC：全库通过 overlap QC 后进入 raw 漏斗；冗余和高维问题交由块内 ElasticNet 与块外 LASSO/Boruta 处理。

固定本地 GO 资源为 `assets/dataset/msigdb/go_bp_org_hs_eg_db_3.18.0.gmt`、`go_mf_org_hs_eg_db_3.18.0.gmt`、`go_cc_org_hs_eg_db_3.18.0.gmt`。不得运行时联网拉取未固定版本的 gene set。若数据库缺失，必须 blocked，并在环境要求中记录。

### 层级输出

Pathway/program activity 必须尽可能输出三层：

- `path__all__<library>__<term>` / `prog__all__<program>`
- `path__major__<Major_CellType>__<library>__<term>` / `prog__major__<Major_CellType>__<program>`
- `path__subtype__<Cell_Subtype>__<library>__<term>` / `prog__subtype__<Cell_Subtype>__<program>`

如果某层因细胞数或 gene overlap 不足不可计算，必须输出 blocked/support 表；不得把 major/subtype 分数直接平均成唯一 patient-level 总分后丢失层级。

### 核心状态实现

Tumor state：

- proliferation：`E2F_TARGETS`、`G2M_CHECKPOINT`、`MYC_TARGETS`
- EMT：`EPITHELIAL_MESENCHYMAL_TRANSITION`
- hypoxia：`HYPOXIA`
- IFN response：`INTERFERON_ALPHA_RESPONSE`、`INTERFERON_GAMMA_RESPONSE`
- antigen presentation：HLA-I/II、B2M、TAP1/2、CIITA
- WNT/beta-catenin、TGF-beta、p53、apoptosis

Immune state：

- cytotoxicity：`GZMB/PRF1/NKG7/GNLY`
- exhaustion：`PDCD1/LAG3/HAVCR2/TIGIT/TOX`
- Treg suppressive：`FOXP3/IL2RA/CTLA4`
- myeloid suppressive、TREM2/APOE/C1QC TAM、mregDC、cDC1/cDC2
- IFN response、chemokine、antigen presentation

CAF state：

- iCAF/inflammatory CAF
- myoCAF/contractile CAF
- apCAF/antigen-presenting CAF
- ECM/collagen remodeling
- TGF-beta/EMT CAF
- chemokine/TLS recruiting CAF
- FMO2/CCL19 and FRZB/SPARC/FKBP10 programs where genes are available

最低输出：

- `work/features/substeps/program_activity_features_cell_summary.tsv`
- `work/features/substeps/program_activity_features_sample.tsv`
- `work/features/substeps/program_activity_features_patient.tsv`
- `work/features/substeps/pathway_activity_features_patient.tsv`
- `work/features/substeps/pathway_activity_features_by_axis.tsv`
- `work/features/substeps/program_activity_features_by_axis.tsv`
- `work/features/qc/gene_set_overlap_qc.tsv`
- `work/features/qc/pathway_library_coverage_qc.tsv`

## S4.5：TF/Regulon Activity

### 必进 primary

TF activity 是必选方向。优先运行轻量、可审计方法；完整 SCENIC 为增强模块。

### 算法优先级

1. `decoupler + DoRothEA/CollecTRI`：默认必选实现，适合 cell-level 或 patient × all/major/subtype pseudobulk。
2. `pySCENIC/SCENIC`：增强实现，需 cisTarget rankings、motif DB、TF list；当前固定资源可用时应尽量运行。
3. RSS / specificity：在 TF/regulon activity 矩阵上计算 group specificity，优先 `SCENIC regulon AUC + calcRSS`；若 SCENIC 未启用，可对 decoupler TF activity 计算 `tf_rss_like__...`，并在 QC 中标明不是 SCENIC RSS。

不得把单个 TF mRNA 表达伪装为 `tf__` regulon activity。TF mRNA 只能作为 `pb__` 或状态表达特征，且必须标明不是 regulon。

TF 输出不得在生成阶段只保留 30 个全局 top variance TF。正式流程必须先输出所有通过 regulon overlap/tmin 的 raw TF activity/RSS/RSS-like；这些列均为 `raw_biological_numeric`，进入同一个块内漏斗。任何 top TF 展示只能作为筛选结果或图表，不得替代 raw 输出。

层级命名：

- `tf__all__<TF>`
- `tf__major__<Major_CellType>__<TF>`
- `tf__subtype__<Cell_Subtype>__<TF>`
- `tf_rss__major__<Major_CellType>__<TF>` 或 `tf_rss_like__major__<Major_CellType>__<TF>`
- `tf_rss__subtype__<Cell_Subtype>__<TF>` 或 `tf_rss_like__subtype__<Cell_Subtype>__<TF>`

优先 TF：

- CAF/stroma：SMAD2/3/4、STAT3、RELA/NFKB1、JUN/FOS/AP1、TEAD/YAP、HIF1A、RUNX、SOX4
- T/NK：TBX21、EOMES、TOX、TCF7、FOXP3、BATF、PRDM1
- Myeloid/DC：IRF1、IRF4、IRF8、NFKB、STAT1、STAT6、CEBPB
- Tumor/Epithelial：MYC、E2F、TP53、HIF1A、STAT1/IRF1、SMAD、CTNNB1 proxy where supported

若 `decoupler/DoRothEA/CollecTRI` 与 `SCENIC` 均不可用，正式生产应标记 `blocked_required_module`；strict 模式下停止，非 strict 开发模式可继续但该方向没有可入场的 `raw_biological_numeric` 特征。

最低输出：

- `work/features/substeps/tf_activity_features_patient.tsv`
- `work/features/substeps/tf_activity_features_raw_by_axis.tsv`
- `work/features/substeps/tf_rss_features_patient.tsv`
- `work/features/substeps/scenic_regulon_activity_features_patient.tsv` 若启用 SCENIC
- `work/features/qc/tf_activity_diagnostics.tsv`
- `work/features/qc/tf_axis_coverage_qc.tsv`

## S4.6：R/NR DE-GSEA/ORA

本模块必做，但 DE/GSEA/ORA 结果是 `response_derived`。

推荐实现：

1. 按 `patient × all`、`patient × major`、`patient × subtype` 构建 pseudobulk。
2. 每个 all/major/subtype 层级内做 R vs NR differential expression。样本数不足的 subtype 可 blocked，但必须记录原因。
3. 首选 R `edgeR/limma`，样本过少时 fallback 到 patient-level rank test。
4. GSEA：`fgsea` 或 `gseapy.prerank`，使用 Hallmark、KEGG、Reactome、GO BP/MF/CC 本地库。
5. ORA：`clusterProfiler` 或本地 GMT Fisher/超几何检验。

DE 是基因级 R vs NR 差异表达；GSEA/ORA 是基于 DE 结果的 response-aware 富集解释；pathway/program activity 是不使用 R/NR 的 label-free `raw_biological_numeric` 特征。三者必须分离。DE/GSEA/ORA 的 logFC、NES、p、FDR 不得进入筛查漏斗。Section 5 若要使用 enrichment-derived selection，必须在 training fold 内重算。

最低输出：

- `work/features/explanatory/de_genes_by_celltype.tsv`
- `work/features/explanatory/gsea_by_celltype.tsv`
- `work/features/explanatory/ora_by_celltype.tsv`
- `work/features/explanatory/enrichment_summary.tsv`
- `work/features/qc/enrichment_qc.tsv`
- `work/features/qc/enrichment_axis_coverage_qc.tsv`

## S4.7：Cell Communication

### 必进 raw_biological_numeric

communication 是必选方向，但只有真实工具成功运行时才产生正式特征。若工具/数据库缺失，必须 fail-closed blocked，不得用共表达 proxy 替代。

### 算法优先级

1. `LIANA`：优先 Python 路线，固定使用本地可审计资源名 `consensus`，并可对照 `cellphonedb`、`cellchatdb`；不得调用不存在的 `omnipath` 资源名。
2. R `CellChat`：优先 R 路线，记录 CellChatDB 版本与参数。
3. `CellPhoneDB`：可选实现，使用 Python API 与本地 `cellphonedb.zip`，不依赖 CLI。

必须固定 LR database 版本和 hash。

### 计算粒度

- major-major：所有满足最小细胞数的 source major → target major pair。
- subtype-subtype：对所有满足支持度的 source subtype → target subtype pair 运行，允许跨 major；重点覆盖 CAF、T/NK、Myeloid/DC、Cancer/Epithelial、Endothelial/Pericyte。
- CAF-focused：`Fibroblast/CAF/myoCAF/iCAF/apCAF -> T/NK/Myeloid/Cancer/Epithelial/Endothelial/Pericyte`。
- immune-to-CAF：`T/NK/Myeloid/DC -> Fibroblast/CAF/myoCAF/iCAF/apCAF`。

最小支持：

- source 和 target 每个 patient 至少 10-20 个 eligible cells。
- 不满足时 patient-level feature 记 NA，并写 missing reason。
- major_pair 和 subtype_pair 必须分别统计成功/跳过/失败数量。

输出两级和两层级，所有 label-free communication probability/score 均为 `raw_biological_numeric`：

- pair-level：LR pair communication probability/score，feature id 如 `lr__major__Fibroblast__T_cell__TGFB1__TGFBR2`、`lr__subtype__myoCAF__Exhausted_CD8__TGFB1__TGFBR2`。
- class-level：`CHEMOKINE`、`TGFB`、`COLLAGEN_ECM`、`CHECKPOINT`、`VEGF`、`IL6`、`MIF`、`SPP1` 聚合分数，feature id 如 `lrclass__major__Fibroblast__T_cell__TGFB`、`lrclass__subtype__myoCAF__Exhausted_CD8__TGFB`。
- class 不得只输出全 patient 总均值；每个 major_pair/subtype_pair 均需独立 class feature。
- 若固定 class 无命中，必须输出 NA/support reason，不能静默消失。

differential LR 是 `response_derived`，不得进入 raw feature 漏斗。

最低输出：

- `work/communication/communication_matrix_diagnostics.tsv`
- `work/communication/communication_tool_run_manifest.tsv`
- `work/features/substeps/communication_features_patient.tsv`
- `work/features/substeps/communication_class_features_patient.tsv`
- `work/features/explanatory/communication_response_diff.tsv`
- `work/features/explanatory/communication_pair_response_diff.tsv`
- `work/features/qc/communication_feature_qc.tsv`
- `work/features/qc/communication_axis_pair_support_qc.tsv`

## S4.8：HVG、Pseudobulk 与 Module

HVG/表达量是必选方向，但 raw gene-level 特征必须限流。

正式计算：

- 每个 dataset、patient、all/major/subtype 生成 pseudobulk。
- `all` 使用全 eligible cells；`major` 覆盖所有 `Major_CellType`；`subtype` 覆盖所有满足支持度的 `Cell_Subtype`，重点包括 CAF/T/NK/Myeloid/B/Cancer/Epithelial。
- 使用 `counts` 聚合，标准化为全基因 library-size logCPM。
- 不得用 marker subset 的总和作为 CPM denominator。
- 记录 source cell 数、library size、detected genes、gene overlap。

允许进入 raw_biological_numeric 漏斗：

- 文献基因和 marker gene 的受控 pseudobulk。
- 每个 major 的 HVG/pseudobulk 数值特征。
- 每个重点 subtype 和满足支持度的非重点 subtype 的 HVG/pseudobulk 数值特征。
- 每个 major 和重点 subtype 都必须生成 `hvg__major__<major>__module_topN` 或 `hvg__subtype__<subtype>__module_topN` module 特征；不得只输出 major module。
- raw `pb__...`、`hvg__...`、module/NMF/marker-supported summary 只要 label-free 且通过支持度 QC，均进入同一块内漏斗。

生物学一致性：

- 必须有 `celltype_allowed_gene_panel` 或 marker coherence 审计。
- 免疫 marker 不得无约束套到 epithelial/endothelial/B cell 等不合理组合后作为可信生物特征；异常跨谱系表达必须在 gate/QC 中标记 `gene_celltype_incoherent`，可被移除或仅保留为 QC，不得静默入场。

最低输出：

- `work/features/substeps/pseudobulk_manifest.tsv`
- `work/features/substeps/pseudobulk_features_patient.tsv`
- `work/features/substeps/hvg_module_features_patient.tsv`
- `work/features/qc/pseudobulk_feature_qc.tsv`
- `work/features/qc/pseudobulk_gene_celltype_coherence.tsv`
- `work/features/qc/pseudobulk_axis_support_qc.tsv`

## S4.9：Tumor、Immune 与 CAF State 汇总

本模块不重复计算，而是从 S4.3-S4.8 中抽取并组织三类核心状态视图。三类状态均需尽可能输出 `raw_biological_numeric` 状态特征，除非对应细胞群或工具缺失。状态分数不得直接对异质特征做未标准化均值；必须先按 feature 做 robust z-score 或 rank-normalization，并记录方向、权重、组成来源和缺失处理。若方向无法确定，输出 state component table，但不合成为单一 state score。

Tumor state 来源：

- Tumor/Epithelial fraction
- tumor pathway/program activity
- tumor TF activity
- CNV/antigen presentation 若 Section 3 提供
- immune evasion proxy

Immune state 来源：

- immune composition、CD8/Treg、myeloid/T cell ratio
- cytotoxic/exhaustion/Treg/myeloid/DC pathway/program
- immune TF activity
- immune-related communication class

CAF state 来源：

- CAF/iCAF/myoCAF/apCAF fraction
- CAF program/pathway activity
- CAF TF activity
- CAF-centered communication class
- limited CAF HVG/module

最低输出：

- `work/features/substeps/tumor_state_features_patient.tsv`
- `work/features/substeps/immune_state_features_patient.tsv`
- `work/features/substeps/caf_state_features_patient.tsv`
- `work/features/qc/state_feature_summary.tsv`
- `work/features/qc/state_score_component_qc.tsv`

## S4.10：External Multiomics

仅当真实 patient-level 外部表存在时读取：

- mutation、TMB、neoantigen、MSI
- methylation
- TCR/BCR clonality
- miRNA
- proteomics/IHC/metabolomics
- spatial features

禁止从 cancer type、dataset_id、response 或 route metadata 推断外部组学。

缺失时输出 not_available，不得填 0 或 cohort median。

最低输出：

- `work/features/qc/multiomics_feature_availability.tsv`
- `work/features/substeps/multiomics_features_patient.tsv`

## S4.11：矩阵整合与无监督 Gate

进入 S4.11 前必须读取：

- `work/features/checkpoints/feature_catalog_summary_checkpoint.tsv`
- `work/features/checkpoints/S4.2_feature_catalog_READY`

必须输出二元准入与筛选矩阵：

- `work/features/raw_biological_numeric_features.tsv.gz`
- `work/features/block_screened_candidate_features.tsv`
- `work/features/global_screened_candidate_features.tsv`
- `work/features/response_derived_explanatory_index.tsv`
- `work/features/qc/qc_covariates.tsv`

兼容旧下游的主表：

- `work/features/fibro_features_raw.tsv.gz`
- `work/features/fibro_features.tsv`
- `work/features/fibro_features_mechanism.tsv`

`fibro_features_raw.tsv.gz` 必须包含所有通过 label-free gate 的 `raw_biological_numeric` 特征。`fibro_features.tsv` 必须包含 metadata/provenance + 块外严格 LASSO/Boruta 后的 Section 5 候选特征；metadata/provenance 必须在 dictionary 中标记 `enter_funnel=False`、`feature_input_class=qc_only`。

### Mandatory gate

| 条件 | 动作 | 标记 |
|---|---|---|
| 方差 `< 1e-10` | 移除 | `GATE: zero_variance` |
| 主分析缺失率 `> 50%` | 移除 | `GATE: high_missing_gt50pct` |
| 非缺失 patient `< 10` | 移除 | `GATE: too_few_patients` |
| 非缺失主数据集 `< 2` | 移除 | `GATE: too_few_datasets` |
| 信号来自单一数据集 | 移除 | `GATE: single_dataset_signal` |
| 绝对相关 `r > 0.99` | 保留优先级更高者 | `GATE: near_duplicate` |
| source cell 支持不足 | 移除或 mechanism-only | `GATE: insufficient_source_cells` |
| 直接 fraction ratio | 移除 | `GATE: frac_ratio_forbidden` |
| route/provenance/QC/count-like proxy | 移到 qc_only | `GATE: forbidden_trainable_feature` |
| response 参与 raw feature 生成 | 移到 response_derived 或移除 | `GATE: response_leakage` |
| 工具未真实运行 | 移除 | `GATE: blocked_tool_not_run` |
| family 工程限流 | 仅允许在 raw 全量输出后用于候选优先级，不得入场前丢弃 | `GATE: family_cap_post_raw_only` |
| gene-celltype 不一致 | 移除或 qc_only | `GATE: gene_celltype_incoherent` |

统一入场原则：

- composition/ratio/diversity、pathway/program、TF/regulon/RSS、communication pair/class、HVG/pseudobulk/module、state 和 research-based 可实现数值特征，只要 label-free 且通过基础支持度 QC，均进入 raw 漏斗。
- 高维特征不得因维度高被预先降级排除；维度问题由块内 ElasticNet 和块外 LASSO/Boruta 解决。
- 近重复、缺失、低支持、单数据集信号和明显错误层级可在 label-free gate 移除，并必须写入 `feature_gate_log.tsv`。

最低输出：

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

`feature_gate_log.tsv` 必须一行一个 feature 的最终状态；多原因用分号合并，不得因 near-duplicate 追加重复 feature 行导致计数混乱。`patient_feature_integrity_qc.tsv` 必须检查：`patient_key` 与 `patient_id` 一致、patient-feature 无重复、main matrix patient 覆盖 100%、substep all-eligible 与 main-only 过滤边界清晰、每个 required feature family 至少有 all/major/subtype 或 pair 层级覆盖说明。

## S4.12：统一筛查漏斗与解释性归档

输入：所有通过 label-free gate 的 `raw_biological_numeric` 特征。  
输出：块内宽松候选、块外严格候选和解释性统计归档。

块内漏斗由各 feature block 执行，并在 S4.12 汇总：

- 宽松单因素 gate：logistic regression 或 Wilcoxon/rank test，输出 p、effect size、AUC、direction 和 BH FDR；默认 `FDR < 0.25` 进入 block candidate。
- 块内 ElasticNet：若该 block label-free gate 后 `p > 50`，运行标准化 logistic ElasticNet `alpha=0.5`，交叉验证选择 lambda，非零系数进入 block candidate；若 `p <= 50`，记录 `elasticnet_status=skipped_green_channel`。
- 单因素和 ElasticNet 都是 response-aware，必须标记 `response_aware=True` 与 `requires_trainfold_recompute=True`。

块外严格漏斗由 post-integration 执行。正式 `full_hierarchy_all_classes` run 不得跳过；只有显式 `composition_only_debug` 或 schema/debug 模式可跳过，并必须写入 skip reason。

- 合并所有 block candidate 后，对标准化 biological matrix 执行全局 logistic LASSO，`alpha=1`。
- 对 LASSO 幸存者运行 Boruta 或 shadow-feature RandomForest/XGBoost，输出 `Confirmed / Tentative / Rejected`。
- 严格候选不得覆盖 raw 入场身份；它们是 Section 5 的候选清单，正式建模需训练折内重算筛选。
- adjusted exploratory model 可使用 `dataset_id/cancer_type/treatment_type` 作为协变量，但这些协变量自身不得进入 raw 漏斗。

最低输出：

- `work/features/screening/univariate_response_screen.tsv`
- `work/features/screening/significant_features_exploratory.tsv`
- `work/features/screening/block_elasticnet_screen.tsv`
- `work/features/screening/global_lasso_screen.tsv`
- `work/features/screening/global_boruta_shadow_screen.tsv`
- `work/features/screening/global_confirmed_features.tsv`
- `work/features/screening/section5_candidate_features_label_free.tsv`
- `work/features/screening/section5_candidate_features_trainfold_required.tsv`
- `work/features/qc/univariate_screen_leakage_audit.tsv`
- `work/features/qc/global_screen_leakage_audit.tsv`

## S4.13：Section 5 输入包

只生成输入，不训练模型，不计算正式 AUC/SHAP/DMI/LODO/ablation 结果。

必须输出：

- `work/features/section5/section5_input_matrix.tsv.gz`
- `work/features/section5/section5_feature_dictionary.tsv`
- `work/features/section5/section5_feature_groups.tsv`
- `work/features/section5/section5_lodo_folds.tsv`
- `work/features/section5/section5_ablation_plan.tsv`
- `work/features/section5/section5_auc_plot_input_template.tsv`
- `work/features/section5/section5_shap_input_manifest.tsv`
- `work/features/section5/section5_dmi_input_matrix.tsv.gz`
- `work/features/section5/section5_modeling_readiness_qc.tsv`

`section5_feature_dictionary.tsv` 必须区分：

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

## S4.fig：强制作图

每张图必须输出 `pdf`、`png`、`source_data.tsv`、`caption.md`。若工具 blocked，caption 必须写清 blocked/not_available，不得伪装完成。

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

推荐图：

- composition R/NR fraction/ratio dotplot，并区分 top/major/subtype。
- pathway/program top feature heatmap，并区分 all/major/subtype；Fig_S5f 的 source_data 必须同时包含 pathway 和 program，不能只读 program 表。
- top TF activity dotplot 和 TF RSS/RSS-like specificity heatmap，并区分 all/major/subtype。
- communication source-target network、major_pair/subtype_pair top LR table、LR class heatmap；Fig_S5h 不得只画全局 class 均值。
- HVG module major/subtype summary heatmap。
- CAF/immune/tumor state summary heatmap，source_data 必须包含 state component、direction、weight。

## 输出表格总表

| 文件 | 角色 |
|---|---|
| `feature_catalog.tsv` | 统合 feature catalog |
| `research_based_feature_realization.tsv` | 既有文献特征实现状态 |
| `data_based_feature_catalog.tsv` | Data-based 结构化特征目录 |
| `raw_biological_numeric_features.tsv.gz` | 所有可入场的 label-free 生物学数值特征 |
| `block_screened_candidate_features.tsv` | 块内宽松单因素/ElasticNet 候选 |
| `global_screened_candidate_features.tsv` | 块外 LASSO/Boruta 严格候选 |
| `response_derived_explanatory_index.tsv` | response-derived 解释性结果索引 |
| `qc_covariates.tsv` | 仅 QC/协变量 |
| `fibro_features.tsv` | 兼容旧下游的全局严格候选特征表 |
| `fibro_features_mechanism.tsv` | 机制分析特征表 |
| `fibro_feature_meta.tsv` | 特征定义和角色 |
| `fibro_feature_qc.tsv` | 缺失、方差、支持度、gate |
| `feature_gate_log.tsv` | 一行一个 feature 的 gate 结果 |
| `section5/*` | Section 5 输入包 |

## 完成检查

- [ ] 已读取 `00-constraints.md` 与本 Section 4 规范。
- [ ] 已使用固定 R 环境 `/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite` 做 R 包 preflight。
- [ ] Section 3 QC clean；blocked run 只允许 schema dry-run。
- [ ] 已优先读取 `work/section4_input/*.section3_for_section4.h5ad`。
- [ ] h5ad manifest、obs schema、eligibility、layer、gene symbol 均通过。
- [ ] 未修改 Section 3 注释列。
- [ ] `transcriptome_feature.tsv` 每行均进入 Research-based realization。
- [ ] Data-based feature 已全部进入固定 catalog，expanded catalog 与 `fibro_feature_meta.tsv`/`feature_gate_log.tsv` 一致。
- [ ] 每个主要生物方向至少有 `raw_biological_numeric` 特征进入 raw 漏斗，或写明 blocked 原因。
- [ ] `response_derived` 与 `qc_only` 字段未进入 raw/ElasticNet/LASSO/Boruta biomarker matrix。
- [ ] 通路活性和 DE-GSEA/ORA 已区分：前者可建模，后者仅解释。
- [ ] TF activity 使用真实 regulon/activity 方法；未把 TF mRNA 伪装为 regulon。
- [ ] Communication 使用真实工具和数据库；未用共表达 proxy。
- [ ] HVG/pseudobulk 已限流，并使用全基因 library-size logCPM。
- [ ] `feature_gate_log.tsv` 无重复 feature 行。
- [ ] `fibro_features.tsv` 与主 manifest unique patient 数一致。
- [ ] 块内宽松单因素 gate + ElasticNet 已执行或记录跳过原因。
- [ ] 块外严格 LASSO + Boruta 已执行或在 debug 模式中记录跳过原因。
- [ ] 所有 response-aware 筛选候选标记 `requires_trainfold_recompute=True`。
- [ ] Section 5 输入包已生成，但未执行 Section 5 建模。
- [ ] Fig_S5 系列图包、source data 和 caption 已生成，source_data 无 patient_key/patient_id 错配，且 pathway/TF/communication 图保留 all/major/subtype 或 pair 层级。
- [ ] `work/qc/section4_qc_report.md` 和 `work/qc/section4_issue_list.tsv` 已汇总所有 blocked/warning/error。
