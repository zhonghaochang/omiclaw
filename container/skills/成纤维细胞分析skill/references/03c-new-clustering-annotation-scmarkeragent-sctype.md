---
name: 03c-new-clustering-annotation-scmarkeragent-sctype
description: Section 3 升级版独立规范：使用 assets/dictionary/03d_* 投射合同与 stage-aware 字典，将 scType/scMarkerAgent 的原始标签同时映射到 TopLevel_Compartment 与 Major_CellType，并在 CNV 后引入 non-cellular discard gate、risk-label preservation、基于运行期知识库查询的 rearrangement 仲裁流程、完整 checkpoint/resume、投射关系文档、质检与图件交付。
type: reference
---

# Section 3 变体：03d Dictionary-driven scType/scMarkerAgent Annotation

## 适用场景

当任务需要同时满足以下条件时，使用本规范替代默认 `03-clustering-annotation.md` 或 `03b-clustering-annotation-scmarkeragent-sctype.md`：

- 使用 `scMarkerAgent` 原始标签与 `ScType(R)` cluster-level 打分
- 正式执行时优先依赖预生成的 03d dictionary bundle，而不是让 runtime 自由造标签
- 让 `TopLevel_Compartment` 与 `Major_CellType` 在 major 聚类阶段同步建立映射关系
- 在 major 阶段显式处理 `Cancer_cell / Non_cellular / *_transition / progenitor` 类群，并先完成 non-cellular discard/review gate
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
- `scType` 给出的 `EVs_or_microparticles / Artifact / Organelle` 不能直接进入 rearrangement，必须先经过 `discard gate / noncellular review queue`
- `soft discard` 只允许写标志位和下游排除元数据，不得物理删除 atlas 中细胞
- raw label 中显式出现 `progenitor / precursor / transition / hybrid` 时，应保留风险语义，不得通过 stripping 强制成熟化
- 03d dictionary bundle 是 top/major/subtype 投射的正式依据
- 一旦选择本规范，`Step 3.5 / Step 4 / Step 5 / Step 6` 的新增规则必须作为主流程原生执行，不能先跑 legacy 逻辑、再以 contract patch 覆盖正式结果
- 正式输出必须只有一套单一权威决策；若需要比较 legacy 与新逻辑，比较结果只能写入 `work/audit/`，不得在正式 `work/annotation/*.tsv` 或 `.h5ad obs` 中保留双轨最终列
- `agent-mediated arbitration` 必须包含运行期知识库/文献查询；本地 dictionary 与 scMarkerAgent 库只能作为输入证据，不能替代运行期检索
- `agent-mediated arbitration` 的最终 major 必须由运行期检索结果参与决定；若运行期查询失败、无命中、或只有本地静态文件证据，则必须回到 review queue，而不能退化为硬编码 marker-major 启发式
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
- `Cancer_cell` 不能仅由 `scType` 直接正式化；最终 `Cancer_cell` 写回应以 Step 2 `CNV` 锁定为主，`Step 3.5` 只负责复核或排除异常 `Cancer_cell` 候选
- `EVs_or_microparticles / Artifact / Organelle` 既是 formal major，也是 `discard gate / noncellular review queue` 的强触发项
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

### 主流程一致性

- `Step 3.5` 必须直接消费 `Step 3` 的候选 major，并原生产出权威 `final_top / final_major / final_decision_mode`
- `Step 5` 必须直接消费 `Step 3.5` 的权威结果完成正式 obs 回写，不允许先完成 legacy writeback 再补丁修正正式标签
- `Step 6` 必须直接基于权威正式结果生成 QC 结论，不允许先输出 legacy QC 再补丁修改 pass/warning/fail 结论
- 若使用 wrapper / strict runner / 子类覆盖，其职责只能是替换主流程实现；禁止先调用 legacy base step 完成正式决策，再以 patch 子步骤覆写正式结果
- 允许的 post-step patch 仅限新增 debug / audit 文件，且不得修改以下正式对象：
  - `03d_major_cluster_mapping_after_rearrangement.tsv`
  - `03d_rearrangement_final_decisions.tsv`
  - `cell_major_assignment.tsv`
  - `cell_subtype_assignment.tsv`
  - `major_celltype_method.tsv`
  - `major_celltype_method_merged.tsv`
  - `merged.section3_annotated.h5ad`
  - `per_dataset/*.section3_annotated.h5ad`
  - `section3_*qc*`

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
- `Step 3.5` 不负责把未被 Step 2 锁定为 `Tumor_cells_candidate` 的类群升格为 `Cancer_cell`
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

