---
name: 03e-robust-clustering-annotation-scmarkeragent-sctype
description: Section 3 03e strict 规范。继承 03d 的 CNV、resolution ranking、protected-lineage rescue、subtype gate、Section4 handoff 与 QC 硬门禁；新增 runner 生成合同、scMarkerAgentDB 本地 bridge 静态审计、sctype_rawoutput 强制可见、以及禁止 marker-score-only runner 的前置阻断。
type: reference
---

# Section 3 变体：03e scMarkerAgentDB + ScType-style Strict Runner Contract

## 适用场景

03e 用于从 Section 2 atlas 进入 Section 3 注释，目标是交付 Section 4-ready 的细胞级注释和 h5ad。03e 是 03d 的收敛版：保留 03d 已经修复的 CNV、过粗 resolution、protected-lineage rescue、T cell subtype、Pericyte/Smooth_muscle rescue、non-cellular gate 和 Section 4 handoff 规则；同时把近期暴露的工程问题前置为 runner 生成合同，防止每轮新 runner 又回到 hard-coded marker scoring。

03e 的核心差异：

- 正式 raw output 只能来自 `scmarkeragent_db_human.RDS` 经 scType-style / scMarkerAgent bridge 的原始返回。
- `sctype_rawoutput_*` 必须真实可见、可追溯、可展示；marker score、projection、contract fallback 不能冒充 raw output。
- 新 run 生成的 runner 本身必须通过静态合同和 bridge smoke test 后才允许读取 atlas 或进入 Step 1。
- 禁止保存旧 marker-score full runner，却由隐藏外层 preflight 决定 blocked/completed。

## 正式输入与运行范围

只执行 pipeline 的 Section 3，不重跑 Section 1/2，不继续 pipeline Section 4/5/6/7。这里的“不执行 Section 4/5/6/7”不包括 Section 3 内部 Step4 subtype search、Step5 writeback、Step6 QC/figures。

正式输入：

- atlas：`/vepfs-mlp2/mlp-public/250266/omiclaw/groups/feishu_c59e3d6da1c4/run_20260404_160559_fibro_icb_egas_gse123813_strict/work/atlas/merged.h5ad`
- QC h5ad：`/vepfs-mlp2/mlp-public/250266/omiclaw/groups/feishu_c59e3d6da1c4/run_20260404_160559_fibro_icb_egas_gse123813_strict/work/qc/*/*.qc.h5ad`
- skill assets：`/vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets`

每轮必须创建唯一、洁净、带时间戳的新 run 目录。所有 scripts、logs、work、annotation、qc、figures、checkpoints、section4_input 都必须写入该新目录。不得 resume 旧 run，不得挂旧 job，不得使用 start_job/nohup/setsid/& 或任何后台化方式。必须前台运行并持续输出当前 step、关键日志和 process_index 状态。

## 跨 run 与 provenance 硬门禁

运行时允许读取的 run 路径只有正式 Section2 atlas/QC 输入和本轮新 run 自身输出。禁止读取任何旧 Section3/Section4 run 的 scripts、work/annotation、work/checkpoints、work/cache、per_dataset、section4_input、annotated h5ad、qc 结果、figure/source_data 或 bridge cache 作为本轮输入。

启动前必须写：

- `work/annotation/input_access_allowlist.tsv`
- `work/annotation/runtime_input_manifest.tsv`
- `work/audit/script_provenance.tsv`

若检测到旧 run 产物作为 runtime 输入，必须 hard fail：`ERROR:cross_run_or_old_asset_read_detected`。

外层启动脚本、runner generator、preflight helper、R helper 若参与本轮执行，必须复制到 `<run_root>/scripts/` 并记录 sha256。禁止只保存一个旧 full runner、但实际由隐藏外层脚本决定 blocked/completed；否则 hard fail：`ERROR:runner_provenance_incomplete`。

## 正式资产

03e 只从当前 skill assets 读取正式资产，不得从旧 run 目录读取副本。

必读 scMarkerAgent / projection / contract 资产：

- `assets/scmarkeragent_db_human.RDS`
- `assets/scmarkeragent_bridge_config.json`
- `assets/scmarkeragent_label_projection.tsv`
- `assets/sctype/sctype_score_.R`
- `assets/dictionary/03d_fixed_projection_contract_top_level.tsv`
- `assets/dictionary/03d_fixed_projection_contract_major_celltype.tsv`
- `assets/dictionary/03d_fixed_projection_contract_subtype.tsv`
- `assets/dictionary/03d_raw_to_standard_projection_policy.tsv`
- `assets/dictionary/03d_merge_conflict_unknown_policy.tsv`
- `assets/dictionary/03d_stage_aware_raw_to_standard_projection_dictionary.tsv`
- `assets/dictionary/03d_subtype_raw_label_projection_overrides.tsv`
- `assets/dictionary/03d_projection_review_queue.tsv`
- `assets/dictionary/03d_manual_normalization_map.tsv`

必读 CNV 资产：

- `assets/gencode.v44.gene_positions.tsv.gz`

只允许用于 marker coherence / resolution ranking / rescue / QC，不得生成 `sctype_rawoutput_*`：

