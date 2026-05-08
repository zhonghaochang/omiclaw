---
name: 03d-robust-clustering-annotation-scmarkeragent-sctype
description: Section 3 鲁棒版独立规范：修复 Step3 resume 的 cluster-id 漂移、Step4 subtype 强制投射、低置信接受、以及 transition/unspecified 过度兜底问题；要求 exact checkpoint resume、major purity gate、稳健 rearrangement/discard、优先恢复具体 mature/subtype 标签，以及 Section 4-ready annotated h5ad 交付。
type: reference
---

# Section 3 变体：03d Robust Annotation and Resume-safe Pipeline

## 适用场景

当任务同时满足以下条件时，使用本规范替代 `03c-new-clustering-annotation-scmarkeragent-sctype.md`：

- 仍使用 `scMarkerAgent` 原始标签与 `ScType(R)` cluster-level 打分
- 正式 top/major/subtype 投射仍依赖 `assets/dictionary/03d_*`
- 需要避免 Step3 resume 期间的 `cluster_id` 漂移
- 需要避免 Step4 subtype 在错误 major pool 内强制闭集投射
- 需要将 `rearrangement` 改造成更保守、更可审计、允许多次失败后谨慎 soft discard 的流程
- 需要向 Section 4 直接交付可用的 annotated `.h5ad`

同一 run 中：

- 只能选择 `03-clustering-annotation.md`
- 或 `03b-clustering-annotation-scmarkeragent-sctype.md`
- 或 `03c-new-clustering-annotation-scmarkeragent-sctype.md`
- 或本规范 `03d-robust-clustering-annotation-scmarkeragent-sctype.md`

四者不得混用。

## 本规范明确修复的失败模式

- `resume_cluster_id_drift`
  不允许“重跑 Leiden 得到新的 `cell_cluster`，再复用旧 Step3 mapping/marker/bridge 输出”。
- `subtype_closed_world_force_projection`
  不允许把明显跨谱系的 subgroup cluster 留在原 parent major 内继续硬投射 subtype。
- `low_confidence_subtype_acceptance`
  不允许 `top1_score <= 0`、`top1-top2 delta` 过小、或 marker 与 parent major 冲突时仍正式接受 subtype。
- `runtime_query_failed_fallback`
  不允许 `runtime_query_failed` 后退化为硬编码 marker-major 推断并继续写正式 `final_major`。
- `stage4_dictionary_cross_lineage_pollution`
  不允许 `step4_{major}` 字典中保留明显不属于该 lineage 的 raw label 作为 subtype gene-set 来源。
- `cnv_blocked_as_normal_proxy`
  不允许把 `cnv_blocked / cnv_not_run / CNV_unresolved / 空 CNV label` 当作 `Normal_Epithelial_candidate` 写回；strict run 必须重新执行真实 inferCNV，若真实 inferCNV 失败则显式 blocked。
- `cellular_label_to_artifact_contract_fallback`
  不允许 Step 5 contract repair 把 `Unknown + DC/pDC/cDC/Monocyte` 等细胞性标签兜底成 `Non_cellular / Artifact`；若 major 字段实际是 subtype，必须先通过 subtype contract 回推 parent major。

## 核心原则

- Python / AnnData 持有正式 atlas 状态、正式 `.h5ad`、正式 checkpoint、正式 process 文档
- R / scType / scMarkerAgent 必须真实执行，并且只负责 cluster 级 `sctype_rawoutput`、score、runner-up、marker evidence
- `CNV` 仍是 epithelial malignancy 的主判据；`scType` 给出的 `Cancer_cell` 只能触发复核，不能替代 Step 2
- `sctype_rawoutput` 必须被永久保留并写入正式输出；`standard_label` 只能由 `sctype_rawoutput` 经 dictionary/contract 投射并通过置信门禁后正式采用
- `stage_03c` 是 runtime stage selector；`source_stage` 与 `source_canonical_label` 只允许作为 legacy provenance 字段存在，不得参与 Step 4 subtype 接受/拒绝决策
- `soft discard` 只允许写标志位和下游排除元数据，不得物理删除 atlas 中的细胞
- `progenitor / precursor / transition / hybrid` 是风险语义，默认保留，不得因为想凑成熟 major 而被剥离
- 03d dictionary bundle 是 top/major/subtype 的正式合同，但不是无条件接受的自动真理
- Step 4 的 subtype 结果必须同时通过 `字典投射 + marker coherence + parent-major purity + 低冲突`
- 任何 runtime external arbitration 必须真的命中外部证据；失败时只能进入 review queue 或谨慎 discard，不能伪装成完成仲裁
- 任何大步、小步、子步骤都必须写 checkpoint，并支持从最近有效 checkpoint 恢复


### scType / scMarkerAgent 原始输出硬门禁

本规范中的 raw output 只允许指 scType/scMarkerAgent backend 的原始返回值。为避免与 marker top1、dictionary canonical label 或 fallback label 混淆，所有新产物必须使用 `sctype_rawoutput` 命名空间。

硬约束：

- Step 3 major 与 Step 4 subtype 的每个 candidate cluster 必须真实调用 scType/scMarkerAgent bridge，或真实调用等价的本地 scMarkerAgent RDS bridge；不得用 Python 内置 marker scoring、hard-coded marker set、dictionary canonical label、contract fallback、或 `projection_rule=marker_top1` 冒充原始输出。
- scType/scMarkerAgent bridge 必须输出并保存 `sctype_rawoutput_top1 / sctype_rawoutput_top2 / sctype_rawoutput_top3`、对应 score、backend 名称、KB/filter tier、matched positive/negative markers 与 projection audit。
- 每轮 run 必须写出中央 raw-output 审计表：`work/annotation/03d_sctype_rawoutput_audit.tsv`，覆盖 Step 3 major 与 Step 4 subtype 的每个 candidate cluster。该表至少包含 `stage, parent_major, resolution, cluster_id, n_cells, sctype_rawoutput_top1, score_top1, sctype_rawoutput_top2, score_top2, sctype_rawoutput_top3, score_top3, delta, sctype_rawoutput_backend, kb_source, kb_sha256, bridge_runtime_log, projection_input_hash`。`kb_source` 必须是 `scmarkeragent_db_human.RDS`，且 raw 值必须来自 bridge 原始输出。
- 最终汇报必须直接展示 `03d_sctype_rawoutput_audit.tsv` 的前 20 行；若少于 20 行则展示全部。只给 projection/final label、不展示 `sctype_rawoutput_*` 原表，必须判定为 hard fail：`ERROR:sctype_rawoutput_not_shown`。
- `standard_major_candidate`、`standard_subtype_candidate` 只能由 `sctype_rawoutput_*` 经 `03d_subtype_raw_label_projection_overrides.tsv`、`03d_stage_aware_raw_to_standard_projection_dictionary.tsv`、`scmarkeragent_label_projection.tsv` 与 fixed contract 投射得到。
- marker program / in-script marker set 只能用于 resolution ranking、marker coherence、acceptance gate、rescue audit 和 QC；不得写入任何 `sctype_rawoutput_*` 列，不得作为 dictionary projection 的输入。
- 若 scType/scMarkerAgent bridge 未执行、返回空值、缺少 required output columns、或 source_backend 不是 `scType` / `scMarkerAgent` / 明确等价本地 bridge，必须 hard fail：`ERROR:sctype_rawoutput_missing_or_substituted`。
- 若任何正式输出、Section 4 handoff h5ad 或 figure source 中出现 `projection_rule=marker_top1`、`raw_subtype_label_top1` 等 marker top1 结果被当作原始输出使用，必须 hard fail：`ERROR:marker_score_substituted_for_sctype_rawoutput`。
- 允许保留 legacy `raw_label` / `raw_subtype_label_*` 列作为只读兼容别名，但它们必须逐行等于相应 `sctype_rawoutput_*`，且 caption/schema 必须声明 canonical source 为 `sctype_rawoutput`；不得反向用 legacy 列驱动投射。
- runner 启动 Step 3 前必须执行 scType/scMarkerAgent bridge preflight：默认使用 `assets/scmarkeragent_bridge_config.json` 中的 `/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite`，验证 Rscript 可启动、必需 R 包 `Seurat / UCell / HGNChelper / data.table / Matrix / readr / scales` 可加载、`scmarkeragent_db_human.RDS` 可读、bridge config/projection 可读、输出 `work/annotation/scmarkeragent_bridge_preflight.tsv`，并记录 `r_env_path`、`rds_sha256`、`source_backend`、`required_packages_available`、`scmarkeragent_rds_available`、`sctype_style_scoring_available`、`local_rds_bridge_available`、`preflight_status`。若既没有可用 scType scoring 函数，也没有明确的本地 RDS bridge 实现，必须 hard fail：`ERROR:sctype_bridge_runtime_unavailable`。缺少可选 `ScType` R package 本身不构成通过或失败依据；只有真实 bridge 能否产出 `sctype_rawoutput_*` 构成依据。

### 层级注释优先级

每一层正式注释都必须优先恢复证据支持的、非 transition、非 unspecified 的具体类群；`*_transition`、`*_unspecified`、`Unknown`、`review_queue` 只能作为证据不足、真实混合状态、或风险语义保留时的保守出口，不能作为 resolution 过粗或 subtype 搜索失败后的便利默认值。

优先级从高到低为：

- 稳定、非碎片化、marker coherent 的具体 mature lineage / concrete subtype
- 同一 top-level 内真实混合或连续状态，且无法无损拆分时的 `*_transition`
- 已执行完整搜索但证据不足时的 parent fallback / `*_unspecified`
- marker 缺失、跨谱系冲突或 runtime arbitration 不足时的 hard review queue

硬约束：

- 若更高 resolution 中存在稳定 child cluster，且该 child cluster 支持非 transition、非 unspecified 的正式标签，则较低 resolution 不得把它吞并为 `*_transition`、`*_unspecified`、parent broad label 或 review fallback。
- 若一个 transition cluster 可被更高 resolution 稳定拆成多个 mature child cluster，必须优先拆分并写回具体 mature major/subtype；只有剩余无法稳定拆分的混合部分才允许保留 transition。
- 若一个 parent major 的 subtype 搜索能稳定恢复多个具体 subtype，不得因为低 resolution 的 separation/size balance 略高而选择只产生 broad subtype 或 parent fallback 的 resolution。
- 禁止为了减少 transition/unspecified 而剥离 `progenitor / precursor / transition / hybrid` 等真实风险语义；优先规则只适用于 marker、size、purity、acceptance gate 均通过的稳定 cluster。

## 正式资产

本规范的正式 dictionary / contract 资产一律从以下路径读取，且只能从 skill assets 当前路径读取，不得从任何旧 run 目录读取副本：

必须读取的 projection / contract 资产：