注意：

- `03d_major_cluster_mapping.tsv` 仅是 `Step 3` 的候选映射表，不是最终正式 major 结果
- 从 `Step 3.5` 开始，正式 major 的单一权威来源必须切换为 `03d_major_cluster_mapping_after_rearrangement.tsv` 与 `03d_rearrangement_final_decisions.tsv`

## Step 3.5：non-cellular discard gate + rearrangement 仲裁

这是本规范的强制中介步骤，但必须先区分 `discard/review` 与 `rearrangement` 两条路径。

实现硬约束：

- 本步必须直接读取 `03d_major_cluster_mapping.tsv`，并一次性生成权威的 cluster-level final decision
- 禁止先让 legacy `rearrangement_arbitration` 产出一版正式 `final_major`，再以 `contract_patch / strict_patch / obs_patch / qc_patch` 回写覆盖
- 若需要保留 legacy 对照，只能额外输出到 `work/audit/section3_legacy_vs_current_diff.tsv` 或等价 audit 文件，且不得反向污染正式 annotation 表
- 正式 `final_top / final_major / final_decision_mode` 在本步结束后必须已经稳定，后续 Step 4/5/6 只能消费，不得二次改写

触发条件：

- `top1_major_candidate` 为 `EVs_or_microparticles / Artifact / Organelle`，先进入 `noncellular_discard_gate`
- `top1_major_candidate` 为 `Cancer_cell`
- `top1_major_candidate` 为 `Immune_transition / Stroma_transition`
- `provisional_top_from_step1` 与 `top_projected_from_major_contract` 明显冲突
- `CNV` 与 `Cancer_cell` 候选冲突
- `top1 / top2` 分差接近且 marker program 指向不同成熟 lineage

注意：

- raw label 明确出现 `progenitor / precursor / transition / hybrid` 时，这是风险语义保留信号，不是自动触发 rearrangement 的理由
- 仅因出现上述词而尝试把类群强制剥离为成熟 major，视为违例

### 3.5A：`noncellular_discard_gate`

- 所有 `EVs_or_microparticles / Artifact / Organelle` top1 案例都必须先经过本门禁
- 在门禁完成前，不得直接进入 `runner-up peeling`、`contract-aware stripping` 或 `agent-mediated arbitration`
- `soft discard` 只允许写 `discard_flag=True` 与下游排除元数据，不得物理删除 atlas 中细胞

`Artifact / Organelle` top1：

- 只有当至少两类正交证据同时支持 non-cellular，才允许 `discard_flag=True`
- 正交证据至少应来自以下类别中的两类：
  - 细胞 QC 明显异常，如极低 `n_genes_by_counts` / `total_counts`，或 organelle-only / debris-like program 异常占优
  - `top10_hvg + cluster markers` 缺失稳定 lineage program，且以 organelle / ribosomal / ambient / debris 信号为主
  - Step 1 provisional top 或 top-major contract 仍支持 `Non_cellular_candidate / Non_cellular`
  - 非 `scType top1` 的独立证据仍支持 non-cellular
- 若未满足 discard 条件，必须进入 `noncellular_review_queue`
- 只有在 review 明确认定 lineage 证据更强时，才允许释放到后续 rearrangement

`EVs_or_microparticles` top1：

- 默认进入 `noncellular_review_queue`，不得直接删除
- 必须显式比较 `noncellular evidence` 与 `lineage evidence`
- 只有当 `noncellular evidence > lineage evidence` 时，才允许 `discard_flag=True`
- 若 `lineage evidence >= noncellular evidence`，则 `discard_flag=False`，并可在保留 EV top1 冲突留痕的前提下释放到后续 rearrangement

### 3.5B：`risk-label preservation gate`