- `assets/immune_subtype_markers.tsv`
- `assets/stroma_subtype_markers.tsv`

默认不得作为 03e runtime 输入的历史/冗余资产：

- `assets/Immune_All_Low.pkl`
- `assets/PanglaoDB_makers.tsv`
- `assets/Cell_marker_Seq.xlsx`
- `assets/gencode.v44.annotation.gtf.gz`
- `assets/stroma_subtype_markers_manual.xlsx`
- `assets/pubmed_document.csv`
- `assets/wos_document.csv`
- `assets/read_papers.tsv`
- `assets/transcriptome_feature.tsv`
- `assets/prompt.txt`
- `assets/sctype/ScTypeDB_full.xlsx`
- `assets/sctype/ScTypeDB_short.xlsx`
- `assets/sctype/gene_sets_prepare.R`
- `assets/sctype/sctype_wrapper.R`
- `assets/dictionary/OLD_SAVE*`
- `assets/dictionary/03d_upgrade_*`
- `assets/dictionary/03d_projection_review_queue_legacy_stage_residue.tsv`
- `assets/dictionary/03d_stage4_cross_lineage_removed_from_dictionary*.tsv`
- `assets/dictionary/03d_source_stage_normalization_audit.tsv`

若 `ScTypeDB_full/short.xlsx`、PanglaoDB、CellMarker 或其它非 `scmarkeragent_db_human.RDS` 被用于生成 `sctype_rawoutput_*`，必须 hard fail：`ERROR:sctype_db_used_as_runtime_kb`。

## R 环境与 bridge 语义

03e 固定使用：

`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite`

Rscript：

`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite/bin/Rscript`

启动 Step 3 前必须执行 bridge preflight，并写出：

- `work/annotation/scmarkeragent_bridge_preflight.tsv`
- `work/annotation/03e_bridge_smoke_sctype_rawoutput.tsv`

preflight 至少记录：

`r_env_path, rscript_path, required_packages_available, missing_packages, scmarkeragent_rds_available, rds_sha256, config_sha256, projection_sha256, sctype_score_helper_sha256, sctype_style_scoring_available, local_rds_bridge_available, bridge_smoke_test_status, bridge_smoke_output_path, source_backend, preflight_status`

硬要求：

- `Seurat / UCell / HGNChelper / data.table / Matrix / readr / scales` 必须可加载。
- `ScType` R package 本身是 optional；不安装该包不等于失败。
- gene sets / candidate raw labels 必须从 `scmarkeragent_db_human.RDS` 构建。
- `assets/sctype/sctype_score_.R` 可作为 ScType-style scoring helper；若 runner 自带等价 scoring 实现，必须记录实现 hash。
- `bridge_smoke_test_status` 必须为 pass。只证明 R 包可加载或 RDS 可读不足以继续。
- 若既没有可用 ScType-style scoring 函数，也没有明确本地 RDS bridge 实现，必须 hard fail：`ERROR:sctype_bridge_runtime_unavailable`。

## Runner 生成与静态合同

03e 每轮 runner 都是新生成物，因此必须约束生成结果本身。保存到 `<run_root>/scripts/` 后、读取 atlas 或进入 Step 1/2/3 前，必须执行 runner static contract audit：

`work/annotation/03e_runner_static_contract_audit.tsv`

至少包含：`check, status, detail, evidence_path`。任何 `status=fail` 必须立即停止。

static audit 必须检查：

- 本轮保存的 Python runner 和 R/helper 中存在真实 bridge 执行入口，不只是 preflight 表。
- 能定位到从 `scmarkeragent_db_human.RDS` 构建 gene sets / raw candidate labels 的代码。
- 能定位到读取 cluster-level expression summary 并输出 `sctype_rawoutput_top1/top2/top3`、score、backend、matched marker evidence 的代码。
- 能定位到 `03e_sctype_rawoutput_audit.tsv` 的写出代码。
- 能定位到 projection 输入只来自 `sctype_rawoutput_*` 的代码。
- 能定位到所有参与执行的 generator/preflight/helper 已复制到 `<run_root>/scripts/` 并记录 sha256。

static audit 必须阻断以下旧 runner 模板信号：

- `projection_rule = "marker_top1"` 或 `projection_rule=marker_top1`
- marker-derived `top1_label/top2_label` 写入 `raw_subtype_label_top1`、`raw_major_label_top1`、`Raw_Label_Primary`、`standard_major_candidate`、`standard_subtype_candidate`、`projection_try_*` 或 `sctype_rawoutput_*`
- hard-coded `MAJOR_MARKERS` / `SUBTYPE_MARKERS` 或 `cluster_marker_scores()` 的结果作为 dictionary projection 输入
- `raw_lable` / `sctype_rawlable` 作为正式 schema
- 保存的 runner 不包含 bridge 实现，却在日志中声称执行了 scType/scMarkerAgent

命中时 hard fail：`ERROR:legacy_marker_score_runner_template_detected`、`ERROR:marker_score_substituted_for_sctype_rawoutput` 或 `ERROR:sctype_bridge_implementation_missing`。