- `assets/dictionary/03d_fixed_projection_contract_top_level.tsv`
- `assets/dictionary/03d_fixed_projection_contract_major_celltype.tsv`
- `assets/dictionary/03d_fixed_projection_contract_subtype.tsv`
- `assets/dictionary/03d_raw_to_standard_projection_policy.tsv`
- `assets/dictionary/03d_merge_conflict_unknown_policy.tsv`
- `assets/dictionary/03d_stage_aware_raw_to_standard_projection_dictionary.tsv`
- `assets/dictionary/03d_subtype_raw_label_projection_overrides.tsv`
- `assets/dictionary/03d_projection_review_queue.tsv`
- `assets/dictionary/03d_manual_normalization_map.tsv`

说明：部分历史 dictionary 文件名或列名仍含 `raw_label`（例如 `raw_label_include_regex`、`raw_label`），其语义仅限于“匹配 scType/scMarkerAgent 的 `sctype_rawoutput` 字符串”；这些名称不得出现在新的正式 h5ad/figure/source schema 中作为权威原始输出列。

必须读取的 scType/scMarkerAgent bridge 资产：

- `assets/scmarkeragent_db_human.RDS`
- `assets/scmarkeragent_bridge_config.json`
- `assets/scmarkeragent_label_projection.tsv`
- `assets/sctype/sctype_score_.R` 可作为可审计 scoring helper；若 runner 自带等价 ScType-style scoring 实现，也必须在 bridge audit 中记录实现 hash。

说明：03d 的正式知识库只能是 `scmarkeragent_db_human.RDS`。这里的 `scType` 指 cluster-level scoring style/function，不指引入官方 `ScTypeDB_full.xlsx` 或 `ScTypeDB_short.xlsx` 作为第二套知识库。所有 gene sets / candidate raw labels 必须从 `scmarkeragent_db_human.RDS` 构建；projection 必须继续走 `scmarkeragent_label_projection.tsv` 与 03d dictionary/contract。

硬约束：若 runtime manifest、bridge log、source data 或 h5ad provenance 显示使用了 `ScTypeDB_full.xlsx`、`ScTypeDB_short.xlsx`、PanglaoDB、CellMarker 或任何非 `scmarkeragent_db_human.RDS` 的库来生成 `sctype_rawoutput_*`，必须 hard fail：`ERROR:sctype_db_used_as_runtime_kb`。

必须读取的 CNV 资产：

- `assets/gencode.v44.gene_positions.tsv.gz`

只允许作为 marker coherence / acceptance QC 使用、不得产生 `sctype_rawoutput` 的资产：

- `assets/immune_subtype_markers.tsv`
- `assets/stroma_subtype_markers.tsv`

以下文件在 03d Section 3 正式流程中为冗余或历史审计物，默认不得读取；只有在显式的 dictionary-maintenance / literature-review 任务中才允许读取，并且不得进入 runtime hash/cache/input manifest：

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
- `assets/dictionary/03d_upgrade_summary.*`
- `assets/dictionary/03d_upgrade_qc_report.*`
- `assets/dictionary/03d_projection_review_queue_legacy_stage_residue.tsv`
- `assets/dictionary/03d_stage4_cross_lineage_removed_from_dictionary*.tsv`
- `assets/dictionary/03d_source_stage_normalization_audit.tsv`

若仍检测到旧 `assets/03c_*` dictionary 路径、旧 run 目录中的 `scripts/`、`work/annotation/`、`work/checkpoints/`、`work/cache/`、`section4_input/`、`*.h5ad`、或旧 run 产物被作为 runtime 输入，必须直接失败：`ERROR:cross_run_or_old_asset_read_detected`。

## 正式标签体系

### TopLevel_Compartment

必须严格使用：

- `Immune`
- `Stroma`
- `Non_cellular`
- `Epithelial_or_cancer_cell`

### Major_CellType

必须严格使用：

- `B_cell`
- `T_cell`
- `NK_cell`
- `Myeloid`
- `Immune_transition`
- `Fibroblast`
- `Endothelial`
- `Pericyte`
- `Smooth_muscle`
- `Stroma_transition`
- `EVs_or_microparticles`
- `Artifact`
- `Organelle`
- `Cancer_cell`
- `Epithelial`

硬约束：

- `top=Stroma` 时，最终 `major=Stroma` 必须为 `0`
- `Cancer_cell` 不能通过 Step 3.5 直接制造，只能来自 Step 2 的 `Tumor_cells_candidate`
- `EVs_or_microparticles / Artifact / Organelle` 是 formal major，但只能通过 `discard/review` 流程生效
- `Immune_transition / Stroma_transition` 不是成熟 lineage 的替代终点；若同一 cluster 或 higher-resolution child cluster 支持 `B_cell / T_cell / NK_cell / Myeloid / Fibroblast / Endothelial / Pericyte / Smooth_muscle` 等具体 major，必须优先 rescue 到具体 major 或拆分后分别写回。
- `*_transition` 只能在具体 mature major 之间存在真实连续/混合证据，且 higher-resolution 拆分未通过 size/marker/fragmentation QC 时使用；不得因为 score delta 小、dictionary 冲突或 external query 失败而默认进入 transition。
- 每个 top-level 下若最终 transition 细胞占比异常升高，必须输出 `transition_priority_audit.tsv` 或等价审计，说明哪些 candidate 已尝试 mature rescue、哪些因何保留 transition。

### Cell_Subtype

必须使用 `03d_fixed_projection_contract_subtype.tsv` 作为正式闭集合同与 fallback 来源，但不得把它当作“失败后重新挑一个具体 subtype”的搜索空间。

正式写回时分为三层：

- `sctype_rawoutput_top1 / sctype_rawoutput_top2 / sctype_rawoutput_top3`
  来自 scType/scMarkerAgent bridge 的原始 subtype 候选，必须保留；这是唯一允许进入 dictionary projection 的 raw output。
- `standard_subtype_candidate`
  由 `sctype_rawoutput_top1` 经 stage-aware dictionary / override / projection rules 投射得到的标准 subtype 候选，必须保留，即使最终不被接受。
- `Cell_Subtype`
  仅在 `standard_subtype_candidate` 通过 subtype acceptance gate 后才正式采用；否则只能回落到该 `parent_major` 在 `03d_fixed_projection_contract_subtype.tsv` 中定义的默认 fallback subtype。

`raw_subtype_label_top1 / raw_subtype_label_top2 / raw_subtype_label_consensus` 若保留，只能作为 legacy alias，必须与 `sctype_rawoutput_*` 同步；不得作为权威 raw output。

fallback 规则必须严格绑定到真实 contract：

- `B_cell -> B_cell_unspecified`
- `T_cell -> T_cell_unspecified`
- `NK_cell -> NK_cell_unspecified`
- `Myeloid -> Myeloid_unspecified`
- `Fibroblast -> Fibroblast`
- `Endothelial -> Endothelial`
- `Pericyte -> Pericyte`
- `Smooth_muscle -> Smooth_muscle`
- `Immune_transition -> Immune_transition`
- `Stroma_transition -> Stroma_transition`
- `EVs_or_microparticles -> EVs_or_microparticles`
- `Artifact -> Artifact`
- `Organelle -> Organelle`
- `Cancer_cell -> Cancer_cell`
- `Epithelial -> Epithelial`

原则：

- contract 只负责定义“这个 parent major 在 subtype 失败时最保守能落到哪里”
- contract 不能在 subtype 失败后替代证据系统，为该 parent major 再挑一个更具体 subtype
- `*_unspecified` 不是 subtype search 的成功标签；若 parent 内存在稳定 child cluster 支持 contract 内具体 subtype，必须优先写回具体 subtype，并只让未通过 acceptance gate 的 cluster 回落到 fallback。
- 对 T cell、B cell、Myeloid、NK cell、Fibroblast 等 searchable parent，若更高 subtype resolution 稳定恢复多个具体 subtype，不得选择只产生 parent fallback、broad family label、或少数粗标签的低 resolution，除非 higher-resolution child cluster 被明确判定为 tiny fragmentation 或 marker incoherent。
- broad family subtype 只能作为低置信或证据不足的保守层级，不得吞并已稳定恢复的更具体 subtype。例如 T cell 中若 `Treg / Cytotoxic_CD8 / Exhausted_CD8 / TCF7_CD8 / NKT_like / MAIT_like / GammaDelta_T` 任一 child cluster 通过 size、marker、delta 与 parent purity gate，则必须优先保留该具体 subtype，而不能因 `CD4_helper` 或 parent-level T marker 更高而合并。

## 工程硬门禁

- 禁止后台 `start_job`
- 必须前台执行，并在每个大步开始前写 process 文档
- wrapper / strict runner 只允许替换主流程，不允许先跑 legacy step 再 patch 正式结果
- 正式 annotation 表与 `.h5ad obs` 不得保留 `*_strict / *_legacy / *_patched` 这类双轨最终列
- Step 3.5 结束后，`final_top / final_major / final_decision_mode` 必须已经稳定；Step 4/5/6 不得再偷偷改写 major

## checkpoint / resume 合同

### 全局规则

- 只能从最近一个同时满足 `manifest + _READY + input sha256 一致` 的 checkpoint 恢复
- 任何输入资产路径、合同文件、字典文件、bridge config、selected-resolution cluster 资产的 sha256 改变，都必须触发 checkpoint invalidation
- 每次 `read_h5ad()` 或恢复后，都必须重新检查 obs 列类型是否可写；categorical 列必须先安全转回字符串再回写

### Step3 selected-resolution 的强制持久化

selected-resolution checkpoint 必须与现有 `resolution_runs/res_x/` 结构兼容。

允许两种等价实现：

- 直接冻结并复用原始 `work/annotation/checkpoints/step3_major_search/resolution_runs/res_x/` 目录
- 复制一份等价 snapshot 到 `work/annotation/checkpoints/step3_major_search/selected_resolution/`

无论使用哪种方式，都必须通过单一 manifest 无歧义定位 exact selected-resolution 资产，不得靠重新计算恢复。

`work/annotation/checkpoints/step3_major_search/selected_resolution/` 或其等价 manifest 至少必须保存：

- `selected_resolution.txt`
- `selected_resolution_manifest.tsv`
- `selected_resolution_params.json`
- `selected_resolution_input_cells.tsv`
- `selected_resolution_cell_order.tsv`
- `selected_resolution_cell_cluster.tsv`
- `selected_resolution_cluster_meta.tsv`
- `selected_resolution_cluster_markers.tsv`
- `selected_resolution_cluster_means.tsv`
- `selected_resolution_projection_raw.tsv`
- `selected_resolution_evidence_raw.tsv`
- `selected_resolution_scores_raw.tsv`
- `selected_resolution_cluster_membership_digest.tsv`
- `selected_resolution_state.h5ad`
- `_READY`

其中 `selected_resolution_cluster_membership_digest.tsv` 至少记录：