- raw label 明确包含 `progenitor / precursor / transition / hybrid` 时，不因该词本身进入 rearrangement
- 若合同投射已稳定落在 `Immune_transition / Stroma_transition` 或其他风险语义一致的正式路径，应直接保留该风险语义并退出 Step 3.5
- `contract-aware stripping` 不再剥离 `Cancer_cell / Non_cellular / *_transition / progenitor` 风险标签
- 若同一类群仍存在 top-level 冲突或其他独立冲突，必须进入 review queue / issue list，而不是借 rearrangement 强制成熟化

### rearrangement 子步骤

1. `runner-up peeling`
- 仅适用于未被 soft discard、且未被 `risk-label preservation gate` 直接关闭的案例
- 尝试使用 `top2` 或下一候选标签重新投射
- 只有当次佳标签与原标签分差在允许阈值内，且 marker 兼容时才接受

2. `contract-aware stripping`
- 仅允许剥离不携带 `Cancer_cell / Non_cellular / *_transition / progenitor` 风险语义的泛化修饰词
- 若剥离后仍能得到稳定成熟 major，则采用成熟 major
- rearrangement 可返回的 final major 仅限：
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
  - `Epithelial`
- rearrangement 不得直接返回：
  - `Cancer_cell`
  - `EVs_or_microparticles`
  - `Artifact`
  - `Organelle`

3. `agent-mediated arbitration`
- 若仍无法剥离，必须启用 agent 读取该 cluster 的 marker 证据
- agent 必须至少读取：
  - `top10` 高变基因
  - cluster marker 表
  - `top1 / top2 / top3` raw label 与 score
  - `top1-top2 delta`
  - Step 1 provisional top
  - CNV 结果
  - 细胞 QC 摘要与 discard/review 摘要
- agent 必须进一步执行运行期知识库和文献查询
- 允许使用的证据来源至少应覆盖以下两类中的两类：
  - 项目内知识库或已接入的结构化生物知识库
  - 权威数据库
  - 一级文献或高质量综述
  - 非 `scType top1` 的正交 marker / program 证据
- 本地 dictionary、manual normalization map、scMarkerAgent 库可作为输入证据，但不能作为唯一外部参考
- 禁止把 `agent-mediated arbitration` 实现为硬编码 marker-major `if/else`、固定关键词表、或直接复用既有运行的记忆化规则
- 禁止把运行期 query 仅实现为“生成 query 字符串并把本地文件路径写入 evidence”
- 禁止使用 `legacy_runner`、本地 TSV/CSV/RDS 文件路径、或静态 dictionary 路径来冒充 runtime external source
- 每次查询都必须记录：
  - query string
  - source name
  - retrieval time
  - kb id / PMID / DOI / URL
  - 提取出的支持或反对理由
- 至少 1 条查询结果必须来自非本地 external source，且 `kb id / PMID / DOI / URL` 不得全部为空
- 任何 agent arbitration family 的 `final_decision_mode` 只允许在以下条件全部满足时出现：
  - 已完成运行期查询
  - 至少 1 个非本地 external source 命中被写入查询表
  - 至少 1 条 evidence 明确写出该来源如何支持或反对 final major
  - 最终结论不只是对本地静态字典或 marker heuristics 的复述
- 若未完成运行期查询、命中全部失败、source 仅为本地静态文件、或只得到 query failure 占位结果，则不得以 agent arbitration family 的 `final_decision_mode` 结束；必须写为 `review_queue_due_to_runtime_query_failure`、`review_queue_due_to_insufficient_external_evidence`，或保留风险语义更高的合同路径

### rearrangement 必须留痕

必须输出：

- `work/annotation/03d_noncellular_discard_review.tsv`
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
- `discard_gate_status`
- `discard_flag`
- `discard_reason`
- `noncellular_review_status`
- `risk_label_preserved`
- `CNV_summary`
- `final_top`
- `final_major`
- `final_subtype_or_same_as_major`
- `final_decision_mode`
- `final_evidence_source`
- `final_evidence_links_or_kb_ids`
- `decision_comment`

额外要求：