允许存在 marker scoring，但只能作为 `marker_qc_*`、`marker_coherence_*`、resolution ranking、rescue、acceptance gate 或 QC 使用。它不得写入 `sctype_rawoutput_*`、Raw_Label_Primary、projection 输入、figure raw output source 或 Section4 handoff raw label。

## sctype_rawoutput 合同

03e 中 raw output 只允许指 scType/scMarkerAgent bridge 的原始返回。正式列名必须使用 `sctype_rawoutput` 命名空间。

每个 Step3 major candidate cluster 与 Step4 subtype candidate cluster 必须输出：

- `sctype_rawoutput_top1`
- `sctype_rawoutput_top2`
- `sctype_rawoutput_top3`
- `score_top1`
- `score_top2`
- `score_top3`
- `delta`
- `sctype_rawoutput_consensus`
- `sctype_rawoutput_backend`
- `kb_source`
- `kb_sha256`
- `bridge_runtime_log`
- `projection_input_hash`
- `matched_positive_markers`
- `matched_negative_markers`

中央审计表：

`work/annotation/03e_sctype_rawoutput_audit.tsv`

必须覆盖 Step3/Step4 每个 candidate cluster，至少包含：

`stage, parent_major, resolution, cluster_id, n_cells, sctype_rawoutput_top1, score_top1, sctype_rawoutput_top2, score_top2, sctype_rawoutput_top3, score_top3, delta, sctype_rawoutput_consensus, sctype_rawoutput_backend, kb_source, kb_sha256, bridge_runtime_log, projection_input_hash, matched_positive_markers, matched_negative_markers`

每个 searchable parent major 还必须输出：

`work/annotation/subgroups/<major>/<major>_sctype_rawoutput_audit.tsv`

最终汇报必须展示 `03e_sctype_rawoutput_audit.tsv` 前 20 行；若少于 20 行则展示全部。只给 projection/final label 而不展示 raw output 原表，必须 hard fail：`ERROR:sctype_rawoutput_not_shown`。

## Projection 流程

Projection 只把 `sctype_rawoutput_*` 投射到标准候选标签，不产生 raw output。

顺序固定：

1. bridge 原始返回 `sctype_rawoutput_top1/top2/top3`
2. raw string normalization，只做大小写、空白、常见符号和同义拼写清理，不改变语义
3. Step4 subtype 先应用 `03d_subtype_raw_label_projection_overrides.tsv`
4. 再应用 `03d_stage_aware_raw_to_standard_projection_dictionary.tsv`
5. 再用 `scmarkeragent_label_projection.tsv` 作为 regex fallback / bridge 共用快速 canonicalization
6. 通过 fixed contracts：top-level、major、subtype
7. 通过 marker coherence、parent purity、CNV lock、protected-lineage rescue、acceptance gates
8. 写入 final `TopLevel_Compartment / Major_CellType / Cell_Subtype`

`standard_major_candidate` 和 `standard_subtype_candidate` 只能由 `sctype_rawoutput_*` 经上述 projection 得到。contract 只能做 namespace 合法性检查和保守 fallback，不能把非法 subtype 强行改写成另一个具体 subtype。

Projection 的 acceptance 不能只看 raw top1 是否能映射到某个标准标签。必须同时检查 `delta`、raw label domain、matched marker evidence、parent marker coherence 与 fixed contract namespace：

- `delta=0`、`delta` 很低、top1/top2/top3 语义冲突、或 raw label 为 `human cell / degenerative / nuclear factor / ML-2 / prospective ectoderm` 等泛化或外域标签时，不得作为 high-confidence final label；只能进入 low-confidence projection、parent-specific review、transition 或 `<parent>_unspecified`。
- marker coherence 只能做 acceptance/QC，不得替代 `sctype_rawoutput_*`；但若 marker coherence 明确反对 projection，必须 blocked 或 review。
- Step4 subtype 的 final subtype 必须属于该 parent major 的 contract namespace。若 Step4 在 `Fibroblast` parent 下投出 `Endothelial / T_cell / Myeloid / B_cell / NK_cell / Cancer_cell / Epithelial` 等跨 parent label，不得 `accept`；必须写入 `<parent>_parent_major_repair_audit.tsv` 和 `<parent>_subtype_acceptance_audit.tsv`，并执行 parent-major repair、protected-lineage rescue 或 hard review。
- `<parent>_parent_major_repair_audit.tsv` 不得无条件写 `pass`。必须至少包含候选数量、跨 parent 候选数量、已解释数量、未解释数量、decision、reason；若存在未解释跨 parent 候选，hard fail：`ERROR:parent_major_repair_audit_unresolved_cross_parent`。

### Cancer / epithelial projection 的 CNV 闭包保护

03e 禁止 dictionary/projection 直接把任意 scMarkerAgent raw label 写成正式 `Cancer_cell` 或 `Epithelial`。`Cancer_cell` 与 `Epithelial` 是 CNV-locked final major，不是普通 projection final major。

硬规则：