- `cluster_id`
- `n_cells`
- `ordered_cell_id_sha256`
- `unordered_cell_id_sha256`

### Resume from Step3 的唯一合法路径

- 恢复 Step 3.5、Step 4、Step 5、Step 6 时，只允许加载 `selected_resolution_state.h5ad` 与其配套 `selected_resolution_cell_cluster.tsv`
- 禁止“重新运行 Leiden 近似重建 cluster，再把旧 mapping/marker/bridge 输出拼回去”
- 若 `selected_resolution_state.h5ad` 或 `selected_resolution_cell_cluster.tsv` 缺失、损坏、或 digest 不一致，必须重跑完整 `Step 3 major search`
- 禁止以不同 Leiden backend、不同线程配置、不同随机状态重建 cluster 后继续使用旧 `cluster_id`

### Resume integrity checks

恢复 Step3 之后，必须同时通过以下一致性校验：

- `selected_resolution_cluster_meta.n_cells == grouped(selected_resolution_cell_cluster).n_cells`
- `selected_resolution_cluster_meta.cluster_id` 与 `selected_resolution_cell_cluster.cluster_id` 完全一致
- `selected_resolution_cluster_meta.cluster_id` 与 `distinct(selected_resolution_evidence_raw.cluster_id)` 完全一致
- `selected_resolution_cluster_meta.cluster_id` 与 `distinct(selected_resolution_scores_raw.cluster_id)` 完全一致
- `selected_resolution_cluster_meta.cluster_id` 与 `distinct(selected_resolution_projection_raw.cluster_id)` 完全一致
- `selected_resolution_state.h5ad.obs_names` 与 `selected_resolution_cell_order.tsv` 完全一致

任一失败必须报错：

- `ERROR:resume_cluster_identity_mismatch`
- `ERROR:resume_cluster_count_mismatch`
- `ERROR:resume_cell_order_mismatch`

## Step 0：资产验证与字典 lint

执行前必须检查：

- 所有 `assets/dictionary/03d_*` 文件存在且可读
- `03d_manual_review_contested_items_manual_checked.csv` 可按 `utf-8` 正常读取
- top/major/subtype contract、stage-aware dictionary、review queue 的列名完整
- `03d_projection_review_queue.tsv` 的 `stage_03c` 必须严格属于 closed stage set：`step3_major` 或 `step4_{major}`
- `step4_{major}` 字典必须通过 cross-lineage lint
- `step3_major` 正式 dictionary 必须通过 manual-review-precedence lint 与 stromal-lineage lint

Step4 字典 lint 规则：

- `stage_03c == step4_{major}` 的行必须满足 parent major 与该 stage 一致
- `standard_label` 必须属于该 parent major 的 subtype namespace
- 明显跨谱系 raw label 必须移出 Step4 字典，送入 review queue 或人工字典整理，不得参与 gene-set 建立
- `source_stage` 若为旧 `step4_immune` 残留，只允许作为归档前 provenance 存在；正式可执行 dictionary 中必须被规范化或单独写入审计文件
- `source_canonical_label` 即使与 `standard_label` 不一致，也只能作为 provenance；不得因为它“看起来更像另一个 subtype”就覆盖 `standard_subtype_candidate`

Step3_major 字典 lint 规则：

- 若 `manual_review` 明确要求“保留原值/待人工审定/留在 review queue”，则该行不得被 formalize 为 `Cancer_cell` 或任何成熟 major
- `03d_manual:cancer_cell` 之类的手工 merge 结果，只有在人工结论本身已经给出稳定 top/major 时才允许进入正式 dictionary
- 显式 `endothelial/endothelium`、`pericyte`、`smooth muscle` 词必须优先于 `default_to_fibroblast`
- 同时含有 `fibroblast + smooth muscle/myofibroblast` 或 `endothelial + stromal` 的 mixed stromal label，不得终结为单一成熟 stromal major；必须进入 `Stroma_transition` 或 review queue
- `auto_immune_upgrade / auto_stroma_upgrade` 若仅由 lexical collision 触发，且 raw label 命中 `club cell / goblet / glial / neuron / epithelial / urothelial` 等负词典，只允许保留在 review queue，不得进入 formal dictionary

最低输出：

- `work/annotation/section3_asset_manifest.tsv`
- `work/annotation/03d_projection_contract_files_used.tsv`
- `work/annotation/03d_stage4_dictionary_lint.tsv`
- `work/annotation/03d_stage4_dictionary_cross_lineage_rows.tsv`
- `work/annotation/03d_step3_major_dictionary_lint.tsv`
- `work/annotation/03d_step3_major_pathology_quarantine.tsv`
- `work/annotation/03d_step3_major_review_queue_noise_candidates.tsv`
- `work/annotation/03d_projection_review_queue_closed_stage_audit.tsv`
- `work/annotation/checkpoints/step0_validate_assets/_READY`

## Step 1：全局 top-level 粗分

必须在全局 atlas 上执行 coarse clustering 与 marker 检查，得到 `provisional_top_level`。

允许的 provisional top：

- `Immune`
- `Stroma`
- `Epithelial_or_cancer_cell`
- `Non_cellular_candidate`

最低输出：

- `work/annotation/top_level_compartment_method.tsv`
- `work/annotation/top_level_cluster_mapping.tsv`
- `work/annotation/top_level_cluster_markers.tsv`
- `work/annotation/top_level_provisional_assignment.tsv`

## Step 2：CNV 鉴瘤

必须只在 `provisional_top_level == Epithelial_or_cancer_cell` 的细胞上执行：

- `infercnvpy`
- `CNV_Score`
- `GMM` 优先阈值
- 临时写回 `Tumor_cells_candidate / Normal_Epithelial_candidate`
- 连续 `CNV_Score` 密度曲线 QC 图

硬约束：

- `CNV` 是 `Cancer_cell` 的唯一正式入口
- `scType` 在后续 major 阶段提出 `Cancer_cell` 时，只能触发复核，不能直接正式化
- Step 3.5 不负责把未被 Step 2 锁定为 `Tumor_cells_candidate` 的类群升格为 `Cancer_cell`
- 禁止使用 median proxy 或 existing-label proxy 把 unresolved CNV 变成 normal；只有显式 `Tumor_cells_candidate / Normal_Epithelial_candidate` 可进入 epithelial lock
- 若输入 atlas 仅有 `cnv_blocked / cnv_not_run / CNV_unresolved / 空值`，strict runner 必须重新执行真实 inferCNV；只有当真实 inferCNV 失败时，才写出 `epithelial_cnv_method.tsv` blocked 审计并终止，不能继续 Step 3
- 连续密度图只能消费 Step 2 已产生的 `CNV_Score` 与 `epithelial_cnv_threshold.tsv`；不得为了画图重新估计或覆盖正式 cutoff
- 连续密度图必须显示全体 epithelial/cancer candidate 的 `CNV_Score` KDE/连续密度，按 `Epithelial_CNV_Label` 着色，并用垂直线标出正式 cutoff；可选按 `dataset_id` 分面或附加透明曲线用于检查批次偏移
- 连续密度图不得使用 `Major_CellType / Cell_Subtype / raw_label / TopLevel_Compartment` 参与分组或 cutoff 判定；这些字段最多只可进入 caption 的审计说明

最低输出：

- `work/annotation/epithelial_cnv_scores.tsv`
- `work/annotation/epithelial_cnv_threshold.tsv`
- `work/annotation/epithelial_cnv_method.tsv`
- `work/annotation/epithelial_cnv_source_data.tsv`
- `work/annotation/epithelial_cnv_density_source_data.tsv`
- `work/figures/section3/CNV_Score_Continuous_Density.pdf`
- `work/figures/section3/CNV_Score_Continuous_Density.png`
- `work/figures/section3/CNV_Score_Continuous_Density_source_data.tsv`
- `work/figures/section3/CNV_Score_Continuous_Density_caption.md`

## Step 3：major 多分辨率搜索与权威 selected-resolution 状态

### 搜索范围

对所有未被 Step 2 锁定为 completed epithelial/cancer 的细胞执行 major 搜索。

默认至少测试：

- `0.2`
- `0.4`
- `0.6`
- `0.8`
- `1.0`
- `1.2`

### 每个 resolution 的必做流程

- `HVG -> PCA -> neighbors -> UMAP -> Leiden`
- `rank_genes_groups`
- `cluster_means`
- R bridge
- `sctype_rawoutput_top1 / sctype_rawoutput_top2 / sctype_rawoutput_top3 / sctype_rawoutput_score_top1 / delta`
- 只允许以 `sctype_rawoutput_*` 作为 raw output 输入，用 `03d_stage_aware_raw_to_standard_projection_dictionary.tsv` 与 `scmarkeragent_label_projection.tsv` 做 stage-aware 投射
- 如保留 legacy `top1_raw_label / top2_raw_label`，必须逐行等于对应 `sctype_rawoutput_*`，且不得反向驱动投射

### resolution ranking objective

最佳 resolution 必须由结构性 ranking list 决定，不能只由已有标签一致性决定。

主 ranking score 必须只使用以下来源：

- PCA / Harmony / neighbor graph embedding
- Leiden cluster membership
- cluster-level marker separation from `rank_genes_groups`
- fixed marker program recovery from allowed marker QC assets; never from in-script marker sets as raw output
- cluster size balance / tiny-cluster penalty

主 ranking score 必须至少包含：

- `separation_score`
  群间分离度，建议由 silhouette、Davies-Bouldin 归一化分数、nearest-centroid margin 共同组成。
- `homogeneity_score`
  群内均一性，建议由 cluster 内到 centroid 的平均距离反向归一化得到。
- `marker_separation_score`
  每个 cluster 的 top marker effect-size / logFC 分离度。该项必须避免 broad-lineage marker 独占优势：不得只用全体 top5 logFC 的简单均值；必须同时记录 marker redundancy、cluster-specific marker 数量、以及 child-specific marker gain。
- `cluster_size_balance_score`
  对过小 cluster、过度碎片化进行惩罚。
- `lineage_recovery_score`
  使用固定 marker program 与 `rank_genes_groups` / cluster means 判断正式 major lineage 是否被当前 resolution 恢复。该项只能使用 marker program，不得使用旧 `Major_CellType`、`Cell_Subtype`、raw label、CNV label 或人工旧注释。
- `underclustering_penalty`
  与更高 resolution 的嵌套 child cluster 比较；若某候选 resolution 的一个大 cluster 可被稳定拆成多个非 tiny、marker 清晰、谱系不同或 child-specific marker gain 明显的子 cluster，则该候选必须扣分。
- `split_gain_score`
  对更高 resolution 中稳定、非碎片化、可解释的 child cluster 给正向分数，用于抵消过粗 broad-lineage marker 的虚高。