- `03d_rearrangement_agent_queries.tsv` 中每个 agent arbitration family cluster 至少有 1 行 non-local external source 记录
- `03d_rearrangement_evidence.tsv` 必须显式区分 `support`、`refute`、`context_only`
- `decision_comment` 不得只写 `marker-driven inference -> <major>` 这一类无外部依据的模板句

### Cancer_cell 特别约束

- 若 `scType` 给出 `Cancer_cell`，但该类群未被 Step 2 锁定为 `Tumor_cells_candidate`，不能通过 rearrangement formalize 为 `Cancer_cell`
- `Cancer_cell` 的正式写回应优先完全来自 Step 2 `CNV` closure
- Step 3.5 对 `Cancer_cell` 候选的职责是识别冲突、阻止误写、或把异常 `Cancer_cell` 候选改写为非 cancer final major
- 若 `CNV` 不支持恶性，则必须采用非 cancer final major 或保留在 review queue
- 若 `CNV` 支持但 major search 仍给出强非 cancer 冲突，必须：
  - 在 `work/qc/section3_issue_list.tsv` 中写入 `manual_cancer_conflict`
  - 在 `work/annotation/03d_rearrangement_final_decisions.tsv` 中写明为什么没有采用 runner-up
  - 在最终 QC 中保留 warning，而不是 clean pass

## Step 4：按 final major 分开做 subtype 搜索

仅对允许细分且 `discard_flag=False` 的 mature majors 做真实 subtype 搜索：

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
- 已确认 `soft discard` 的类群不进入真实 subtype 搜索，`Cell_Subtype` 仅按合同写 same-as-major 并依赖 discard 标志参与下游排除
- 已完成 `noncellular_review_queue` 且被释放到成熟 lineage 的类群，按其 final major 进入对应 Step 4 搜索
- `Step 4` 不得再改写 `Major_CellType`；若发现 `Step 3.5` 决策不足以支撑 subtype 搜索，应回退到 `Step 3.5 review queue`，而不是在 subtype 阶段偷偷修 major

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
- `discard_flag`
- `discard_reason`
- `noncellular_review_status`
- `exclude_from_feature_engineering`
- `risk_label_preserved`

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
- 任何 `Non_cellular` 的正式写回或 soft discard 都必须能追溯到 `discard gate / noncellular review` 文档
- 任何 `*_transition / progenitor` 风险语义的正式写回都必须能追溯到 raw label 保留证据或 review 文档，不能只靠 stripping
- 任何 `Cancer_cell` 的正式写回都必须能追溯到 Step 2 `CNV` 锁定或单独的 cancer 冲突复核文档，不能来自 rearrangement 直接返回
- Step 2 产出的 `Tumor_cells_candidate / Normal_Epithelial_candidate` 必须在正式写回前显式收敛到 `Cancer_cell / Epithelial`
- `soft discard` 只允许通过 obs 元数据和下游排除标志生效，不得在 Step 5 改变 atlas 细胞数、索引或坐标
- `Step 5` 必须以 `03d_major_cluster_mapping_after_rearrangement.tsv` 与 `03d_rearrangement_final_decisions.tsv` 为唯一正式来源
- 正式 annotation 文件与 `.h5ad obs` 不得同时保留相互冲突的双轨最终列，例如 `final_major` 与 `final_major_strict`、`final_top` 与 `final_top_strict`
- 若需要比较 legacy 与 current 结果，比较列只能写入 `work/audit/*`，不得进入 `work/annotation/*` 正式表或正式 obs

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
- 是否存在 “先 legacy 决策、后 patch 改正式结果” 的执行轨迹
- 正式 annotation 表与 `.h5ad obs` 中是否残留 `*_strict / *_legacy / *_patched` 这类双轨最终列

#### 科学性质检必须检查