- Step3/Step4 projection 若命中 `cancer / malignant / tumor / carcinoma / epithelial` 类 raw label，只能先写为 `Epithelial_or_cancer_cell_candidate`、`standard_major_candidate_pre_cnv` 或 review candidate；不得直接写入正式 `Major_CellType=Cancer_cell/Epithelial`。
- `Cancer_cell` 只能由真实 Step2/closure CNV label `Tumor_cells_candidate` 产生；`Epithelial` 只能由真实 Step2/closure CNV label `Normal_Epithelial_candidate` 且 epithelial marker/coherence 支持时产生。
- raw label 中的 `tumor-associated` 是 context modifier，不是 malignancy label。以下模式必须 negative-guard，不得触发 `Cancer_cell`：`tumor-associated T cell(s)`, `tumor-infiltrating T cell(s)`, `tumor-associated macrophage`, `tumor-associated monocyte`, `tumor-associated fibroblast`, `tumor-associated CAF`, `tumor-associated NK`, `tumor-associated dendritic cell`, `tumor-associated mast cell`, 以及同义大小写/连字符变体。它们必须投回对应 immune/stroma parent，或进入 subtype/review；若被投成 `Cancer_cell`，hard fail：`ERROR:tumor_associated_context_misprojected_to_cancer`。
- 对非 Step2 epithelial top-level 中发现的 epithelial/cancer candidate，必须在 Step5 前执行 candidate closure，并写出 `work/annotation/03e_epithelial_cnv_candidate_closure.tsv`。该表至少包含 `cluster_id, n_cells, top_level_hint, sctype_rawoutput_top1, standard_major_candidate_pre_cnv, cnv_score_available, cnv_label_available, n_tumor_candidate, n_normal_candidate, tumor_fraction, epithelial_marker_support, parent_lineage_support, closure_decision, final_major_after_closure, reason`。
- candidate closure 可使用 Step2 已产生的真实 `CNV_Score` 和正式 cutoff 扩展判定候选 cluster；不得使用 median proxy、旧 label proxy 或 raw label proxy。若候选没有真实 CNV_Score，必须 hard fail：`ERROR:epithelial_cnv_candidate_missing_score`。
- candidate closure 的执行单元必须是明确的 candidate cells/subcluster，不得因为 selected-resolution cluster 内“任意一个细胞”属于 Step1 `Epithelial_or_cancer_cell` 就把整个 mixed cluster 送入 epithelial closure。禁止使用 `(top_level == Epithelial_or_cancer_cell).any()` 这类整簇路由条件；若 selected cluster 同时包含 Step1 Immune/Stroma/Non_cellular 与 epithelial candidate，必须先按 cell mask 或子聚类拆分，或将混合部分写入 review/hard fail：`ERROR:epithelial_closure_cluster_mixed_top_level_unresolved`。
- `03e_epithelial_cnv_candidate_closure.tsv` 中 `top_level_hint` 不得硬编码为 `Epithelial_or_cancer_cell`。必须记录真实 composition，至少附加 `n_step1_epithelial_or_cancer, n_step1_immune, n_step1_stroma, n_step1_noncellular, n_cnv_not_applicable, original_top_level_majority, closure_unit`。若最终会把 Step1 Immune/Stroma/Non_cellular 细胞改写为 `Cancer_cell/Epithelial`，必须 hard fail：`ERROR:epithelial_closure_rewrites_non_epithelial_lineage`。
- closure 决策必须 fail-closed：Tumor CNV 支持且 epithelial/carcinoma marker coherent 时可写 `Cancer_cell`；Normal CNV 支持且 epithelial marker coherent 时可写 `Epithelial`；immune/stroma parent marker 更强或 raw label 仅为 tumor-associated context 时必须回到 parent lineage / subtype review；混合 cluster 必须拆分、写 transition/review 或 hard fail，不得按 majority CNV 把整簇冒充 `Cancer_cell` 或 `Epithelial`。
- 每个最终 `Cancer_cell` 细胞必须有正式 `Epithelial_CNV_Label=Tumor_cells_candidate`；每个最终 `Epithelial` 细胞必须有正式 `Epithelial_CNV_Label=Normal_Epithelial_candidate`。最终 `Cancer_cell/Epithelial` 中 `not_applicable / CNV_unresolved / NaN / empty` 数量必须为 0，否则 hard fail：`ERROR:epithelial_cnv_coverage_incomplete`。
- Step5 closure 后必须比较 closure 前后 major distribution 与 Step1 top-level composition。若 Step1 Immune/Stroma 大量被改写成 `Cancer_cell/Epithelial`，或 Step3 已恢复的 `T_cell / B_cell / NK_cell / Myeloid / Endothelial / Smooth_muscle / Pericyte / Fibroblast` 被 closure 清零，必须 hard fail：`ERROR:major_parent_collapse_after_closure`。
- Step5 的 epithelial CNV coverage closure 不应再发现未解释的 `Epithelial/Cancer_cell` 缺 label。若仍存在，说明 candidate closure 或 projection guard 失败，必须 hard fail：`ERROR:epithelial_cnv_coverage_incomplete`，并同时输出 `03e_epithelial_cnv_candidate_closure.tsv` 供定位。

### sctype raw-output 审计落盘顺序

`03e_sctype_rawoutput_audit.tsv` 是 bridge 执行证据，必须在 Step4 subtype search 完成后、Step5 writeback / epithelial CNV coverage closure 前立即写出。不得等到 Step5 成功后才写中央 raw-output audit。

硬规则：

