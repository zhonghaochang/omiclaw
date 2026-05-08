---
name: 03c-new-clustering-annotation-scmarkeragent-sctype
description: Section 3 升级版独立规范：使用 assets/dictionary/03d_* 投射合同与 stage-aware 字典，将 scType/scMarkerAgent 的原始标签同时映射到 TopLevel_Compartment 与 Major_CellType，并在 CNV 后引入 cancer/non-cellular/transition/progenitor rearrangement 仲裁流程、完整 checkpoint/resume、投射关系文档、质检与图件交付。
type: reference
---

# Section 3 变体：03d Dictionary-driven scType/scMarkerAgent Annotation

## 适用场景

当任务需要同时满足以下条件时，使用本规范替代默认 `03-clustering-annotation.md` 或 `03b-clustering-annotation-scmarkeragent-sctype.md`：

- 使用 `scMarkerAgent` 原始标签与 `ScType(R)` cluster-level 打分
- 正式执行时优先依赖预生成的 03d dictionary bundle，而不是让 runtime 自由造标签
- 让 `TopLevel_Compartment` 与 `Major_CellType` 在 major 聚类阶段同步建立映射关系
- 在 major 阶段显式处理 `Cancer_cell / Non_cellular / *_transition / progenitor` 类群
- 强制保留完整 process、checkpoint、resume、projection audit 与争议仲裁文档

本文件是 **Section 3 的替代执行规范**，不是默认规范的补丁。

同一 run 中：

- 只能选择默认 `03-clustering-annotation.md`
- 或 `03b-clustering-annotation-scmarkeragent-sctype.md`
- 或本变体 `03c-new-clustering-annotation-scmarkeragent-sctype.md`

三者不得混用。

说明：

- 本文件名仍为 `03c`，但正式 ontology 与 dictionary 已切换到 `03d` bundle
- 本规范不保证与旧 `03c` major/top schema 向后兼容

## 核心原则

- Python / AnnData 持有正式 atlas 状态、正式 `.h5ad`、正式 checkpoint 与正式 process 文档
- R / scType / scMarkerAgent 只负责 cluster 级 raw label、score、runner-up、marker evidence
- `CNV` 仍是 epithelial malignancy 的主判据；`scType` 给出的 `Cancer_cell` 只能触发仲裁，不能直接替代 CNV
- 03d dictionary bundle 是 top/major/subtype 投射的正式依据
- 任何大步、小步、子步骤都必须写 checkpoint，支持从最近有效 checkpoint 恢复
- `TopLevel_Compartment` 与 `Major_CellType` 不能各自漂移，必须通过显式投射关系文档对齐
- `Stroma` 在最终 completed major 中禁止保留为 umbrella major

## 03d 正式资产路径

本规范中的正式 dictionary 资产一律从以下目录读取：

- `assets/dictionary/03d_fixed_projection_contract_top_level.tsv`
- `assets/dictionary/03d_fixed_projection_contract_major_celltype.tsv`
- `assets/dictionary/03d_fixed_projection_contract_subtype.tsv`
- `assets/dictionary/03d_raw_to_standard_projection_policy.tsv`
- `assets/dictionary/03d_merge_conflict_unknown_policy.tsv`
- `assets/dictionary/03d_stage_aware_raw_label_inventory.tsv`
- `assets/dictionary/03d_stage_aware_raw_to_standard_projection_dictionary.tsv`
- `assets/dictionary/03d_projection_review_queue.tsv`
- `assets/dictionary/03d_manual_review_contested_items_manual_checked.csv`
- `assets/dictionary/03d_manual_normalization_map.tsv`
- `assets/dictionary/scmarkeragent_label_projection.tsv`

以下非 dictionary 运行资产仍可继续从原 `assets/` 路径读取：

- `assets/scmarkeragent_db_human.RDS`
- `assets/scmarkeragent_bridge_config.json`
- `assets/Immune_All_Low.pkl`
- `assets/PanglaoDB_makers.tsv`
- `assets/Cell_marker_Seq.xlsx`
- `assets/gencode.v44.gene_positions.tsv.gz`
- `assets/gencode.v44.annotation.gtf.gz`

若任何 dictionary 类路径仍指向旧 `assets/03c_*`，视为 `ERROR:old_dictionary_path_detected`。

## 03d 正式标签体系