- `top=Stroma` 是否仍有 `major=Stroma`
- `Fibroblast / Endothelial / Pericyte / Smooth_muscle / Stroma_transition` 是否都得到合理分配
- `Cancer_cell` 是否存在未经过 Step 2 `CNV` 锁定却被正式写回的情况
- `Non_cellular` 是否覆盖 EV / microparticle / artifact / organelle 类群，且其 `discard gate / review queue` 路径完整
- `Immune_transition` 是否覆盖 progenitor / precursor / early immune labels
- raw label 中显式 `progenitor / precursor / transition / hybrid` 的类群是否保留了风险语义，而未被无证据强制成熟化
- `rearrangement` 争议类群是否都留下 `top10_hvg + 初始注释 + 最终注释 + 依据来源`
- `agent-mediated arbitration` 是否对每个仲裁类群都记录了运行期 query、source、kb id / PMID / DOI / URL，而不是只引用本地预烘焙字典
- 所有 agent arbitration family 类群是否至少有 1 条 non-local external source 命中，并在 evidence 表中写出具体支持/反对理由
- 若 `runtime_query_failed`、`legacy_runner`、或纯本地文件路径仍出现在 agent 查询结果中，是否已阻止该类群被写成 agent arbitration family 结果

若发现工程模糊点或科学性问题：

- 必须写入 `section3_issue_list.tsv`
- 不得在 Step 6 偷偷补齐后仍标记为 clean pass

## 明确禁止

- 在最终 completed 输出中保留 `major=Stroma`
- 使用旧 `assets/03c_*` dictionary 路径
- 跳过 `Step 3.5` 的 `discard gate / review queue / rearrangement`
- 用 `scType` 的 `Cancer_cell` 直接替代 `CNV`
- 让 `EVs_or_microparticles / Artifact / Organelle` top1 案例绕过 `discard gate` 直接进入 rearrangement
- 对 `Cancer_cell / Non_cellular / *_transition / progenitor` 风险语义做无证据 stripping 或强制成熟化
- 用硬编码 marker-major 规则替代运行期知识库/文献查询来完成 `agent-mediated arbitration`
- 先执行 legacy `rearrangement_arbitration`，再以 `contract_patch / strict_patch` 覆写正式 `final_major / final_top / final_decision_mode`
- 先执行 legacy `global_writeback`，再以 `obs_patch / contract_patch` 修改正式 obs 中的 `Major_CellType / Cell_Subtype / discard` 元数据
- 先执行 legacy QC，再以 `qc_patch` 修改正式 QC 结论
- 在 `agent_queries` 中使用 `legacy_runner`、本地文件路径、或空白 kb id / PMID / DOI / URL 作为 agent arbitration family 结果的唯一证据
- 后台执行而不写 process 与 checkpoint
- Step 6 事后补齐正式方法表、投射表或争议文档

## 完成检查

- [ ] 已加载 `assets/dictionary/03d_*` 正式合同、字典、inventory、review queue
- [ ] Step 0 已完成路径与 schema 校验
- [ ] Step 1 已生成 provisional top-level 粗分
- [ ] Step 2 已完成 CNV 鉴瘤
- [ ] Step 3 已完成 major 多分辨率搜索
- [ ] 已输出 top-major 投射关系文档
- [ ] 所有 `EVs_or_microparticles / Artifact / Organelle` top1 类群都先经过 `discard gate / noncellular review queue`
- [ ] raw label 明确包含 `progenitor / precursor / transition / hybrid` 的类群未仅因该词进入 rearrangement，且风险语义已保留
- [ ] `Step 3.5` 已直接产出权威正式决策，而不是 legacy 决策后的 patch 覆写
- [ ] rearrangement 已留下 `top10_hvg / 初始注释 / 最终注释 / 依据来源`
- [ ] `agent-mediated arbitration` 已留下运行期 query、source 与 kb id / PMID / DOI / URL
- [ ] 所有 agent arbitration family 类群至少有 1 条 non-local external source 命中，且无 `legacy_runner` 占位证据混入正式仲裁
- [ ] Step 4 已按 final major 执行 subtype 搜索或 same-as-major 规则
- [ ] Step 5 已写回正式 obs、方法表、raw detail 与 projection rule
- [ ] 正式 annotation 表与 `.h5ad obs` 中不存在双轨最终列或 patch 后覆盖 legacy 决策的痕迹
- [ ] Step 6 已完成工程质检、科学性质检、路径质检与图件交付
- [ ] `top=Stroma` 下 `major=Stroma` 为 `0`