- Step3 major raw rows 与每个 parent Step4 raw rows 必须在 Step4 结束时合并写入 `work/annotation/03e_sctype_rawoutput_audit.tsv`。
- Step5 如果随后因 CNV coverage、handoff 或 QC hard gate blocked，`03e_sctype_rawoutput_audit.tsv` 仍必须存在且非空，以便审计 bridge 是否真实执行。
- 若 Step4 completed 但中央 raw-output audit 缺失、为空或未覆盖 candidate cluster，必须在 Step5 前 hard fail：`ERROR:central_sctype_rawoutput_audit_missing_before_writeback`。


## Step 0：preflight、assets 与 runner 合同

Step0 必须完成：

- 03e 规范 hash 校验
- atlas/QC hash 清单
- assets hash 与 forbidden assets runtime 检查
- runtime input allowlist 与 manifest
- runner static contract audit
- R bridge preflight
- bridge smoke test
- dictionary/contract lint

最低输出：

- `work/annotation/input_access_allowlist.tsv`
- `work/annotation/runtime_input_manifest.tsv`
- `work/annotation/03e_runner_static_contract_audit.tsv`
- `work/annotation/scmarkeragent_bridge_preflight.tsv`
- `work/annotation/03e_bridge_smoke_sctype_rawoutput.tsv`
- `work/annotation/03e_asset_hashes.tsv`
- `work/annotation/03e_dictionary_lint.tsv`
- `work/process/process_index.tsv`

若 Step0 未通过，不得读取 atlas 进入 Step1。

## Step 1：top-level coarse split

Step1 可使用结构性聚类、表达 marker program 与 QC 指标建立 top-level coarse compartment，但不得使用旧 `Major_CellType / Cell_Subtype / raw_label` 或旧 run annotation。Step1 只产生 coarse routing，不产生正式 `sctype_rawoutput_*`。

正式 top-level 包括：

- `Immune`
- `Stroma`
- `Epithelial_or_cancer_cell`
- `Non_cellular`
- `Review_queue`

Non-cellular / Artifact 必须经过 discard gate。若 discard evidence 不充分或 lineage marker 强，必须 review 或 QC fail，不能静默写为 Artifact。

## Step 2：真实 CNV 鉴瘤

Step2 必须真实执行 CNV，使用 `assets/gencode.v44.gene_positions.tsv.gz`。禁止 BioMart、median proxy、existing-label proxy、旧 CNV label 或 unresolved CNV 伪装结果。

正式输出至少包括：

- `work/annotation/epithelial_cnv_method.tsv`
- `work/annotation/epithelial_cnv_threshold.tsv`
- `work/annotation/epithelial_cnv_labels.tsv`
- `work/annotation/epithelial_cnv_density_source_data.tsv`
- `work/figures/section3/CNV_Score_Continuous_Density.pdf`
- `work/figures/section3/CNV_Score_Continuous_Density.png`
- `work/figures/section3/CNV_Score_Continuous_Density_source_data.tsv`
- `work/figures/section3/CNV_Score_Continuous_Density_caption.md`

CNV density 的 source_data 与 caption 必须一致：若 caption 声明只展示 Step1 epithelial/cancer candidates，source_data 必须过滤到该集合；若 source_data 包含全体细胞，caption 必须明确包含 `not_applicable` 的 Immune/Stroma/Non_cellular 背景。caption 必须写明 CNV score 类型、cutoff、threshold_method、Tumor/Normal 数量、source_data 行数和是否包含 non-epithelial background；否则 hard fail：`ERROR:cnv_density_caption_source_mismatch`。

只有真实 CNV 后产生的 `Tumor_cells_candidate / Normal_Epithelial_candidate` 可以进入 epithelial lock。`Cancer_cell` 的正式入口只能是 `Tumor_cells_candidate`，`Epithelial` 的正式入口只能是 `Normal_Epithelial_candidate` 加 epithelial marker/coherence 支持。若真实 CNV 失败，必须写 blocked 审计并立即停止，不得继续 Step3：`ERROR:epithelial_cnv_failed`。

Step3 若 scMarkerAgent/scType 原始输出提示 epithelial/cancer-lineage cluster，必须先写为 `Epithelial_or_cancer_cell_candidate` 或 review candidate，并纳入 `03e_epithelial_cnv_candidate_closure.tsv`；最终 Cancer_cell vs Epithelial 只能由真实 CNV closure 决定。`tumor-associated` 免疫/基质 raw label 不属于 epithelial/cancer candidate。

## Step 3：major 多分辨率搜索

对未被 Step2 epithelial/cancer lock 完成的细胞执行 major 多分辨率搜索。默认 resolution 至少包括：`0.2, 0.4, 0.6, 0.8, 1.0, 1.2`。

每个 resolution 必须真实重跑 Leiden，不得复用已有 global_cluster/cluster 作为不同 resolution 替代。每个 candidate cluster 必须执行 bridge，得到 `sctype_rawoutput_*`，再做 projection 与 acceptance。

必须输出：