- `rare_lineage_recall_score`
  专门检查 `NK_cell`、`Pericyte`、`Smooth_muscle`、`Endothelial`、`B_cell/Plasma_B`、`Mast/DC` 等容易被大类吞并的正式 marker program 是否至少以独立 cluster、transition cluster 或 review queue 形式被保留。
- `specific_label_recovery_score`
  衡量当前 resolution 是否优先恢复非 transition 的具体 major。具体 mature major 计正分；被合理拆分后保留的少量 transition 计低分；把稳定 mature child cluster 合并为 transition、parent broad label 或 review fallback 计负分。
- `transition_fallback_penalty`
  若当前 resolution 产生的 `Immune_transition / Stroma_transition` 可在更高 resolution 下稳定拆成具体 mature lineage，必须计入惩罚；惩罚不能被 broad-lineage marker 分数完全抵消。
- `composite_resolution_score`
  默认组合必须从旧公式升级为包含 under-clustering 约束的结构性目标，例如：
  `0.25 * separation_score + 0.15 * homogeneity_score + 0.15 * marker_separation_score + 0.10 * cluster_size_balance_score + 0.15 * lineage_recovery_score + 0.10 * split_gain_score + 0.10 * specific_label_recovery_score - 0.20 * underclustering_penalty - 0.10 * transition_fallback_penalty`。

`lineage_recovery_score` 与 `rare_lineage_recall_score` 必须区分两种语义：

- `marker_program_detected`：marker program 在某 resolution 下有信号，仅说明值得审计
- `lineage_recovered`：该 lineage 已形成 accepted cluster-level final major，或在 Step 3.5 中被明确 rescue 到该正式 major
- 若 `n_clusters=0` 且没有 `rescue_decision=rescue_to_major`，不得把该 lineage 写成 `lineage_recovered=True`
- transition/review 只能计入 `rare_lineage_preserved_or_reviewed`，不能冒充 exact `lineage_recovered`
- ranking 与汇报不得使用 “marker score 达标但 `n_clusters=0`” 来宣称 `Pericyte / Smooth_muscle / NK_cell` 已恢复

必须额外执行 under-clustering hard gate：

- 如果低 resolution 的 cluster 在更高 resolution 下产生 `>= 1` 个稳定 child cluster，且该 child cluster 同时满足 `n_cells >= max(100, 0.002 * parent_cells)`、top marker program 清晰、非 technical/debris、非 tiny-fragmentation，则低 resolution 不能仅凭更高 broad-marker logFC 取胜。
- 如果高 resolution 稳定恢复 `NK_cell`、`Pericyte`、`Smooth_muscle`，而低 resolution 把它们并入 `T_cell` 或 `Fibroblast`，低 resolution 必须 hard reject，除非所有 child cluster 均未通过 marker/size/fragmentation QC。
- 如果高 resolution 稳定恢复任一具体 mature major，而低 resolution 把它写成 `Immune_transition / Stroma_transition`，低 resolution 必须 hard reject 或记录 `transition_fallback_penalty > 0` 且不得成为 selected resolution，除非具体 child cluster 全部未通过 acceptance gate。
- 如果 `marker_separation_score` 与 `homogeneity_score` 方向冲突，且差异主要来自 broad-lineage marker，必须优先检查 `underclustering_penalty`，不得直接选择更粗 resolution。
- 若两个候选的最终 `composite_resolution_score` 差值 `< 0.01`，优先选择 `underclustering_penalty` 更低、`rare_lineage_recall_score` 更高的 resolution；只有在这些指标相同或更高 resolution 明显碎片化时，才允许低 resolution tie-break。

排序规则：

- 第一优先级：`composite_resolution_score` 降序
- 第二优先级：`underclustering_penalty` 升序
- 第三优先级：`rare_lineage_recall_score` 降序
- 第四优先级：`specific_label_recovery_score` 降序
- 第五优先级：`transition_fallback_penalty` 升序
- 第六优先级：`lineage_recovery_score` 降序
- 第七优先级：`separation_score` 降序
- 第八优先级：`homogeneity_score` 降序
- 第九优先级：`marker_separation_score` 降序
- 最终 tie-break：若仍完全相同，选择不产生 tiny-cluster warning 的较高 resolution；不得再默认较低 resolution 优先

`align_fraction`、`mean_top1_score`、`sctype_rawoutput_top1`、legacy `top1_raw_label`、`Major_CellType`、`Cell_Subtype`、`TopLevel_Compartment`、`Epithelial_CNV_Label` 只能作为 QC/解释字段，禁止进入主 ranking score 或 tie-break。

ranking list 必须新增并填充以下列：

- `lineage_recovery_score`
- `rare_lineage_recall_score`
- `underclustering_penalty`
- `split_gain_score`
- `specific_label_recovery_score`
- `transition_fallback_penalty`
- `coarse_resolution_flag`
- `rescued_lineage_candidates`
- `tiny_fragmentation_penalty`
- `selected_reason`

### 正式 major 搜索输出

必须输出：

- `work/annotation/03d_top_major_projection_relation.tsv`
- `work/annotation/03d_top_major_projection_audit.tsv`
- `work/annotation/03d_top_major_projection_conflicts.tsv`
- `work/annotation/03d_major_resolution_search.tsv`
- `work/annotation/03d_major_resolution_ranking.tsv`
- `work/annotation/03d_resolution_ranking_leakage_audit.tsv`
- `work/annotation/03d_major_resolution_underclustering_audit.tsv`
- `work/annotation/03d_major_resolution_lineage_recovery_audit.tsv`
- `work/annotation/03d_major_cluster_mapping.tsv`

### selected-resolution 选择后立即冻结

一旦选定最佳 resolution，必须立刻冻结：

- exact `cell_id -> cluster_id`
- exact cell order
- exact cluster-level marker/means/bridge outputs
- exact selected-resolution state h5ad

Step 3 的正式 cluster 语义只认这套冻结资产。后续任何步骤都不得重新计算 Step 3 的 `cell_cluster` 来“近似恢复”。

## Step 3.5：稳健 rearrangement、review、cautious discard

本步必须直接消费 `03d_major_cluster_mapping.tsv`，一次性产出权威的 cluster-level `final_top / final_major / final_decision_mode`。

若 Step 3 selected resolution 被 under-clustering audit 标记为 `coarse_resolution_flag=True`，Step 3.5 必须先执行 lineage rescue：

- 读取 `03d_major_resolution_underclustering_audit.tsv` 与 `03d_major_resolution_lineage_recovery_audit.tsv`
- 对被粗分辨率吞并的 child cluster，优先使用更高 resolution 中已冻结的 child cluster marker/means 证据，而不是重新计算
- 若 child cluster 满足 marker program、size、fragmentation QC，必须拆出正式 major 或 transition major；不得把其留在粗 parent major 中继续进入 subtype
- `NK_cell` 被并入 `T_cell`、`Pericyte/Smooth_muscle` 被并入 `Fibroblast` 时，必须产生 `lineage_rescue` 决策或 hard review queue；禁止静默接受粗 parent
- 如果 rescue 会改变 selected-resolution cluster 资产，必须重新冻结 rescue 后的权威 `cell_id -> final_major` 映射，并在 process index 中记录 `step3_5_lineage_rescue`

无论 selected resolution 是否被标记为 coarse，Step 3.5 都必须额外执行 protected-lineage cluster rescue audit，防止高分辨率下仍因 top1 轻微优势吞并少数成熟 lineage：

- protected lineages 至少包括 `NK_cell / Pericyte / Smooth_muscle / Endothelial / Plasma_B / Mast_cell / Dendritic_cell`
- 必须输出 `work/annotation/03d_protected_lineage_rescue_audit.tsv`
- audit 必须以 selected-resolution cluster 为单位，而不是以 parent-major 全体细胞比例为单位
- 必须记录 `cluster_id, initial_major, protected_candidate, n_cells, parent_score, protected_score, score_delta, parent_core_marker_score, protected_marker_score, tcr_cd3_core_score, rescue_decision, final_major, review_reason`
- 若 `protected_candidate` 是 top2 或 marker program top1，且 `score_delta <= 0.15` 或 `protected_marker_score > parent_core_marker_score + 0.10`，不得直接接受粗 parent；必须拆为 protected major、`*_transition`，或进入 hard review queue
- `Pericyte/Smooth_muscle` 候选若伴随强 perivascular/contractile core marker，不得因 Fibroblast ECM marker 共表达而直接归为 terminal `Fibroblast` 或 `myoCAF`
- 对 `Fibroblast` parent 中的 `Pericyte/Smooth_muscle` protected candidate，若 `protected_marker_score >= parent_core_marker_score` 且 `n_cells >= min_cells`，必须 `rescue_decision=rescue_to_major` 并写回对应 protected major；不得要求额外 `+0.10` margin
- 对 `Fibroblast` parent 中的 `Pericyte/Smooth_muscle` protected candidate，若 `0 < parent_core_marker_score - protected_marker_score <= 0.15` 且 marker 数据可用，必须 `rescue_decision=transition_major`、`final_major=Stroma_transition` 或等价 transition namespace，并设置 `lineage_rescue_applied=True`
- `hard_review_queue` 只用于 marker 数据缺失、跨 top-level 强冲突、疑似 doublet/non-cellular、或没有合法 transition namespace 的 unresolved case；不得用于同一 Stroma top-level 内 Fibroblast-vs-Pericyte/Smooth close-score 候选来替代 `rescue_to_major/transition_major`
- `NK_cell` 候选必须区分真实 NK 与 cytotoxic/NKT-like T：若 `NKG7/GNLY/KLRD1/PRF1/FGFBP2/FCGR3A` 高且 `CD3D/CD3E/TRAC` 弱，必须从 `T_cell` rescue 到 `NK_cell` 或 review；若 TCR/CD3 core 同时强，则不得作为 `NK_like_in_T_parent` 硬阻断整个 T parent，必须留在 T subtype/search review 中并标记为 cytotoxic/NKT-like evidence
- `03d_major_resolution_lineage_recovery_audit.tsv` 中的 `lineage_recovered` 只能表示该 lineage 已形成正式 accepted/reviewed cluster-level final major；单纯 marker program 分数达标但 `n_clusters=0` 时必须写 `lineage_recovered=False`，并另以 `marker_program_detected=True` 表示 marker 信号存在

禁止事项：

- 禁止先产出 legacy `final_major`，再用 patch 覆盖
- 禁止在 `runtime_query_failed` 后退化为硬编码 marker-major 推断
- 禁止把 `runtime_query_failed` 写成伪完成的 `agent-mediated arbitration`

### 争议类群触发条件

- `top1_major_candidate` 为 `EVs_or_microparticles / Artifact / Organelle`
- `top1_major_candidate` 为 `Cancer_cell`
- `top1_major_candidate` 为 `Immune_transition / Stroma_transition`
- `provisional_top_from_step1` 与 `top_projected_from_major_contract` 明显冲突
- `CNV` 与 `Cancer_cell` 候选冲突
- `top1 / top2` 分差接近且 marker 指向不同成熟 lineage
- parent lineage marker 与 raw label / top1 candidate 强冲突