### TopLevel_Compartment

必须严格使用 `assets/dictionary/03d_fixed_projection_contract_top_level.tsv`：

- `Immune`
- `Stroma`
- `Non_cellular`
- `Epithelial_or_cancer_cell`

### Major_CellType

必须严格使用 `assets/dictionary/03d_fixed_projection_contract_major_celltype.tsv`：

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
- `Cancer_cell` 不能仅由 `scType` 直接正式化，必须经过 `Step 3.5 rearrangement`
- `EVs_or_microparticles / Artifact / Organelle` 是 formal major，不再只是 review queue 描述词
- `Immune_transition` 是 formal major，用于 immune progenitor / precursor / transition / hybrid 类群

### Cell_Subtype

必须严格使用 `assets/dictionary/03d_fixed_projection_contract_subtype.tsv`。

关键规则：

- `B_cell / T_cell / NK_cell / Myeloid` 继续允许真实 subtype
- `Immune_transition / Stroma_transition / EVs_or_microparticles / Artifact / Organelle / Cancer_cell / Epithelial` 默认使用 same-as-major subtype
- `Fibroblast` 允许 `Fibroblast / iCAF / myoCAF / apCAF / Mesothelial_like`
- `Endothelial / Pericyte / Smooth_muscle` 默认使用 same-as-major subtype

## 工程硬门禁

### 执行方式

- 禁止后台 `start_job`
- 必须前台执行，并在每个大步开始前写 process 文档
- 任一步发现输入资产缺失、路径漂移、schema 异常，必须立刻 `failed`

### 正式过程文档

必须持续维护：

- `work/process_index.tsv`
- `work/annotation/checkpoints/section3_checkpoint_manifest.tsv`
- `work/annotation/checkpoints/section3_micro_checkpoint_manifest.tsv`
- `work/annotation/section3_step_runtime.tsv`
- `work/annotation/section3_asset_manifest.tsv`

要求：

- `process_index.tsv` 必须 append-only
- 每条 process 记录至少包含：
  - `run_id`
  - `attempt_id`
  - `step_name`
  - `substep_name`
  - `status`
  - `started_at`
  - `finished_at`
  - `input_paths`
  - `output_paths`
  - `checkpoint_dir`
  - `error_code`

### checkpoint / resume

每个大步和每个小步都必须有独立目录：

- `work/annotation/checkpoints/step0_validate_assets/`
- `work/annotation/checkpoints/step1_top_level/`
- `work/annotation/checkpoints/step2_cnv/`
- `work/annotation/checkpoints/step3_major_search/`
- `work/annotation/checkpoints/step3_5_rearrangement/`
- `work/annotation/checkpoints/step4_subtype/`
- `work/annotation/checkpoints/step5_writeback/`
- `work/annotation/checkpoints/step6_qc_and_figures/`

每个 micro checkpoint 至少保存：

- 输入表快照
- 关键参数快照
- 当前选择的 resolution
- 中间 cluster marker / means
- 当前 obs 回写前后的 schema 检查结果
- `_READY` 哨兵文件

resume 规则：

- 只能从最近一个同时满足 `manifest + _READY + input sha256 一致` 的 checkpoint 恢复
- 任何输入资产路径、合同文件、字典文件、bridge config、cluster marker 文件的 sha256 改变，都必须触发 checkpoint invalidation
- 每次 `read_h5ad()` 或恢复后，必须重新检查 obs 列类型是否可写；若为 categorical，必须先安全转回可写字符串列，再继续回写

## Step 0：验证 03d 资产与路径

执行前必须检查：

- 所有 `assets/dictionary/03d_*` 文件存在且可读
- `03d_manual_review_contested_items_manual_checked.csv` 可按 `utf-8` CSV 正常读取
- `03d` 合同列名、字典列名、inventory 列名、review queue 列名完整
- `03d` 文件路径写入运行期资产清单

最低输出：

- `work/annotation/section3_asset_manifest.tsv`
- `work/annotation/03d_projection_contract_files_used.tsv`
- `work/annotation/checkpoints/step0_validate_assets/_READY`

## Step 1：全局 top-level 粗分

必须在全局 atlas 上执行 coarse clustering 与 marker 检查，得到 `provisional_top_level`。

本步允许的 provisional top：