- `work/annotation/03e_major_resolution_search.tsv`
- `work/annotation/03e_major_resolution_ranking.tsv`
- `work/annotation/03e_resolution_ranking_leakage_audit.tsv`
- `work/annotation/03e_major_resolution_underclustering_audit.tsv`
- `work/annotation/03e_major_resolution_lineage_recovery_audit.tsv`
- `work/annotation/03e_selected_resolution_state.h5ad`
- `work/annotation/03e_selected_resolution_cell_cluster.tsv`
- `work/annotation/03e_sctype_rawoutput_audit.tsv`

主 ranking score 必须是结构性 `composite_resolution_score`，至少包含：

`separation_score, homogeneity_score, marker_separation_score, cluster_size_balance_score, lineage_recovery_score, rare_lineage_recall_score, underclustering_penalty, split_gain_score, tiny_fragmentation_penalty`

禁止用于主 ranking score 或 tie-break：

`Major_CellType, Cell_Subtype, raw_label, sctype_rawoutput_top1, TopLevel_Compartment, Epithelial_CNV_Label, CNV_Score, align_fraction, mean_top1_score`

若更高 resolution 稳定恢复 NK_cell、Pericyte、Smooth_muscle、Endothelial、B_cell/Plasma_B、Mast/DC 等正式 marker program，而低 resolution 将其吞入 T_cell、Fibroblast 或其它 broad parent，低 resolution 必须 underclustering penalty 或 hard reject。

Ranking 分数组件必须有明确尺度，`separation_score, homogeneity_score, marker_separation_score, cluster_size_balance_score, lineage_recovery_score, rare_lineage_recall_score, split_gain_score, tiny_fragmentation_penalty` 应限制在 `[0, 1]`；若使用 `n_clusters / K` 作为 split gain，必须 `min(1, n_clusters / K)` 截断；`split_gain_score` 不得 >1。不得让未归一化的 `split_gain_score > 1` 推动选择高 resolution。若 selected resolution 的 `homogeneity_score` 或 `cluster_size_balance_score` 接近 0，必须在 ranking audit 中说明为什么不是过度碎片化，否则 hard fail：`ERROR:resolution_score_component_out_of_range` 或 `ERROR:selected_resolution_fragmentation_unexplained`。

`lineage_recovered=True` 只能表示 exact lineage 已形成 accepted final major，或已在 Step3.5 `rescue_to_major` 到该 lineage。若 `n_clusters=0`，不得写 `lineage_recovered=True`。

## Step 3.5：protected-lineage rescue 与 major finalization

Step3.5 必须以 selected-resolution cluster 为单位执行 protected-lineage audit，不得只按 parent-major 全体比例判定。

protected lineages 至少包括：

- `NK_cell`
- `Pericyte`
- `Smooth_muscle`
- `Endothelial`
- `Plasma_B`
- `Mast_cell`
- `Dendritic_cell`

必须输出：

- `work/annotation/03e_protected_lineage_rescue_audit.tsv`
- `work/annotation/03e_lineage_rescue_decisions.tsv`
- `work/annotation/03e_rearrangement_cases.tsv`
- `work/annotation/03e_rearrangement_marker_top10.tsv`

T_cell parent 中 NK candidate：

- NKG7/GNLY/KLRD1/PRF1/FGFBP2/FCGR3A 高且 CD3D/CD3E/TRAC 弱：必须 rescue_to_major 到 NK_cell 或 hard review。
- NK/cytotoxic marker 高但 CD3D/CD3E/TRAC 同时强：不得作为 NK_like_in_T_parent 阻断整个 T parent；解释为 cytotoxic/NKT-like T evidence 或进入 T subtype review。

Fibroblast parent 中 Pericyte/Smooth_muscle candidate：

- protected_marker_score >= parent_core_marker_score 且 n_cells >= min_cells：必须 rescue_to_major 到对应 Pericyte 或 Smooth_muscle。
- 0 < parent_core_marker_score - protected_marker_score <= 0.15：必须写为 `Stroma_transition` 或等价 transition namespace，并设置 lineage_rescue_applied=True。
- 禁止把同一 Stroma top-level 内 Fibroblast-vs-Pericyte/Smooth_muscle close-score candidate 直接 hard_review_queue 阻断。
- 禁止把 Pericyte/Smooth_muscle marker 只作为 Fibroblast/myoCAF subtype 吞掉。

Step3.5 完成后，`Major_CellType` 必须稳定。Step4 不得直接改写 major。

## Step 4：parent-specific subtype search

每个 searchable parent major 必须独立执行 subtype 多分辨率搜索、独立 bridge、独立 marker pool、独立 projection audit。禁止跨 parent major 共享 subtype candidate、marker pool、ranking objective 或 bridge 结果。

searchable parent 至少包括：

`B_cell, T_cell, NK_cell, Myeloid, Fibroblast`

每个 parent 必须输出：

- `work/annotation/subgroups/<major>/<major>_subtype_resolution_search.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_resolution_ranking.tsv`
- `work/annotation/subgroups/<major>/<major>_parent_major_repair_audit.tsv`
- `work/annotation/subgroups/<major>/<major>_sctype_rawoutput_audit.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_cluster_mapping.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_acceptance_audit.tsv`