### 3.5A：non-cellular gate

所有 `EVs_or_microparticles / Artifact / Organelle` top1 案例都必须先经过本门禁。

规则：

- `Artifact / Organelle` 只有在至少两类正交证据同时支持 non-cellular 时才允许 `discard_flag=True`
- `EVs_or_microparticles` 默认进入 `noncellular_review_queue`
- 若 lineage evidence 不弱于 non-cellular evidence，则 `discard_flag=False`，保留冲突留痕后进入后续 review/arbitration

### 3.5B：risk-label preservation

- raw label 含 `progenitor / precursor / transition / hybrid` 时，默认保留该风险语义
- 若合同投射已稳定落在 `Immune_transition / Stroma_transition`，可直接保留并退出本步
- 不得因为想找到成熟 major 而主动 stripping 这类风险标签
- 若人工复核结论为“保留原值/待人工审定/留在 review queue”，则不得再把该条目正规化为 `Cancer_cell` 或其他成熟 major

### 3.5C：谨慎候选接受

允许以下保守路径：

- `accepted_top1_projection`
- `accepted_runner_up_projection`
- `accepted_contract_stripping`
- `kept_transition_risk_label`

接受条件必须同时满足：

- score 或 delta 达到配置阈值
- marker 与候选 major 一致
- 与 Step 1 provisional top 不发生强冲突
- 不违反 Step 2 CNV 闭包
- 显式 `endothelial/endothelium`、`pericyte`、`smooth muscle` 词已先通过显式 stromal lineage override，而不是被 `default_to_fibroblast` 先吞掉
- `fibroblast + smooth muscle/myofibroblast`、`endothelial + stromal` 这类 mixed stromal label 未被强行终结到单一成熟 stromal major

### 3.5D：external arbitration

若仍无法稳定定类，必须进入 runtime external arbitration。

agent 必须至少读取：

- `top10_hvg`
- cluster markers
- `top1 / top2 / top3` raw label 与 score
- Step 1 provisional top
- Step 2 CNV 摘要
- QC 摘要
- discard/review 摘要

外部证据要求：

- 至少命中 1 条非本地 external source
- 至少覆盖 2 类来源中的 2 类：
  - 已接入知识库
  - 权威数据库
  - 一级文献或高质量综述
  - 非 `scType top1` 的正交 marker/program 证据

每次查询都必须记录：

- `query_string`
- `source_name`
- `retrieval_time`
- `kb_id / PMID / DOI / URL`
- `support_or_refute`
- `evidence_comment`

若 external query 失败或只有本地文件证据，只允许以下结局：

- `review_queue_due_to_runtime_query_failure`
- `review_queue_due_to_insufficient_external_evidence`

### 3.5E：多次失败后的谨慎 soft discard

允许 `cautious_soft_discard_after_repeated_failures`，但必须同时满足：

- 至少完成多轮失败记录，推荐 `>= 3` 次独立失败尝试
- 无法得到稳定的 mature lineage 或 transition 结论
- 同时存在强 technical / debris / organelle / ambient / EV 证据
- 至少两类正交 non-cellular 证据支持 discard

以下情况不得因“失败太多”直接 discard：

- 只是 mature lineage 之间分不清
- 只是 external query 网络失败
- 只是字典未覆盖，但 marker 仍然像真实细胞

在这些场景下必须进入：

- `review_queue_due_to_unresolved_identity`

### Step 3.5 必须输出

- `work/annotation/03d_noncellular_discard_review.tsv`
- `work/annotation/03d_rearrangement_cases.tsv`
- `work/annotation/03d_rearrangement_marker_top10.tsv`
- `work/annotation/03d_rearrangement_attempts.tsv`
- `work/annotation/03d_rearrangement_agent_queries.tsv`
- `work/annotation/03d_rearrangement_evidence.tsv`
- `work/annotation/03d_rearrangement_final_decisions.tsv`
- `work/annotation/03d_major_cluster_mapping_after_rearrangement.tsv`
- `work/annotation/03d_lineage_rescue_decisions.tsv`

每个有争议类群至少记录：

- `cluster_id`
- `resolution`
- `cell_count`
- `top10_hvg`
- `initial_top`
- `initial_major`
- `initial_sctype_rawoutput_top1`
- `runner_up_sctype_rawoutput`
- `discard_gate_status`
- `discard_flag`
- `discard_reason`
- `risk_label_preserved`
- `runtime_query_status`
- `failed_attempt_count`
- `final_top`
- `final_major`
- `final_decision_mode`
- `final_evidence_source`
- `final_evidence_links_or_kb_ids`
- `decision_comment`

`03d_rearrangement_marker_top10.tsv` 和 `03d_rearrangement_cases.tsv.top10_hvg` 不得只含表头或空值。若某 cluster marker 不可用，必须写明 `marker_unavailable_reason` 并将该 cluster 标为 hard fail/review queue，禁止在缺少 marker 证据时接受 mature major。

## Step 4：可信 subtype 搜索

只有同时满足以下条件的 parent major，才允许进入真实 subtype 搜索：

- `discard_flag=False`
- `final_major` 属于可细分 mature major
- 该 major pool 通过 purity gate

允许真实 subtype 搜索的 major：

- `B_cell`
- `T_cell`
- `NK_cell`
- `Myeloid`
- `Fibroblast`

默认直接使用 contract 定义的 fallback subtype、而不做真实 subtype 搜索的 major：

- `Immune_transition`
- `Endothelial`
- `Pericyte`
- `Smooth_muscle`
- `Stroma_transition`
- `EVs_or_microparticles`
- `Artifact`
- `Organelle`
- `Cancer_cell`
- `Epithelial`

### 4A：subtype input purity gate

进入 subtype 搜索前，必须对每个 parent major 输出：

- `work/annotation/subgroups/<major>/<major>_subtype_input_purity_audit.tsv`

至少检查：

- Step 3 final major 来源 cluster 是否自洽
- parent-major marker program 是否占优
- 是否存在明显跨谱系 marker 主导
- 是否存在 resume integrity failure
- 是否存在大量 `review_queue` 或 `discard` 类群混入

若 purity gate 失败：

- 禁止继续做 subtype resolution search
- 必须回到 Step 3.5 review queue，或直接回落到该 `parent_major` 在 contract 中定义的默认 fallback subtype

### 4A.5：parent-major repair gate

即使 purity gate 通过，也必须在 subtype 搜索前执行 parent-major repair gate。该 gate 的目标是防止 major 层过粗后，被 subtype 层继续吞并。

必须检查：

- `T_cell` parent 中是否存在强 `NK_cell` marker program：`NKG7/GNLY/KLRD1/PRF1/FGFBP2/FCGR3A` 高，而 `CD3D/CD3E/TRAC` 不占优
- `Fibroblast` parent 中是否存在强 `Pericyte` marker program：`RGS5/PDGFRB/CSPG4/MCAM/NOTCH3/ABCC9/KCNJ8/NDUFA4L2/COX4I2/HIGD1B`
- `Fibroblast` parent 中是否存在强 `Smooth_muscle` marker program：`ACTA2/TAGLN/MYH11/CNN1/MYLK/DES/LMOD1/MYOCD`
- `myoCAF` 与 `Smooth_muscle/Pericyte` 的冲突：若 contractile markers 伴随 perivascular markers 或 smooth muscle core markers，而缺少 CAF ECM/inflammatory context，不得直接标为 `myoCAF`

若发现上述 repair candidate：

- 必须输出 `work/annotation/subgroups/<major>/<major>_parent_major_repair_audit.tsv`
- 必须同时记录 candidate 所属 selected-resolution cluster；禁止只按 parent-major 全体细胞比例判定
- 必须回到 Step 3.5 执行 cluster-level major rescue，或将具体 candidate cluster 写入 hard review queue
- 禁止继续把 candidate cluster 作为该 parent 的合法 subtype 接受
- 禁止把该 parent 的所有细胞直接回落为 `<parent>_unspecified` 后继续 Step 5；若 clean clusters 仍可 subtype，必须只阻断 candidate cluster 并允许 clean parent subset 继续 subtype search
- `parent_major_repair_gate_fail` 只应在存在未被 Step 3.5 rescue/review 的 candidate cluster 时作为 hard fail 进入 `section3_issue_list.tsv`；不得因已解释、已隔离或已进入 review 的少量 candidate 阻断整个 parent major
- 若 `NK_cell` parent 为 `no_cells`，但 `T_cell_parent_major_repair_audit.tsv` 中存在 `NK_like_in_T_parent` 且 `repair_gate_pass=False`，则 `NK_cell no_cells` 不是可接受完成状态，必须触发 Step 3.5 lineage rescue 或阻断
- 若 `NK_cell` parent 已存在 accepted final major，`T_cell` parent 中残余 NK/cytotoxic marker signal 不能单独使整个 T parent hard fail；必须用 `CD3D/CD3E/TRAC` 判定真实 NK contamination 与 cytotoxic/NKT-like T，并仅对真实 NK candidate cluster 做 rescue/review
- 若 `Pericyte/Smooth_muscle` parent 为 non-searchable 或 no final major，但 `Fibroblast_parent_major_repair_audit.tsv` 中存在 perivascular/contractile repair candidate，必须触发 Step 3.5 lineage rescue 或阻断
- 若 `Pericyte/Smooth_muscle` parent 已存在 accepted final major，`Fibroblast` parent 中残余 perivascular/contractile marker signal 也必须做 cluster-level audit；只有未被解释的 candidate cluster 才能触发 hard fail，不能按 parent-level 全局比例阻断所有 Fibroblast subtype
- 禁止在 Step 4 直接改写 `Major_CellType`；所有 major 改写必须在 Step 3.5 lineage rescue 中完成并重新生成权威 mapping

### 4B：subtype 搜索流程

对通过 purity gate 的 parent major，执行：