- `Immune`
- `Stroma`
- `Epithelial_or_cancer_cell`
- `Non_cellular_candidate`

注意：

- `Non_cellular` 的正式写回可在 Step 3 通过 03d dictionary 完成
- Step 1 的 top 只是 coarse seed，不是最终 completed top

最低输出：

- `work/annotation/top_level_compartment_method.tsv`
- `work/annotation/top_level_cluster_mapping.tsv`
- `work/annotation/top_level_cluster_markers.tsv`
- `work/annotation/top_level_provisional_assignment.tsv`

## Step 2：CNV 鉴瘤

必须从 `provisional_top_level == Epithelial_or_cancer_cell` 子集独立执行：

- `infercnvpy`
- `CNV_Score`
- `GMM` 优先阈值
- 临时写回 `Tumor_cells_candidate / Normal_Epithelial_candidate`

硬约束：

- `CNV` 是 cancer 判定的主证据
- `scType` 在后续 major 阶段提出 `Cancer_cell` 时，只能触发仲裁，不能直接推翻 CNV
- `Tumor_cells_candidate` 在最终 03d 写回时只能映射到 `Epithelial_or_cancer_cell / Cancer_cell`
- `Normal_Epithelial_candidate` 在最终 03d 写回时只能映射到 `Epithelial_or_cancer_cell / Epithelial`

最低输出：

- `work/annotation/epithelial_cnv_scores.tsv`
- `work/annotation/epithelial_cnv_threshold.tsv`
- `work/annotation/epithelial_cnv_method.tsv`
- `work/annotation/epithelial_cnv_source_data.tsv`

## Step 3：major 多分辨率搜索 + top-major 联合投射

### 搜索范围

对所有未被 Step 2 锁定为 completed epithelial/cancer major 的细胞执行 major 搜索。

默认至少测试：

- `0.2`
- `0.4`
- `0.6`
- `0.8`
- `1.0`
- `1.2`

### major 选择流程

每个 resolution 都必须真实执行：

- `HVG -> PCA -> neighbors -> UMAP -> Leiden`
- `rank_genes_groups`
- `cluster_means`
- R bridge
- `top1_raw_label / top2_raw_label / score / delta`
- 用 `assets/dictionary/03d_stage_aware_raw_to_standard_projection_dictionary.tsv` 进行 stage-aware 投射

### top-major 联合投射

major 写回前，必须对每个 cluster 同时计算：

- `provisional_top_from_step1`
- `major_candidate_from_scType`
- `top_projected_from_major_contract`
- `runner_up_major_candidate`
- `top_projected_from_runner_up`
- `reconciliation_status`

必须输出正式投射关系文档：

- `work/annotation/03d_top_major_projection_relation.tsv`
- `work/annotation/03d_top_major_projection_audit.tsv`
- `work/annotation/03d_top_major_projection_conflicts.tsv`
- `work/annotation/03d_major_resolution_search.tsv`
- `work/annotation/03d_major_cluster_mapping.tsv`

其中 `03d_top_major_projection_relation.tsv` 至少记录：

- `top_level_label`
- `major_celltype`
- `allowed_by_contract`
- `contract_source`

`03d_top_major_projection_audit.tsv` 至少记录：

- `cluster_id`
- `resolution`
- `provisional_top_from_step1`
- `top1_raw_label`
- `top1_major_candidate`
- `top1_top_projected`
- `top2_raw_label`
- `top2_major_candidate`
- `top2_top_projected`
- `selected_major_before_rearrangement`
- `selected_top_before_rearrangement`
- `projection_rule`
- `reconciliation_status`

## Step 3.5：rearrangement 仲裁

这是本规范的强制中介步骤。

触发条件：

- `scType` major 候选为 `Cancer_cell`
- `scType` major 候选为 `EVs_or_microparticles / Artifact / Organelle`
- `scType` major 候选为 `Immune_transition / Stroma_transition`
- raw label 明确出现 `progenitor / precursor / transition / hybrid`
- `provisional_top_from_step1` 与 `top_projected_from_major_contract` 明显冲突
- `CNV` 与 `Cancer_cell` 候选冲突

### rearrangement 子步骤

1. `runner-up peeling`
- 尝试使用 `top2` 或下一候选标签重新投射
- 只有当次佳标签与原标签分差在允许阈值内，且 marker 兼容时才接受