Step4 前必须执行 parent-major repair gate。若 repair candidate 已在 Step3.5 被 `rescue_to_major`、`transition_major`、`hard_review_queue` 或 `explained_as_parent_subtype_signal` 明确解释，则不得再阻断整个 parent。若存在未解释 repair candidate，必须 hard fail，不得 fallback 到 `<parent>_unspecified` 后继续。

T_cell subtype search 必须审计并优先保留稳定的：

`Treg, TCF7_CD8, Cytotoxic_CD8, Exhausted_CD8, GammaDelta_T, NKT_like, MAIT_like, CD4_Naive, CD4_Memory, Th1, Th2, Th17, Tfh`

若 T_cell 最终全部为 `T_cell_unspecified`，必须 hard fail，除非 subtype search 真实执行并提供 marker-based 证据证明所有 T-cell child cluster 不稳定。

Step4 completed 前必须合并 Step3 与所有 parent Step4 bridge raw rows，写出非空 `work/annotation/03e_sctype_rawoutput_audit.tsv`；该文件缺失时不得进入 Step5 writeback。

若 Step3 selected major mapping 中某个 searchable parent 有细胞，但 Step4 parent status 写成 `no_cells_without_rescue_candidate`，必须解释这些细胞在 Step3.5/closure 中被 `rescue_to_major / transition_major / review / epithelial_closure` 合法处理；若解释缺失或是被 epithelial closure 吞并，hard fail：`ERROR:searchable_parent_lost_before_subtype_unexplained`。若 Step1 Immune 很大但 T/B/NK/Myeloid 全部为 0，不得写 Step4 completed，必须 hard fail：`ERROR:immune_parent_collapse_before_subtype`。

Subtype ranking 必须包含 subtype-specific underclustering 和 specificity 指标，不得把 `subtype_underclustering_penalty / split_gain_score / nonfallback_subtype_fraction / specific_subtype_recovery_score / unspecified_fallback_penalty / broad_subtype_penalty` 固定为全 0 占位后选择过粗 resolution。Subtype acceptance 必须把 cross-parent label、低 delta、外域 raw label、与 parent marker coherence 冲突的 label 标为 `review / repair_required / reject`，不得简单地把所有 non-unspecified label 记为 `accept`。

## Step 5：正式回写与 Section4 handoff

正式 h5ad obs 至少包含：

- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Primary_Cell_Annotation`
- `Primary_Cell_Annotation_Level`
- `Raw_Label_Primary`
- `sctype_rawoutput_top1`
- `sctype_rawoutput_top2`
- `sctype_rawoutput_top3`
- `sctype_rawoutput_consensus`
- `sctype_rawoutput_backend`
- `sctype_rawoutput_score_top1`
- `standard_major_candidate`
- `standard_subtype_candidate`
- `projection_rule`
- `Annotation_Method`
- `annotation_confidence`
- `CNV_Score`
- `Epithelial_CNV_Label`
- `discard_flag`
- `exclude_from_feature_engineering`
- `section4_ready`
- `section3_major_cluster_id`
- `section4_subtype_cluster_id`

`Raw_Label_Primary` 必须等于权威 `sctype_rawoutput_top1`，除非该细胞为 CNV epithelial lock；此时可等于真实 CNV label，但必须在 `projection_rule=cnv_lock` 中说明。Legacy `raw_label / raw_subtype_label_* / top1_raw_label` 若保留，只能作为等值 alias，不得驱动 projection。

Step5 前必须执行 `03e_epithelial_cnv_candidate_closure.tsv` 和 epithelial CNV coverage closure。所有 projection-derived epithelial/cancer candidates 必须先经 closure 决策转为 `Cancer_cell / Epithelial / parent lineage / transition / review`。任何最终 Epithelial/Cancer_cell 缺真实 `CNV_Score` 或正式 `Epithelial_CNV_Label` 都必须 blocked；任何 `tumor-associated` immune/stroma raw label 被投成 Cancer_cell 也必须 blocked。

Step5 writeback 必须输出并检查 closure 前后对照表，至少包含 `pre_closure_major, post_closure_major, TopLevel_Compartment_step1, n_cells`。若 `post_closure_major in {Cancer_cell, Epithelial}` 的细胞来自 Step1 `Immune/Stroma/Non_cellular`，或其 `Epithelial_CNV_Label=not_applicable`，不得写入 h5ad/Section4 handoff，必须 blocked。Step5 不得用 cluster majority CNV 把非 candidate 细胞批量继承 `Cancer_cell/Epithelial`。

必须导出 Section4 input：

- `work/section4_input/merged.section3_for_section4.h5ad`
- `work/section4_input/per_dataset/<dataset>.section3_for_section4.h5ad`
- `work/section4_input/section4_h5ad_export_manifest.tsv`
- `work/section4_input/section4_obs_schema.tsv`
- `work/section4_input/section4_feature_eligibility.tsv`

## Step 6：figures、QC 与 handoff 审计

必须输出：

- `work/qc/section3_engineering_qc.tsv`
- `work/qc/section3_scientific_qc.tsv`
- `work/qc/section3_process_integrity_qc.tsv`
- `work/qc/section3_section4_handoff_qc.tsv`
- `work/qc/section3_issue_list.tsv`
- `work/qc/section3_qc_report.md`

必须输出图件四件套：

- CNV density：`CNV_Score_Continuous_Density.pdf/png/source_data.tsv/caption.md`
- 每个有细胞 parent major 的 subtype UMAP final label 图
- 每个有细胞 parent major 的 projection_try 图
- 每个有细胞 parent major 的 `sctype_rawoutput` 图：`<major>_Subtype_UMAP_sctype_rawoutput.pdf/png/source_data.tsv/caption.md`

`sctype_rawoutput` 图 source data 必须包含：

`cell_id, UMAP1, UMAP2, Major_CellType, Cell_Subtype, projection_try_subtype, sctype_rawoutput_top1, sctype_rawoutput_consensus, sctype_rawoutput_backend, section4_subtype_cluster_id`

## 硬失败条件

以下情况必须 fail 或 blocked，不得 completed：

- 03e hash mismatch
- runner static contract audit 缺失或 fail
- bridge smoke test 缺失或 fail
- 保存的 runner 与实际执行脚本 provenance 不一致
- bridge 未执行、返回空、缺 required raw-output columns 或 backend 非法
- `sctype_rawoutput_*` 由 marker scoring、projection、contract fallback 或 hard-coded label 替代
- `projection_rule=marker_top1` 出现在正式输出、Section4 handoff 或 figure source
- ScTypeDB/PanglaoDB/CellMarker 等非 scMarkerAgentDB 用于生成 raw output
- 旧 run 产物作为 runtime 输入
- CNV blocked/unresolved 却继续 Step3
- Cancer_cell 无 Tumor_cells_candidate CNV 支持
- Epithelial/Cancer_cell 缺真实 CNV_Score 或正式 Epithelial_CNV_Label
- epithelial closure 因 selected cluster 含任意 Step1 epithelial 细胞而整簇改写 mixed cluster
- Step1 Immune/Stroma/Non_cellular 细胞被 Step5 改写成 Epithelial/Cancer_cell
- Step3 已恢复的 searchable/protected parent 在 Step5 closure 后无解释清零
- `tumor-associated` immune/stroma context raw label 被投成 Cancer_cell
- Step4 completed 后、Step5 前缺失中央 `03e_sctype_rawoutput_audit.tsv`
- CNV density 图缺失或 source_data 为空
- resolution ranking list 缺失或 selected != 1
- leakage audit 缺失或存在 fail
- lineage_recovered=True 但 n_clusters=0 且没有 rescue_to_major
- Step3 selected-resolution checkpoint 不完整
- 未解释 parent_major_repair_gate_fail
- Step4 已提示 completed 但任一 searchable parent major 实际 failed/blocked/no_cells_with_rescue_candidate
- Step3 selected major mapping 中有 searchable parent 细胞，但 Step4 status 无解释写成 no_cells_without_rescue_candidate
- Step4 subtype 投出跨 parent label 却被 `accept` 或 parent repair audit 无条件 pass
- T_cell 全部 unspecified 且没有 marker-based 证据支持
- Pericyte/Smooth_muscle marker program 被 Fibroblast/myoCAF 静默吞并
- Non_cellular/Artifact 无 discard gate 支持或带强 lineage marker 且 discard_flag=False

## 完成检查

- [ ] 新 run 目录唯一、洁净、前台执行
- [ ] 03e hash 校验通过
- [ ] runtime input manifest 只含 allowlist
- [ ] runner static contract audit pass
- [ ] bridge preflight pass 且 bridge smoke test pass
- [ ] `03e_sctype_rawoutput_audit.tsv` 覆盖 Step3/Step4 candidate cluster
- [ ] 最终汇报展示 `03e_sctype_rawoutput_audit.tsv` 前 20 行
- [ ] Step2 真实 CNV 成功或 fail-closed blocked
- [ ] Step3 多分辨率 Leiden 真实重跑，ranking/leakage/underclustering/recovery audit 完整
- [ ] Step3.5 protected-lineage rescue audit 完整
- [ ] Step4 每个 searchable parent 独立 subtype search 与 bridge 完整
- [ ] Step5 h5ad 和 Section4 handoff 完整
- [ ] Step6 工程/科学/process/handoff QC 全部 pass

## 最终汇报要求

完成或 blocked 后必须汇报：

- 新 run 目录
- atlas hash
- 03e 规范 hash
- QC h5ad 数量
- 关键 assets hash
- runtime_input_manifest 是否只包含 allowlist
- runner static contract audit 状态
- bridge preflight 与 smoke test 状态、backend、bridge log
- `03e_sctype_rawoutput_audit.tsv` 路径，并粘贴前 20 行
- 冗余/历史资产是否被跳过
- 真实 CNV 是否成功
- Tumor_cells_candidate / Normal_Epithelial_candidate 数量
- CNV cutoff、threshold_method、density 图路径
- CNV_Score 类型
- selected major resolution
- `03e_major_resolution_ranking.tsv` 前几名
- leakage audit 是否 fail
- NK_cell / Pericyte / Smooth_muscle 最终数量
- T_cell subtype 分布
- Artifact / Non_cellular 数量及 gate 状态
- 所有硬 QC 是否 pass
- 若 blocked，报告 error_code、对应文件和具体原因