- parent major 子集上的 `HVG -> PCA -> neighbors -> UMAP -> Leiden`
- 多 resolution subtype search
- 使用与 Step 3 相同的结构性 `composite_resolution_score` 输出 subtype resolution ranking，并同样包含 `underclustering_penalty`、`split_gain_score`、`rare_lineage_recall_score`
- R/scType/scMarkerAgent bridge with parent-specific stage，例如 `stage_03c = step4_{major}`；必须真实执行并保存 bridge runtime log、输入 cluster means/markers hash、backend source、以及 raw output audit
- 输出 `sctype_rawoutput_top1 / sctype_rawoutput_top2 / sctype_rawoutput_top3` 与 `standard_subtype_candidate`；禁止输出 marker top1 作为 raw output
- contract 只用于合法性检查和失败后的默认回落，不用于在多个具体 subtype 之间重新排序
- 在 Step 4 subtype 投射时，必须先应用 `03d_subtype_raw_label_projection_overrides.tsv`，再回落到 `03d_stage_aware_raw_to_standard_projection_dictionary.tsv`
- override 表只允许在当前 `parent_major` namespace 内把 raw label 投射到合法 subtype；若 `standard_label` 不存在于 `03d_fixed_projection_contract_subtype.tsv` 对应 parent，必须 hard fail
- override 命中必须写入 `projection_rule`，并在 cluster 输出中保留原始 `sctype_rawoutput_top1`；禁止用 override 后的标准标签覆盖 scType/scMarkerAgent 原始输出 provenance
- 对 `Eosinophil / Basophil / Th1 / Th2 / Th17 / Tfh / CD4_Naive / CD4_Memory / CD4_Activated` 等细粒度 subtype，raw label 命中只能作为 candidate；正式 `Cell_Subtype` 仍必须通过 marker/acceptance gate

### 4B.5：subtype resolution ranking objective

Step 4 的 resolution ranking 不得复用 Step 3 的 broad-lineage 目标函数后把 subtype-level underclustering 指标留空或固定为 0。每个 searchable parent major 都必须独立计算 subtype-level specificity 指标，并把它们写入 `<major>_subtype_resolution_ranking.tsv`。

ranking score 必须至少包含：

- `subtype_recovery_score`
  使用 parent 内固定 subtype marker program 判断具体 subtype 是否被当前 resolution 恢复。仅 marker program 有信号但没有独立 cluster 时，不得计作 recovered。
- `nonfallback_subtype_fraction`
  当前 resolution 中通过 acceptance gate 的非 fallback、非 unspecified subtype 细胞比例。该项用于惩罚“搜索完成但大量细胞仍为 `<parent>_unspecified`”的 resolution。
- `specific_subtype_recovery_score`
  对更具体 subtype 的恢复给正分；parent broad label、`*_unspecified`、或仅代表 parent core marker 的粗标签不给正分。
- `subtype_underclustering_penalty`
  与更高 resolution 比较；若一个低 resolution subtype cluster 可被稳定拆成多个非 tiny、marker coherent、contract 合法的具体 subtype child cluster，则低 resolution 必须扣分。
- `subtype_split_gain_score`
  对更高 resolution 中稳定、可解释、非碎片化的具体 subtype child cluster 给正分。
- `unspecified_fallback_penalty`
  若某 resolution 因过粗导致稳定 child subtype 被回落到 `<parent>_unspecified`、parent broad label、或 generic fallback，必须计入惩罚。
- `broad_subtype_penalty`
  若某 broad subtype 吞并了已稳定恢复的更具体 subtype，例如 `CD4_helper` 吞并 `Treg / TCF7_CD8` 或 parent-like B/T/Myeloid label 吞并具体 child subtype，必须计入惩罚。

默认组合建议：

`0.20 * separation_score + 0.10 * homogeneity_score + 0.15 * marker_separation_score + 0.10 * cluster_size_balance_score + 0.15 * subtype_recovery_score + 0.10 * nonfallback_subtype_fraction + 0.10 * specific_subtype_recovery_score + 0.10 * subtype_split_gain_score - 0.20 * subtype_underclustering_penalty - 0.10 * unspecified_fallback_penalty - 0.10 * broad_subtype_penalty - 0.05 * tiny_fragmentation_penalty`

subtype resolution hard gate：

- 若更高 resolution 稳定恢复 `>= 1` 个具体 subtype child cluster，且该 child cluster 满足 `n_cells >= max(50, 0.001 * parent_cells)`、parent marker positive、subtype marker coherent、非 tiny-fragmentation，则低 resolution 不得仅凭 separation 或 size balance 取胜。
- 若 higher-resolution child cluster 的具体 subtype 通过 acceptance gate，selected resolution 不得把该 cluster 写成 `<parent>_unspecified`、parent broad label、或 unrelated broad subtype。
- 对 `T_cell` parent，必须显式审计 `Treg / TCF7_CD8 / Cytotoxic_CD8 / Exhausted_CD8 / GammaDelta_T / NKT_like / MAIT_like`。若这些 subtype 中任一在 higher resolution 形成稳定 child cluster 并通过 marker/acceptance gate，selected resolution 必须保留对应 subtype，或在 `<major>_subtype_rejected_candidates.tsv` 中给出 marker/size/fragmentation 失败原因。
- 对 `B_cell` parent，必须显式审计 `Memory_B / Activated_B / Plasma_B / Naive_B`，不得用 `B_cell_unspecified` 吞并稳定 child subtype。
- 对 `Myeloid` parent，必须显式审计 `Monocyte / Macrophage / cDC1 / cDC2 / mregDC`，不得用 broad Myeloid 或 Macrophage 吞并稳定 DC/monocyte child subtype。
- 对 `Fibroblast` parent，必须先通过 Step 4A.5 repair gate 排除 pericyte/smooth muscle contamination，再在 clean fibroblast subset 内优先恢复 `iCAF / myoCAF / apCAF` 等具体 subtype。

排序规则：

- 第一优先级：`composite_resolution_score` 降序
- 第二优先级：`subtype_underclustering_penalty` 升序
- 第三优先级：`nonfallback_subtype_fraction` 降序
- 第四优先级：`specific_subtype_recovery_score` 降序
- 第五优先级：`unspecified_fallback_penalty` 升序
- 第六优先级：`broad_subtype_penalty` 升序
- 第七优先级：`marker_separation_score` 降序
- 最终 tie-break：若仍完全相同，选择不产生 tiny-cluster warning 的较高 resolution；不得默认选择较低 resolution。

### 4C：subtype acceptance gate

`Cell_Subtype` 只能在以下条件全部满足时正式接受：

- `top1_score > 0`
- `top1-top2 delta` 达到配置阈值
- top markers 与 parent major 一致
- top markers 与所选 subtype 一致
- 不存在强 cross-lineage contradiction
- `standard_label` 在 subtype contract 的合法 namespace 内

若任一不满足：

- 不得强行接受更具体 subtype
- `Cell_Subtype` 必须回落为该 `parent_major` 在 contract 中定义的默认 fallback subtype
- 不得因为某个具体 subtype 在 contract 闭集内合法，就把失败候选改写成另一个更具体 subtype
- 保留 `sctype_rawoutput_top1`、`standard_subtype_candidate` 与失败原因；legacy `raw_subtype_label_top1` 只允许作为等值副本

### 4D：Step 4 明确禁止

- 禁止在 Step 4 改写 `Major_CellType`
- 禁止把非法 subtype 通过 parent-lock 悄悄改写成另一个更具体 subtype
- parent-lock 只能做“回落到 contract 默认 fallback subtype”，不能做“升级为看起来合法的 subtype”
- `03d_fixed_projection_contract_subtype.tsv` 是 fallback 刹车，不是具体 subtype 选择器

### Step 4 必须输出

- `work/annotation/subgroups/<major>/<major>_subtype_resolution_search.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_resolution_ranking.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_method.tsv`
- `work/annotation/subgroups/<major>/<major>_cluster_markers.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_cluster_mapping.tsv`
- `work/annotation/subgroups/<major>/<major>_sctype_rawoutput_audit.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_input_purity_audit.tsv`
- `work/annotation/subgroups/<major>/<major>_parent_major_repair_audit.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_acceptance_audit.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_rejected_candidates.tsv`

`<major>_subtype_resolution_ranking.tsv` 必须至少包含：

- `resolution`
- `n_clusters`
- `separation_score`
- `homogeneity_score`
- `marker_separation_score`
- `cluster_size_balance_score`
- `subtype_recovery_score`
- `nonfallback_subtype_fraction`
- `specific_subtype_recovery_score`
- `subtype_underclustering_penalty`
- `subtype_split_gain_score`
- `unspecified_fallback_penalty`
- `broad_subtype_penalty`
- `tiny_fragmentation_penalty`
- `composite_resolution_score`
- `selected`
- `selected_reason`

`<major>_subtype_rejected_candidates.tsv` 即使没有 rejected row，也必须写出表头；不得生成 0 字节或无 header 文件。至少包含：

- `parent_major`
- `resolution`
- `cluster_id`
- `rejected_candidate`
- `fallback_subtype`
- `reason`
- `marker_support`
- `size_support`
- `fragmentation_support`

`<major>_subtype_cluster_mapping.tsv` 必须至少包含：

- `parent_major`
- `cluster_id`
- `n_cells`
- `projection_try_subtype`
- `final_subtype`
- `sctype_rawoutput_top1`
- `sctype_rawoutput_top2`
- `sctype_rawoutput_top3`
- `sctype_rawoutput_consensus`
- `sctype_rawoutput_backend`
- `sctype_rawoutput_score_top1`
- `standard_subtype_candidate`
- `projection_rule`
- `top1_score`
- `top2_score`
- `delta`
- `acceptance_pass`
- `assignment_status`

注意：正式原始输出列名必须使用 `sctype_rawoutput` 命名空间。不得把 marker top1、projection_try、standard label 或 fallback label 写入 `sctype_rawoutput_*`。不得把用户常见拼写错误 `raw_lable` 写入文件 schema；如保留 legacy `raw_label`，caption 必须注明其只是 `sctype_rawoutput` 的兼容副本。

## Step 5：正式回写与 Section 4-ready h5ad 导出

必须统一回写以下 obs 列：

- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Raw_Label_Primary`
- `Primary_Cell_Annotation`
- `Primary_Cell_Annotation_Level`
- `sctype_rawoutput_top1`
- `sctype_rawoutput_top2`
- `sctype_rawoutput_top3`
- `sctype_rawoutput_consensus`
- `sctype_rawoutput_backend`
- `sctype_rawoutput_score_top1`
- `Subtype_Assignment_Score`
- `projection_rule`
- `standard_major_candidate`
- `standard_subtype_candidate`
- `major_assignment_score`
- `subtype_assignment_score`
- `major_assignment_status`
- `subtype_assignment_status`
- `annotation_confidence`
- `Annotation_Method`
- `Annotation_Method_Detail`
- `CNV_Score`
- `Epithelial_CNV_Label`
- `discard_flag`
- `discard_reason`
- `exclude_from_feature_engineering`
- `risk_label_preserved`
- `section3_selected_major_resolution`
- `section3_major_cluster_id`
- `section4_subtype_cluster_id`
- `section4_ready`

兼容性硬约束：

- `sctype_rawoutput_*` 是 Section 3 原始输出的权威列；`top1_raw_label / runner_up_raw_label / raw_subtype_label_*` 只允许作为 legacy alias，必须逐行等于相应 `sctype_rawoutput_*` 或 major-stage `sctype_rawoutput`，不得反向驱动 projection。
- `Raw_Label_Primary` 必须等于权威 `sctype_rawoutput_top1`；若该细胞为 CNV epithelial lock，可等于真实 CNV label，但必须在 `projection_rule=cnv_lock` 中说明。
- `Subtype_Assignment_Score` 必须来自 scType/scMarkerAgent raw output score 或明确的 acceptance score，不得来自 marker-top1 替代。
- `Primary_Cell_Annotation` 必须与 `Cell_Subtype` 完全一致。
- `Primary_Cell_Annotation_Level` 必须固定写为 `subtype`。
- `raw_major_label_top1 / raw_major_label_top2 / raw_subtype_label_top1 / top1_raw_label / runner_up_raw_label / standard_* / *_status / section4_ready` 若输出，只能作为兼容审计列或 handoff alias，且 raw-label alias 必须等于对应 `sctype_rawoutput_*`。
- `section3_major_cluster_id / section4_subtype_cluster_id` 只负责 cluster traceability，不得覆盖正式 cell-level 注释列
- `Epithelial_CNV_Label` 是正式 CNV 状态列，必须由 Step 2 最终 `Normal_Epithelial_candidate / Tumor_cells_candidate` 写回；若存在 `_step2` 临时列，Step 5 必须同步到正式列并删除或降级旧 stale 列，不得让正式列保留 `cnv_blocked / cnv_not_run`

必须新增正式方法/审计文档：

- `work/annotation/major_celltype_method.tsv`
- `work/annotation/major_celltype_method_merged.tsv`
- `work/annotation/top_level_compartment_method.tsv`
- `work/annotation/03d_raw_projection_hits.tsv`
- `work/annotation/03d_review_queue_hits.tsv`
- `work/annotation/03d_out_of_dictionary_sctype_rawoutput.tsv`
- `work/annotation/03d_epithelial_candidate_to_final_mapping.tsv`
- `work/annotation/03d_annotation_stack_schema.tsv`

### 正式 annotated h5ad

Section 3 必须交付：

- `work/annotation/merged.section3_annotated.h5ad`
- `work/annotation/per_dataset/<dataset>.section3_annotated.h5ad`

这两类 annotated h5ad 必须把以下四层注释同时放在 `.obs` 中：

- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Raw_Label_Primary`

并且必须把 `Cell_Subtype` 设为主注释层：

- `Primary_Cell_Annotation = Cell_Subtype`
- `Primary_Cell_Annotation_Level = subtype`
- 任何下游如果只消费单一注释列，默认只能读取 `Primary_Cell_Annotation`
- 图件默认分组、Section 4 默认 grouping key、以及对外展示默认 label，均以 `Cell_Subtype` 为主，`Major_CellType / TopLevel_Compartment / Raw_Label_Primary` 只作为补充解释层

### Section 4-ready h5ad 导出

除正式 annotation h5ad 外，还必须导出 Section 4 专用入口：

- `work/section4_input/merged.section3_for_section4.h5ad`
- `work/section4_input/per_dataset/<dataset>.section3_for_section4.h5ad`
- `work/section4_input/section4_h5ad_export_manifest.tsv`
- `work/section4_input/section4_obs_schema.tsv`
- `work/section4_input/section4_feature_eligibility.tsv`

导出要求：

- 不得删除被 soft discard 的细胞；只能靠 obs 标志控制后续排除
- 必须保留 Section 4 所需的 `source_sample_id / source_lesion_id / patient_id / dataset_id`
- 必须保留用于特征工程的表达矩阵与必要 layer
- `section4_feature_eligibility.tsv` 必须明确哪些细胞可参与特征提取

`section4_obs_schema.tsv` 至少记录：

- `column_name`
- `dtype`
- `required_for_section4`
- `allowed_missing_fraction`
- `semantic_definition`

`section4_feature_eligibility.tsv` 至少记录：

- `cell_id`
- `dataset_id`
- `source_sample_id`
- `patient_id`
- `Major_CellType`
- `Cell_Subtype`
- `discard_flag`
- `exclude_from_feature_engineering`
- `eligibility_status`
- `eligibility_reason`

## Step 6：图件、QC 与 Section 4 handoff 审计

### 图件

必须交付：

- `work/figures/section3/Global_Major_UMAP.pdf`
- `work/figures/section3/Global_Major_UMAP.png`
- `work/figures/section3/Global_Major_UMAP_source_data.tsv`
- `work/figures/section3/Global_Major_UMAP_caption.md`
- `work/figures/section3/CNV_Score_Continuous_Density.pdf`
- `work/figures/section3/CNV_Score_Continuous_Density.png`
- `work/figures/section3/CNV_Score_Continuous_Density_source_data.tsv`
- `work/figures/section3/CNV_Score_Continuous_Density_caption.md`

`CNV_Score_Continuous_Density` 必须是连续密度图，不得用离散柱状图替代；caption 必须写明 `CNV_Score` 来源、正式 cutoff、阈值方法、`Tumor_cells_candidate / Normal_Epithelial_candidate` 数量，以及是否存在 dataset-level density shift。

以及每个最终 major 的子图：