2. `contract-aware stripping`
- 剥离 `Cancer_cell / Non_cellular / *_transition / progenitor` 风险标签
- 若剥离后仍能得到稳定成熟 major，则采用成熟 major

3. `agent-mediated arbitration`
- 若仍无法剥离，必须启用 agent 读取该 cluster 的 marker 证据
- agent 必须至少读取：
  - `top10` 高变基因
  - cluster marker 表
  - `top1 / top2 / top3` raw label 与 score
  - Step 1 provisional top
  - CNV 结果
- agent 必须进一步查询文献库和知识库
- 文献与知识库应优先使用一级来源、综述、权威数据库或项目内既有知识库

### rearrangement 必须留痕

必须输出：

- `work/annotation/03d_rearrangement_cases.tsv`
- `work/annotation/03d_rearrangement_marker_top10.tsv`
- `work/annotation/03d_rearrangement_attempts.tsv`
- `work/annotation/03d_rearrangement_agent_queries.tsv`
- `work/annotation/03d_rearrangement_evidence.tsv`
- `work/annotation/03d_rearrangement_final_decisions.tsv`

每个有争议类群至少记录：

- `cluster_id`
- `resolution`
- `cell_count`
- `top10_hvg`
- `initial_top`
- `initial_major`
- `initial_raw_label`
- `runner_up_raw_label`
- `CNV_summary`
- `final_top`
- `final_major`
- `final_subtype_or_same_as_major`
- `final_decision_mode`
- `final_evidence_source`
- `final_evidence_links_or_kb_ids`
- `decision_comment`

### Cancer_cell 特别约束

- 若 `scType` 给出 `Cancer_cell`，但 `CNV` 不支持恶性，不能直接 formalize 为 `Cancer_cell`
- 只有以下情况之一满足，才允许正式写 `Cancer_cell`：
  - `CNV` 支持
  - rearrangement 后经 agent 仲裁，并同时给出至少两类独立证据来源，且文档完整

这里的独立证据至少应来自以下两类中的两类：

- 文献或综述证据
- 权威知识库或项目内既有知识库证据
- 明确的 marker program 证据
- 其他非 `scType top1` 的正交证据

若走此例外路径，必须额外：

- 在 `work/qc/section3_issue_list.tsv` 中写入 `manual_cancer_override`
- 在 `work/annotation/03d_rearrangement_final_decisions.tsv` 中写明为什么没有采用 runner-up
- 在最终 QC 中保留 warning，而不是 clean pass

否则必须：

- 采用 runner-up 成熟标签
- 或保留在 review queue

## Step 4：按 final major 分开做 subtype 搜索

仅对允许细分的 mature majors 做真实 subtype 搜索：

- `B_cell`
- `T_cell`
- `NK_cell`
- `Myeloid`
- `Fibroblast`

默认 same-as-major 或仅保留辅助 subcluster 的 major：

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

规则：

- mature immune majors 仍按 parent-lock 搜索 subtype
- `Fibroblast` 可输出 `Fibroblast / iCAF / myoCAF / apCAF / Mesothelial_like`
- `Endothelial / Pericyte / Smooth_muscle` 不强行细分正式 subtype
- `*_transition / Non_cellular / Cancer_cell / Epithelial` 默认 same-as-major

最低输出：

- `work/annotation/subgroups/<major>/<major>_subtype_resolution_search.tsv`
- `work/annotation/subgroups/<major>/<major>_subtype_method.tsv`
- `work/annotation/subgroups/<major>/<major>_cluster_markers.tsv`

## Step 5：全局回写与正式方法表

必须统一回写：

- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Annotation_Method`
- `Annotation_Method_Detail`
- `Subtype_Assignment_Score`
- `annotation_confidence`
- `CNV_Score`
- `top1_raw_label`
- `runner_up_raw_label`
- `projection_rule`

必须新增正式方法/投射文档：

- `work/annotation/major_celltype_method.tsv`
- `work/annotation/major_celltype_method_merged.tsv`
- `work/annotation/top_level_compartment_method.tsv`
- `work/annotation/03d_top_major_projection_relation.tsv`
- `work/annotation/03d_top_major_projection_audit.tsv`
- `work/annotation/03d_top_major_projection_conflicts.tsv`
- `work/annotation/03d_raw_projection_hits.tsv`
- `work/annotation/03d_review_queue_hits.tsv`
- `work/annotation/03d_out_of_dictionary_raw_labels.tsv`
- `work/annotation/03d_epithelial_candidate_to_final_mapping.tsv`

要求：

- major 与 top 的最终关系必须可从文档中完整追溯
- 任何 `Non_cellular / *_transition / Cancer_cell` 的正式写回都必须能追溯到 rearrangement 决策文档
- Step 2 产出的 `Tumor_cells_candidate / Normal_Epithelial_candidate` 必须在正式写回前显式收敛到 `Cancer_cell / Epithelial`

## Step 6：图件与最终质检

### 图件

必须交付：

- `work/figures/section3/Global_Major_UMAP.pdf`
- `work/figures/section3/Global_Major_UMAP.png`
- `work/figures/section3/Global_Major_UMAP_source_data.tsv`
- `work/figures/section3/Global_Major_UMAP_caption.md`

以及每个最终出现的 `Major_CellType` 各 1 张聚类图：

- `work/figures/section3/subgroups/<major>_Subtype_UMAP.pdf`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP.png`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_source_data.tsv`
- `work/figures/section3/subgroups/<major>_Subtype_UMAP_caption.md`

### 最终质检

必须分别输出：

- `work/qc/section3_engineering_qc.tsv`
- `work/qc/section3_scientific_qc.tsv`
- `work/qc/section3_path_audit.tsv`
- `work/qc/section3_process_integrity_qc.tsv`
- `work/qc/section3_issue_list.tsv`
- `work/qc/section3_qc_report.md`

#### 工程质检必须检查

- 所有 dictionary 路径是否都转向 `assets/dictionary/03d_*`
- 是否仍残留旧 `assets/03c_*` dictionary 路径
- `process_index.tsv` 是否 append-only
- 每个 step 与 micro-step 是否都写 checkpoint
- 是否存在空 stage、缺 manifest、缺 `_READY` 哨兵
- 是否存在恢复后未重新做 mutable/categorical 检查

#### 科学性质检必须检查

- `top=Stroma` 是否仍有 `major=Stroma`
- `Fibroblast / Endothelial / Pericyte / Smooth_muscle / Stroma_transition` 是否都得到合理分配
- `Cancer_cell` 是否存在仅靠 `scType` 而无 `CNV` 或仲裁证据的正式写回
- `Non_cellular` 是否覆盖 EV / microparticle / artifact / organelle 类群
- `Immune_transition` 是否覆盖 progenitor / precursor / early immune labels
- `rearrangement` 争议类群是否都留下 `top10_hvg + 初始注释 + 最终注释 + 依据来源`

若发现工程模糊点或科学性问题：

- 必须写入 `section3_issue_list.tsv`
- 不得在 Step 6 偷偷补齐后仍标记为 clean pass

## 明确禁止

- 在最终 completed 输出中保留 `major=Stroma`
- 使用旧 `assets/03c_*` dictionary 路径
- 跳过 `Step 3.5 rearrangement`
- 用 `scType` 的 `Cancer_cell` 直接替代 `CNV`
- 对 `Non_cellular / *_transition / progenitor` 类群不留证据直接 formalize
- 后台执行而不写 process 与 checkpoint
- Step 6 事后补齐正式方法表、投射表或争议文档

## 完成检查

- [ ] 已加载 `assets/dictionary/03d_*` 正式合同、字典、inventory、review queue
- [ ] Step 0 已完成路径与 schema 校验
- [ ] Step 1 已生成 provisional top-level 粗分
- [ ] Step 2 已完成 CNV 鉴瘤
- [ ] Step 3 已完成 major 多分辨率搜索
- [ ] 已输出 top-major 投射关系文档
- [ ] 所有 `Cancer_cell / Non_cellular / *_transition / progenitor` 类群都经过 Step 3.5 rearrangement
- [ ] rearrangement 已留下 `top10_hvg / 初始注释 / 最终注释 / 依据来源`
- [ ] Step 4 已按 final major 执行 subtype 搜索或 same-as-major 规则
- [ ] Step 5 已写回正式 obs、方法表、raw detail 与 projection rule
- [ ] Step 6 已完成工程质检、科学性质检、路径质检与图件交付
- [ ] `top=Stroma` 下 `major=Stroma` 为 `0`