- `work/figures/section3/subgroups/<major>_Subtype_UMAP.pdf`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP.png`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_source_data.tsv`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_caption.md`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_projection_try.pdf`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_projection_try.png`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_projection_try_source_data.tsv`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_projection_try_caption.md`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_sctype_rawoutput.pdf`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_sctype_rawoutput.png`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_sctype_rawoutput_source_data.tsv`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_sctype_rawoutput_caption.md`

其中：

- legacy `<major>_Subtype_UMAP.*` 必须继续输出，作为正式 `Cell_Subtype` 图，保持下游兼容
- `projection_try` 图按 acceptance gate 之前的 `standard_subtype_candidate / projection_try_subtype` 着色，用于观察 raw label/marker 投射尝试
- `sctype_rawoutput` 图按 `sctype_rawoutput_top1` 或 cluster-level `sctype_rawoutput_consensus` 着色，用于审计 scType/scMarkerAgent 原始输出来源
- 三套图的 source data 都必须包含 `cell_id, UMAP1, UMAP2, Major_CellType, Cell_Subtype, projection_try_subtype, sctype_rawoutput_top1, sctype_rawoutput_consensus, sctype_rawoutput_backend, section4_subtype_cluster_id`；legacy `raw_subtype_label_*` 可额外保留但不得替代 `sctype_rawoutput_*`

### QC

必须输出：

- `work/qc/section3_engineering_qc.tsv`
- `work/qc/section3_scientific_qc.tsv`
- `work/qc/section3_process_integrity_qc.tsv`
- `work/qc/section3_section4_handoff_qc.tsv`
- `work/qc/section3_issue_list.tsv`
- `work/qc/section3_qc_report.md`

工程 QC 必须检查：

- 是否存在旧 `assets/03c_*` dictionary 路径
- 是否存在任何旧 run 目录中的脚本、annotation、checkpoint、cache、per_dataset、section4_input 或 h5ad 被作为运行时输入；若存在必须 fail
- 是否真实执行 scType/scMarkerAgent bridge，且 `sctype_rawoutput_*` required columns 非空、source_backend 合法、bridge runtime log 存在
- 是否存在并非空展示 `work/annotation/03d_sctype_rawoutput_audit.tsv`；若缺失、为空、未覆盖 candidate cluster、`kb_source` 不是 `scmarkeragent_db_human.RDS`，或最终汇报未展示前 20 行，必须 fail
- 是否存在 marker scoring 或 `projection_rule=marker_top1` 被写入 `sctype_rawoutput_*`、`Raw_Label_Primary` 或 Section4 handoff；若存在必须 fail
- Step3 selected-resolution resume 资产是否完整
- 是否出现 `resume_cluster_identity_mismatch`
- 是否存在 “旧 cluster mapping + 新 cell_cluster” 混合
- 是否存在 Step2 连续 CNV 密度图四件套：`CNV_Score_Continuous_Density.pdf/png/source_data.tsv/caption.md`
- `CNV_Score_Continuous_Density_source_data.tsv` 是否非空，且包含 `cnv_score_grid, density, Epithelial_CNV_Label, cutoff, threshold_method` 或等价字段
- 是否存在 Step 4 在 purity gate 失败后仍继续 subtype search
- 是否仍接受 `top1_score <= 0` 的 subtype
- 是否仍存在双轨最终列
- 是否每个 searchable parent major 均输出 `<major>_subtype_cluster_mapping.tsv`，且包含 `sctype_rawoutput_top1/sctype_rawoutput_top2/sctype_rawoutput_consensus/projection_try_subtype/final_subtype`
- 是否每个有细胞的 parent major 均输出正式 subtype 图、`projection_try` 图、`sctype_rawoutput` 图三套 figure/source/caption
- 是否存在 `03d_subtype_raw_label_projection_overrides.tsv` 并通过 schema lint；override 的 `standard_label` 必须属于对应 parent 的 subtype contract
- 是否存在 `03d_major_resolution_ranking.tsv` 且恰好一个 `selected=True`
- 是否存在 `03d_resolution_ranking_leakage_audit.tsv` 且所有 leakage check 均为 pass
- 是否存在 `03d_major_resolution_underclustering_audit.tsv` 与 `03d_major_resolution_lineage_recovery_audit.tsv`
- 是否存在 `03d_protected_lineage_rescue_audit.tsv`，且每个 protected-lineage candidate cluster 均有 `rescue_decision`
- `03d_major_resolution_lineage_recovery_audit.tsv` 中不得出现 `lineage_recovered=True` 但 `n_clusters=0` 且没有对应 `rescue_decision=rescue_to_major` 的行；这类行必须改写为 `marker_program_detected=True, lineage_recovered=False`
- `03d_protected_lineage_rescue_audit.tsv` 中，同一 Stroma top-level 内 `Fibroblast` vs `Pericyte/Smooth_muscle` close-score candidate 不得以 `hard_review_queue` 作为首选；必须先尝试 `rescue_to_major` 或 `transition_major`
- major ranking list 是否填充 `underclustering_penalty / split_gain_score / rare_lineage_recall_score / specific_label_recovery_score / transition_fallback_penalty / selected_reason`
- subtype ranking list 是否填充 `subtype_underclustering_penalty / subtype_split_gain_score / nonfallback_subtype_fraction / specific_subtype_recovery_score / unspecified_fallback_penalty / broad_subtype_penalty / selected_reason`，且这些列不得被固定为全 0 占位，除非对应 parent 没有细胞或所有 higher-resolution child cluster 都未通过 marker/size/fragmentation QC
- `03d_rearrangement_marker_top10.tsv` 是否非空，且 `03d_rearrangement_cases.tsv.top10_hvg` 是否非空或有明确 `marker_unavailable_reason`
- 所有 `*_subtype_rejected_candidates.tsv` 是否有表头；空结果必须是 header-only TSV，而不是 0 字节/无列文件
- 是否存在任一 `*_parent_major_repair_audit.tsv` 的 `repair_gate_pass=False`；若存在且没有对应 `03d_protected_lineage_rescue_audit.tsv.rescue_decision in {rescue_to_major, transition_major, hard_review_queue, explained_as_parent_subtype_signal}` 或 `03d_lineage_rescue_decisions.tsv.lineage_rescue_applied=True`，必须 hard fail
- `03d_step4_parent_major_status.tsv` 中不得出现 `fallback_due_to_parent_major_repair_gate_fail` 后仍进入 Step5 completed
- 进度/日志中不得把 `no_cells`、`fallback_due_to_parent_major_repair_gate_fail` 计为“已成功完成 subtype search”

科学 QC 必须检查：

- `top=Stroma` 下 `major=Stroma` 是否为 `0`
- `Cancer_cell` 是否都能追溯到 Step 2 `CNV`
- epithelial/cancer 细胞是否仍存在 `cnv_blocked / cnv_not_run / CNV_unresolved / 空 CNV label`
- 正式 `Epithelial_CNV_Label` 是否与 Step 2 最终 CNV label 一致，禁止只在 `_step2` 临时列中正确
- 连续 `CNV_Score` 密度图是否使用真实连续分数并展示正式 cutoff；若曲线明显单峰且 cutoff 无法分离，应在 `epithelial_cnv_method.tsv` 与 QC report 中标为低置信或 review，而不得强行解释为清晰双峰
- resolution ranking 是否由结构性分离度、群内均一性和 marker 分离度主导，而不是由既有 annotation label 主导
- 是否存在 selected-resolution 或 higher-resolution `NK_cell / Pericyte / Smooth_muscle` marker program 被 parent major 吞并却未触发 `underclustering_penalty`、`protected_lineage_rescue` 或 `lineage_rescue`
- 是否存在 higher-resolution 支持的具体 mature major 被最终写成 `Immune_transition / Stroma_transition`，却没有 `transition_fallback_penalty`、`lineage_rescue`、或明确 marker/fragmentation 失败原因
- 是否存在 `Pericyte/Smooth_muscle` marker program 被记录为 recovered 但最终 exact major 计数仍为 0；若存在，必须视为 recovery-audit 语义错误
- `Fibroblast` parent 内若出现 `RGS5/PDGFRB/CSPG4/MCAM/NOTCH3/NDUFA4L2/COX4I2/HIGD1B` 主导 cluster，是否被送回 major rescue，而不是被接受为 `iCAF/myoCAF`
- `T_cell` parent 内若出现 `NKG7/GNLY/KLRD1/PRF1/FGFBP2` 主导且 TCR/CD3 弱的 cluster，是否被送回 major rescue，而不是被接受为 T subtype
- `T_cell` parent 内若出现 NK/cytotoxic marker signal 但 TCR/CD3 同时强，是否被解释为 cytotoxic/NKT-like T subtype evidence 或 review，而不是阻断整个 T parent
- 若 `T_cell` 最终 `Cell_Subtype` 全部为 `T_cell_unspecified`，必须 hard fail，除非 subtype search 实际执行并提供 marker-based 证据证明所有 T-cell 子群不稳定
- 若 `T_cell` higher-resolution subtype search 中 `Treg / TCF7_CD8 / Cytotoxic_CD8 / Exhausted_CD8 / GammaDelta_T / NKT_like / MAIT_like` 形成稳定 accepted child cluster，但最终只剩 `CD4_helper / GammaDelta_T / T_cell_unspecified` 等粗标签，必须 hard fail 或重选 subtype resolution
- 若 final `NK_cell=0` 且 T/NK marker audit 发现 TCR/CD3 弱的真实 NK-like candidate，必须 hard fail
- 对每个 searchable parent major，若 `nonfallback_subtype_fraction` 很低或 `unspecified_fallback_penalty > 0`，必须在 QC report 中解释是 marker 不足、fragmentation、还是 parent purity 问题；不得只报告 Step4 completed
- `EVs_or_microparticles / Artifact / Organelle` 是否都经过 non-cellular gate
- `Artifact` cluster 是否含有强免疫/上皮/基质 lineage marker 且未触发 discard gate
- `runtime_query_failed` 是否被错误写成完成仲裁
- 所有 searchable major 的 subtype 是否通过 purity gate 与 acceptance gate
- 是否存在大规模跨谱系 subtype marker 冲突
- raw label 图中若某 raw label 被 projection_try 投到多个互斥 subtype，是否进入 `subtype_rejected_candidates` 或 review，而不是静默随机选择
- `Th1/Th2/Th17/Tfh/Eosinophil/Basophil` 等新增 subtype 若被正式采用，是否同时具备 raw label evidence 与 marker/acceptance gate evidence；raw label alone 不得越过 acceptance gate

Section 4 handoff QC 必须检查：

- `merged.section3_for_section4.h5ad` 与 `per_dataset/*.section3_for_section4.h5ad` 是否存在
- required obs 列是否齐全
- `exclude_from_feature_engineering` 是否与 discard/review 决策一致
- dataset/sample/patient 主键是否完整
- feature engineering 所需 layer 是否存在

## 明确禁止

- 使用旧 `assets/03c_*` dictionary 路径
- 从任何旧 run 目录读取脚本、结果、checkpoint、cache、per_dataset、annotated h5ad、section4_input 或 bridge cache 作为本轮运行输入
- 用 Python hard-coded marker scoring、marker top1/top2、contract fallback、dictionary canonical label 或 `projection_rule=marker_top1` 冒充 scType/scMarkerAgent `sctype_rawoutput`
- 输出或汇报拼写错误的 `sctype_rawlable` / `raw_lable` 作为正式 raw schema；正式 raw schema 只能是 `sctype_rawoutput_*`
- 重新运行 Leiden 后复用旧 Step3 cluster mapping
- 用 `scType` 的 `Cancer_cell` 直接替代 Step 2 `CNV`
- 把 `cnv_blocked / cnv_not_run / CNV_unresolved` 解释为 `Normal_Epithelial_candidate`
- 用 `Major_CellType / Cell_Subtype / raw_label / sctype_rawoutput / TopLevel_Compartment / CNV label` 参与 resolution ranking 主分数或 tie-break
- 用 broad-lineage top marker logFC 虚高绕过 under-clustering audit 并选择过粗 resolution
- 在 higher-resolution 已稳定恢复 `NK_cell / Pericyte / Smooth_muscle` 时，仍把低 resolution 粗 cluster 当作最终 major 接受
- 在 higher-resolution 已稳定恢复具体 mature major 时，仍把低 resolution 的 `Immune_transition / Stroma_transition` 当作最终 major 接受
- 在 Step 4 subtype ranking 中跨 parent major 共享 subtype 候选、marker pool 或 ranking objective
- 在 Step 4 subtype ranking 中把 `underclustering_penalty / split_gain_score / rare_lineage_recall_score` 或 subtype 对应指标固定为 0 占位，并据此选择过粗 resolution
- 在 Step 4 已稳定恢复具体 subtype 时，仍选择只产生 broad subtype、`<parent>_unspecified`、或 parent fallback 的低 resolution
- 在 T cell subtype search 中把 `Treg / TCF7_CD8 / Cytotoxic_CD8 / Exhausted_CD8 / NKT_like / MAIT_like` 等稳定 child cluster 合并进 `CD4_helper / GammaDelta_T / T_cell_unspecified` 后当作完成
- 在 Step 4 把 pericyte/smooth muscle marker 主导的 Fibroblast 子簇强行命名为 `myoCAF/iCAF`
- 在 Step 4 把 NK marker 主导且 TCR/CD3 弱的 T-cell 子簇强行命名为 T subtype
- 让 `EVs_or_microparticles / Artifact / Organelle` 绕过 non-cellular gate
- 让非法 `top/major` 组合默认 fallback 到 `Non_cellular / Artifact`
- 对 `Cancer_cell / Non_cellular / *_transition / progenitor` 风险语义做无证据 stripping
- 用本地 dictionary 或本地 TSV/CSV/RDS 路径冒充 runtime external evidence
- 在 `runtime_query_failed` 后写成熟 major 的正式仲裁结果
- 在 Step 4 用 parent-lock 把非法 subtype 强制改写成另一个更具体 subtype
- 在 Step 5 physically 删除细胞或改变 atlas 索引
- 最终 h5ad 的正式 `Epithelial_CNV_Label` 保留 stale `cnv_blocked/cnv_not_run`，而真实 CNV 结果只存在于 `_step2` 临时列
- 只交付图件、不交付 Section 4-ready annotated h5ad

## 完成检查

- [ ] 已验证所有 `assets/dictionary/03d_*` 文件
- [ ] Step 0 已完成 stage4 dictionary cross-lineage lint
- [ ] Step 0 已完成 step3_major manual-review-precedence lint 与 stromal-lineage lint
- [ ] Step 2 的 `CNV` 仍是唯一 `Cancer_cell` 正式入口
- [ ] Step 2 未把 unresolved CNV 转成 normal；输入 `cnv_blocked` 会触发真实 inferCNV 重算，真实 inferCNV 失败才显式阻断 strict run
- [ ] Step 3 已冻结权威 selected-resolution 状态
- [ ] Resume 时未重新计算 Step 3 cluster
- [ ] Step 3.5 已输出权威 `final_top / final_major / final_decision_mode`
- [ ] Step 3.5 已优先 rescue 可稳定拆分的具体 mature major；保留的 `Immune_transition / Stroma_transition` 均有无法拆分或真实混合证据
- [ ] `runtime_query_failed` 未退化为硬编码最终 major
- [ ] Step 3 已输出结构性 resolution ranking list 与 leakage audit
- [ ] 多次失败后的 discard 仅用于具备强 non-cellular 证据的类群
- [ ] Step 5 contract repair 未把细胞性 subtype/major 兜底为 `Artifact`
- [ ] Step 4 searchable majors 均先通过 purity gate
- [ ] Step 4 每个 searchable parent major 均输出独立 subtype resolution ranking list
- [ ] Step 4 subtype ranking 未使用全 0 占位的 subtype underclustering/split/fallback 指标
- [ ] Step 4 已优先写回稳定、非 transition、非 unspecified 的具体 subtype；fallback 仅用于未通过 acceptance gate 的 cluster
- [ ] T cell subtype search 已审计 `Treg / TCF7_CD8 / Cytotoxic_CD8 / Exhausted_CD8 / GammaDelta_T / NKT_like / MAIT_like`，没有把稳定 child cluster 压回粗标签
- [ ] 低置信或跨谱系冲突的 subtype 已回落到该 `parent_major` 在 contract 中定义的默认 fallback subtype
- [ ] 已交付正式 annotation h5ad 与 Section 4-ready h5ad
- [ ] QC 已覆盖工程、科学与 Section 4 handoff
