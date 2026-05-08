---
name: 03b-clustering-annotation-scmarkeragent-sctype
description: Section 3 优化版独立规范：在全局 atlas 上完成 compartment 粗分、CNV 鉴瘤、major 与各 major group 的真实多分辨率搜索、标签回写、质检与正式图件交付；禁止事后补齐与伪完成。
type: reference
---

# Section 3 变体：多分辨率聚类 + scMarkerAgent + ScType(R) 注释

## 适用场景

当任务满足以下条件时，可使用本规范替代默认 `03-clustering-annotation.md`：

- 希望在 Section 3 中引入 `scMarkerAgent` 作为主要知识库来源
- 希望在 `R` 环境中使用 `ScType` 风格 cluster-level 打分生成候选标签
- 希望进行真实的多分辨率搜索，而不是单次聚类后人工补齐
- 希望交付总图与各 `major celltype` 的独立图件，并完整附带 caption、图例与 source data
- 希望本 Section 自成体系，单独阅读即可执行

同一 run 中：

- 只能选择默认 `03-clustering-annotation.md`
- 或本变体 `03b-clustering-annotation-scmarkeragent-sctype.md`
- 二者不得混用

## 总体流程

| 项 | 说明 |
|---|---|
| 输入 | Section 2 `merged.h5ad`、本地 marker/KB、CNV 基因位置表 |
| 处理 | 全局粗分 -> CNV 鉴瘤 -> 全局 major 多分辨率搜索 -> 各 major group 单独多分辨率搜索 -> 标签回写 -> 质检 -> 图件交付 |
| 输出 | 带正式标签的 `.h5ad`、真实方法表、真实 resolution 搜索表、真实 merge 表、cluster markers、QC 报告、总图与各 major group 图件 |

## 核心执行原则

- Python / AnnData 持有正式 atlas 状态与 `.h5ad` 落盘权
- R bridge 只负责 cluster-level 候选标签、分数与证据输出
- Step 3 必须执行真实的多次 resolution 搜索，不能只跑一个分辨率
- Step 4 必须按 `major celltype` 分开建模，不能把所有 immune 或所有 stroma 混成一个 pooled 子集统一注释
- Step 6 只允许做质检与问题汇报，不允许事后补齐、回填、伪造或轻量 finalize
- 所有方法表、merge 表、resolution search 表必须来源于真实执行结果，禁止“carry-forward”“synthetic”“lightweight finalize”
- 若 R bridge 已输出有效结果，必须立即停止调用 `CellTypist` 进行补齐
- 若 R bridge 有效但部分 cluster 未达接受阈值，这些 cluster 必须保留为 `Unknown_*`，不得再用 `CellTypist` 覆盖
- 全流程必须输出 1 张总图，以及每个 `Major_CellType` 各 1 张独立图件
- 每张图都必须交付标题、图例、caption 与 source data

## 仅继承的工程约束

- 仅借鉴默认 `03-clustering-annotation.md` 的工程要求：
  - checkpoint / resume
  - append-only 过程索引
  - host / foreground 运行状态如实汇报
  - 长时任务监控与失败恢复
- 不继承默认 `03-clustering-annotation.md` 的分析流程、标签路径或方法替代；本文件的 Step 1 -> Step 6 仍是唯一有效分析合同

## 本 Section 的工程硬门禁与恢复要求

- `atlas_after_step{1..5}.h5ad` 仍然是顶层里程碑 checkpoint，但它们只能表示 step 级完成态，**绝不能替代** step 内细粒度 checkpoint
- 除里程碑 checkpoint 外，step 内每个“耗时明显、失败后不应从 step 起点整段重做、或会改变 atlas / subset 状态”的子阶段，都必须定义 micro checkpoint
- micro checkpoint 允许采用“最小足够产物”策略：
  - 发生 AnnData / atlas / subset 状态变更时，必须由 Python 写 `.h5ad`
  - 纯 bridge / metrics / mapping / QC 子阶段可写 `tsv/json/md`，但必须可用于 resume 判定
  - 正式 `.h5ad` 与任何会改变 atlas 正式状态的 checkpoint 只能由 Python 写出；R bridge 只能写 stage artifact checkpoint 与 manifest
- Step 1 -> Step 6 推荐采用“里程碑 checkpoint + 子阶段 checkpoint”双层结构，推荐目录：

```text
work/annotation/checkpoints/
├── atlas_after_step1.h5ad
├── atlas_after_step2.h5ad
├── atlas_after_step3.h5ad
├── atlas_after_step4.h5ad
├── atlas_after_step5.h5ad
├── step1/
│   ├── step1_00_input_validated.h5ad
│   ├── step1_01_coarse_graph_ready.h5ad
│   ├── step1_02_coarse_markers_ready.tsv.gz
│   └── step1_03_compartment_written.h5ad
├── step2/
│   ├── step2_00_epi_subset_ready.h5ad
│   ├── step2_01_gene_order_ready.json
│   ├── step2_02_cnv_scores_ready.tsv
│   ├── step2_03_threshold_ready.tsv
│   └── step2_04_epi_labels_written.h5ad
├── step3/
│   ├── step3_00_major_subset_ready.h5ad
│   ├── step3_01_major_graph_ready.h5ad
│   └── major_res_0.80/
│       ├── 00_leiden_done.tsv
│       ├── 01_markers_ready.tsv
│       ├── 02_bridge_inputs_ready.json
│       ├── 03_bridge_outputs_validated.json
│       └── 04_metrics_ready.tsv
├── step4/
│   └── NK_cell/
│       ├── step4_NK_cell_00_subset_ready.h5ad
│       ├── step4_NK_cell_01_graph_ready.h5ad
│       ├── step4_NK_cell_05_label_map_written.tsv.gz
│       └── NK_cell_res_0.80/
│           ├── 00_leiden_done.tsv
│           ├── 01_markers_ready.tsv
│           ├── 02_annotation_candidates_ready.json
│           ├── 03_assignment_ready.tsv
│           └── 04_metrics_ready.tsv
├── step5/
│   ├── step5_00_global_label_table_ready.tsv.gz
│   ├── step5_01_dictionary_ready.tsv
│   ├── step5_02_prewrite_validated.h5ad
│   └── step5_03_global_labels_written.h5ad
├── step6/
│   ├── step6_00_qc_inventory_ready.tsv
│   ├── step6_01_qc_rules_evaluated.tsv
│   ├── step6_02_figure_contract_checked.tsv
│   └── step6_03_issue_register_written.tsv
└── section3_checkpoint_manifest.tsv
```

- `section3_checkpoint_manifest.tsv` 至少记录：
  - `run_id`
  - `attempt_id`
  - `job_id`
  - `step`
  - `substep`
  - `checkpoint_level`
  - `context_scope`
  - `context_name`
  - `artifact_kind`
  - `checkpoint_path`
  - `upstream_checkpoint`
  - `n_obs`
  - `n_vars`
  - `params_hash`
  - `content_sha256`
  - `writer`
  - `validated`
  - `reused`
  - `resume_from`
  - `invalidated_reason`
  - `created_at`
- `work/process_index.tsv` 在本 Section 中必须 append-only；新 retry 不得覆盖旧 attempt 的历史行
- 每个 micro substep 在真正开算前都必须先写 1 行 `running`，成功后写 `completed`，失败后写 `failed`；禁止只在 step 结束时一次性补写过程轨迹
- `work/process_index.tsv` 最少字段推荐扩展为：
  - `ts`
  - `run_id`
  - `attempt_id`
  - `job_id`
  - `host_mode`
  - `step`
  - `substep`
  - `checkpoint_level`
  - `context_name`
  - `status`
  - `detail`
  - `metrics`
  - `checkpoint_path`
  - `last_success_checkpoint`
  - `resume_from`
  - `pid`
  - `log_path`
  - `error_code`
- 必须显式维护 `run_id`、`attempt_id`、`job_id` 三者；所有过程文档、checkpoint 清单、bridge 运行文档都必须能追溯到这三者
- `work/annotation/scmarkeragent_bridge_checkpoint_manifest.tsv` 也必须 append-only，且至少记录每个 bridge stage / context 的：
  - `run_id`
  - `attempt_id`
  - `job_id`
  - `stage`
  - `context`
  - `checkpoint_level`
  - `stage_dir`
  - `input_artifact`
  - `output_artifact`
  - `stage_config_sha256`
  - `label_projection_sha256`
  - `cache_hit`
  - `validated`
  - `stdout_log`
  - `stderr_log`
  - `runtime_json`
  - `created_at`
- 新 retry 只能采用以下两种方式之一：
  - 为新 attempt 建独立子目录，并保留旧 attempt 全部文件
  - 继续使用共享目录，但所有状态文件必须 append-only 且带 `attempt_id`
- 禁止把旧 attempt 的 `step5` 产物与新 attempt 的 `step2` 状态混写成“同一次运行进度”
- 顶层 `section3_step1..section3_step6` 与 bridge 内部 `step3_major`、`step4_immune`、`step5_stroma` 不是同一套编号；对外汇报时必须同时说明：
  - 当前顶层 step
  - 当前 bridge stage
- 任何 `resume` / `continue` 只能从最近一个成功且未失效的 checkpoint 恢复
- 若要让已完成 checkpoint 失效，必须在 `section3_checkpoint_manifest.tsv` 中写明：
  - `invalidated_reason`
  - 触发时间
  - 触发人或触发脚本
  - 受影响的下游 step 范围
- 若 Step 6 因调色板、图例、caption、source data 或其他图件/QC 问题失败，而 `atlas_after_step5.h5ad` 与 Step 5 方法表已完整：
  - 只允许从 Step 6 重跑
  - 不得回退重跑 Step 2 / Step 3 / Step 4 / Step 5
- 若 Step 5 已完成但随后重新从 Step 2 开始，必须先在过程文档中写明 checkpoint 失效原因；否则视为 `ERROR:illegal_rewind_after_step5`
- 本 Section 明确禁止 `start_job`；默认只允许前台执行并持续汇报 step、日志进展与分析判断
- 若 agent 或宿主仍擅自创建后台 job，必须立刻记为 `deviates_from_skill:start_job_forbidden`
- 即使历史上已出现后台 job，也不得把它描述成符合本 skill 的正式执行方式
- 前台执行时必须额外记录：
  - 前台 `pid`
  - `started_at`
  - `log_path`
  - 停止原因
- 若 foreground 进程被人工停止，必须把状态写成：
  - `stopped_by_operator`
  - 或 `interrupted_foreground_run`
- 正式标签列的可写化不能只在 atlas 初载时做一次；凡是经历过 `write_h5ad()`、`read_h5ad()`、checkpoint 恢复、merge 或 step 内批量回写前，都必须再次执行 `ensure_obs_columns_mutable(...)` 或等价 `categorical -> str`
- 特别是 Step 3 / Step 4 / Step 5 在回写 `Major_CellType`、`Cell_Subtype`、`Annotation_Method`、`Annotation_Method_Detail`、`Subtype_Assignment_Score`、`annotation_confidence` 前，必须先重新检查这些列是否已被 `AnnData.write_h5ad(..., convert_strings_to_categoricals=True)` 或其他流程重新变成 categorical
- 若出现 `Cannot setitem on a Categorical with a new category`，必须记为结构性失败并从最近有效 checkpoint 修复恢复；禁止把它当作普通 runtime 抖动直接整段重跑
- 禁止在前台进程已停止后仍把 job 对外宣称为 durable running
- 对 30 万级 atlas，Step 3 / Step 4 的单个 resolution 长时间运行可能正常；只有在以下条件同时满足时，才允许记为 stall：
  - 进程不存在或 CPU 时间不再增长
  - log 无新增
  - heartbeat 无刷新
  - 输出文件无增长
  - 无进展持续至少 45 分钟
- 禁止为了“恢复得更快”而私自 downsample、跳过剩余 resolution、跳过 bridge 或用旧标签回填当前 attempt

## 稳定加速与资源设置（14 核 CPU）

- 允许的加速只能减少重算、减少线程争抢、减少 cache miss；**不得**改变输入细胞、resolution 网格、阈值、标签规则、输出 schema 或上游/下游流程边界
- 结合当前实现，主要耗时点是：
  - Step 2 `infercnvpy` 的 CNV 计算
  - Step 3 / Step 4 的 subset graph 准备、各 resolution 的 Leiden / marker / bridge / metrics
  - bridge 结果缓存命中前的首轮 R bridge 运行
- 推荐的 14 核稳定 preset：
  - `cnv_n_jobs=10` 起步；内存稳定时可上调到 `12`
  - `NUMBA_NUM_THREADS=14`
  - `OMP_NUM_THREADS=1`
  - `OPENBLAS_NUM_THREADS=1`
  - `MKL_NUM_THREADS=1`
  - `NUMEXPR_NUM_THREADS=1`
  - `VECLIB_MAXIMUM_THREADS=1`（若环境支持）
- Step 3 / Step 4 在“固定 subset、固定 HVG/PCA/neighbors 参数不变”的前提下，允许一次性生成 graph-ready checkpoint，然后对每个 resolution 只重跑：
  - `Leiden`
  - `rank_genes_groups`
  - cluster export
  - R bridge / fallback 判定
  - resolution metrics
- 当前 bridge 路径的稳定提速优先级应为：
  - 先命中 content-hash cache
  - 再命中 micro checkpoint / per-resolution resume
  - 最后才考虑增加线程或 worker
- 默认禁止同机并行跑多个 resolution、多个 major group 或多个 bridge stage 去“吃满 14 核”；在该流程中，**单 active context + 正确线程设置 + 细粒度 checkpoint** 通常比多进程并发更稳
- 一旦以下任一项变化，相关 checkpoint / cache 必须失效重建：
  - subset 输入细胞集合
  - HVG / PCA / neighbors 参数
  - `stage_config`
  - `label_projection`
  - gene set / marker 源
  - 线程 / backend 改到会影响数值轨迹的程度
- 禁止为了提速而：
  - 缩减 resolution 网格
  - 下采样细胞
  - 跳过 `rank_genes_groups`
  - 复用不同参数下的 graph / bridge 输出
  - 在 bridge 有效输出后额外调用 `CellTypist`

### 每一步都必须留下可读的过程文档

- Step 1 -> Step 6 每步至少输出 1 份人类可读过程文档，推荐目录：

```text
work/annotation/process_docs/
├── section3_step1_summary.md
├── section3_step2_summary.md
├── section3_step3_summary.md
├── section3_step4_summary.md
├── section3_step5_summary.md
└── section3_step6_summary.md
```

- 每份 `section3_step*_summary.md` 至少记录：
  - 输入对象与来源 checkpoint
  - 本步实际执行的计算
  - 关键参数或 resolution 网格
  - 选中的结果
  - 输出文件路径
  - fallback / cache_hit / skipped / blocked 原因
  - 是否为 resume
  - 下一步入口
- 未写 summary 文档的 step，不得记为 `completed`

### 分辨率级过程文档与 bridge 留痕

- Step 3 每个 `major_res_<resolution>` 目录都必须在运行前先写 `bridge_stage_config.json`
- Step 3 每个 `major_res_<resolution>` 目录在运行后至少保留：
  - `bridge_runtime.json`
  - `bridge_stdout.log`
  - `bridge_stderr.log`
  - `cluster_means.tsv`
  - `cluster_markers.tsv`
  - `cluster_meta.tsv`
  - `scores_raw.tsv`
  - `evidence_raw.tsv`
  - `projection_raw.tsv`
- 若 stage 依赖 `stage_config` / `label_projection` / gene-set snapshot，目录内还必须保留：
  - `bridge_stage_config.json`
  - `label_projection_snapshot.tsv` 或可追溯到其 sha256 的 manifest 记录
- Step 4 / Step 5 每个 `<major_group>_res_<resolution>` 目录同样必须保留上述过程文档
- `bridge_runtime.json` 至少记录：
  - `run_id`
  - `attempt_id`
  - `job_id`
  - `stage`
  - `context`
  - `started_at`
  - `ended_at`
  - `exit_code`
  - `cache_hit`
  - `stage_dir`
- `work/annotation/scmarkeragent_bridge_process.tsv` 必须 append-only，且至少记录每个 stage / context 的：
  - `attempt_id`
  - `status`
  - `cache_hit`
  - `stage_dir`
  - `error`
- 每个 bridge stage 在以下节点都必须同步写 `scmarkeragent_bridge_checkpoint_manifest.tsv`：
  - bridge 输入快照就绪
  - bridge 原始输出落盘
  - bridge 输出 schema 校验完成
  - cache hit / cache invalidate 判定完成

## 本地资源

本 Section 默认读取以下本地资源：

- `assets/scmarkeragent_db_human.RDS`
- `assets/scmarkeragent_bridge_config.json`
- `assets/scmarkeragent_label_projection.tsv`
- `assets/immune_subtype_markers.tsv`
- `assets/stroma_subtype_markers.xlsx`
- `assets/stroma_subtype_markers.tsv`
- `assets/Immune_All_Low.pkl`
- `assets/PanglaoDB_makers.tsv`
- `assets/Cell_marker_Seq.xlsx`
- `assets/gencode.v44.gene_positions.tsv.gz`
- `assets/gencode.v44.annotation.gtf.gz`

### 手工 marker 读取约束

- `stroma_subtype_markers.xlsx` 优先于 `stroma_subtype_markers.tsv`
- 若二者同时存在，必须在日志与 QC 中显式记录：
  - 最终读取路径
  - 行数
  - 文件 sha256
- 若用户显式要求禁用手工 marker，必须通过配置项或明确参数控制
- 不允许仅凭“某个表看起来像空文件”自行推断另一份表也应被忽略

## 正式标签体系

### TopLevel_Compartment

允许值：

- `Immune`
- `Stroma`
- `Epithelial_or_Unknown`

### Major_CellType

允许值：

- `Tumor_cells`
- `Normal_Epithelial`
- `T_cell`
- `B_cell`
- `NK_cell`
- `Myeloid`
- `DC`
- `Mast`
- `Fibroblast`
- `Endothelial`
- `Pericyte`
- `Unknown_Immune`
- `Unknown_Stroma`
- `Epithelial_or_Unknown`

### Cell_Subtype

- 正式 `Cell_Subtype` 只能写 canonical label
- raw label 只能进入辅助列
- `Tumor_cells` / `Normal_Epithelial` 若无正式 subtype 字典，则二次聚类结果只能写入辅助列：
  - `IntraMajor_Subcluster`
  - `IntraMajor_Subcluster_Raw`
  - `IntraMajor_Subcluster_Method`
  - `IntraMajor_Subcluster_Score`

## Step 1：全局 coarse clustering 与 compartment 粗分

本步骤必须在全局 atlas 上执行。

### 必须完成的计算

- 使用真实全局 atlas 进行 coarse clustering，或显式复用 Section 2 的全局 coarse cluster
- 无论采用哪种方式，都必须在 QC 中说明 cluster 来源
- 对 coarse cluster 执行 `rank_genes_groups`
- 使用 `curated_genes + PanglaoDB + CellMarker` 构建 compartment gene set
- 基于 marker overlap 与弱启发式规则，将 coarse cluster 映射为：
  - `Immune`
  - `Stroma`
  - `Epithelial_or_Unknown`

### 必需 micro checkpoint

- `work/annotation/checkpoints/step1/step1_00_input_validated.h5ad`
  - atlas 载入、输入 schema 校验、正式标签列 mutable 修复完成后立即写出
- `work/annotation/checkpoints/step1/step1_01_coarse_graph_ready.h5ad`
  - coarse clustering / graph 准备完成后写出
- `work/annotation/checkpoints/step1/step1_02_coarse_markers_ready.tsv.gz`
  - `rank_genes_groups` 与 cluster marker 导出完成后写出
- `work/annotation/checkpoints/step1/step1_03_compartment_written.h5ad`
  - `TopLevel_Compartment` 正式写回后写出
- `work/annotation/checkpoints/atlas_after_step1.h5ad`
  - Step 1 里程碑 checkpoint

### 最低输出

- `work/annotation/top_level_compartment_method.tsv`
- `work/annotation/top_level_cluster_mapping.tsv`
- `work/annotation/top_level_cluster_markers.tsv`

## Step 2：Epithelial_or_Unknown 的 CNV 鉴瘤

本步骤必须从 Step 1 的 `Epithelial_or_Unknown` 子集独立执行。

### 必须完成的计算

- 使用 `infercnvpy`
- 使用本地 `gencode.v44.gene_positions.tsv.gz`
- 为每个细胞计算 `CNV_Score`
- 首选 `GMM` 作为阈值策略
- 若 `GMM` 不稳定，可退到中位数或经过审计的固定阈值
- 将高 CNV 细胞写为 `Tumor_cells`
- 将低 CNV 细胞写为 `Normal_Epithelial`

### 必需 micro checkpoint

- `work/annotation/checkpoints/step2/step2_00_epi_subset_ready.h5ad`
  - `Epithelial_or_Unknown` 子集固定后写出
- `work/annotation/checkpoints/step2/step2_01_gene_order_ready.json`
  - 基因位置表读取、基因顺序对齐、输入完整性校验完成后写出
- `work/annotation/checkpoints/step2/step2_02_cnv_scores_ready.tsv`
  - `CNV_Score` 计算完成后写出
- `work/annotation/checkpoints/step2/step2_03_threshold_ready.tsv`
  - `GMM` / median 阈值选择完成后写出
- `work/annotation/checkpoints/step2/step2_04_epi_labels_written.h5ad`
  - `Tumor_cells / Normal_Epithelial` 写回 `Major_CellType` 后写出
- `work/annotation/checkpoints/atlas_after_step2.h5ad`
  - Step 2 里程碑 checkpoint

### 最低输出

- `work/annotation/epithelial_cnv_scores.tsv`
- `work/annotation/epithelial_cnv_threshold.tsv`
- `work/annotation/epithelial_cnv_method.tsv`
- `work/annotation/epithelial_cnv_source_data.tsv`

### 失败约束

若 CNV 失败：

- 必须立即终止后续正式注释
- 必须输出 `ERROR:cnv_blocked`
- 不允许跳过 CNV 后继续 major/subtype 注释
- 不允许把 `Epithelial_or_Unknown` 直接并回 immune/stroma

## Step 3：全局 major class 真实多分辨率搜索

本步骤的目标是在全局 atlas 上找到最适合 major 识别的 resolution。

### 搜索范围

默认候选网格至少包括：

- `0.2`
- `0.4`
- `0.6`
- `0.8`
- `1.0`
- `1.2`

若最佳值落在边界，必须向边界外扩一轮。

### 每个候选 resolution 都必须真实执行

- 在固定 `Immune + Stroma` 子集、固定 HVG/PCA/neighbors 参数不变的前提下，允许先一次性完成：
  - `HVG -> PCA -> neighbors -> UMAP(optional)`
  - 并把结果写为 `work/annotation/checkpoints/step3/step3_01_major_graph_ready.h5ad`
- 对每个候选 resolution，至少必须真实执行：
  - `Leiden`
  - `rank_genes_groups`
  - 导出 `cluster_means.tsv.gz`
  - 导出 `cluster_markers.tsv`
  - 调用 R bridge
  - 计算并记录：
  - `label_coverage`
  - `unresolved_frac`
  - `mean_top1_score`
  - `mean_delta_to_top2`
  - `marker_label_match_score`
  - `separation_score`
  - `tiny_cluster_frac`
  - `over_fragmentation_penalty`
- 对每个 `major_res_<resolution>`，至少还必须定义以下 micro checkpoint：
  - `00_leiden_done.tsv`
  - `01_markers_ready.tsv`
  - `02_bridge_inputs_ready.json`
  - `03_bridge_outputs_validated.json`
  - `04_metrics_ready.tsv`
- 只有当该 resolution 的 `04_metrics_ready.tsv` 已存在，且对应 manifest / process / bridge manifest 三者一致时，该 resolution 才能在 resume 时视为已完成

### Step 3 过程留痕要求

- 每个候选 resolution 在开始计算前都必须先创建对应 stage 目录
- Step 3 开始时必须先写：
  - `work/annotation/checkpoints/step3/step3_00_major_subset_ready.h5ad`
  - `work/annotation/checkpoints/step3/step3_01_major_graph_ready.h5ad`
- 每个候选 resolution 完成后，都必须在 `scmarkeragent_bridge_process.tsv` 写入独立记录
- `major_resolution_search.tsv` 只能汇总本 attempt 真实执行过的 resolution，不得混入旧 attempt 的缓存结果，除非 manifest 中明确写明 `reused=True`
- `section3_step3_summary.md` 必须逐项列出：
  - 已测试 resolution
  - 每档核心指标
  - 最终 selected resolution
  - 若中断，停在哪一档

### 选择规则

- 优先选择 major 覆盖率更高的一档
- coverage 接近时，优先选择 `delta` 更高、分离度更好的一档
- 若高 resolution 仅带来大量极小 cluster 而没有提高匹配度，应降级选择更稳健的一档
- 只跑单个 resolution 却输出搜索表，视为 `ERROR:major_resolution_search_failed`
- 禁止事后合成 `major_resolution_search.tsv`

### 最低输出

- `work/annotation/step3_scmarkeragent_major_scores.tsv`
- `work/annotation/step3_scmarkeragent_major_evidence.tsv`
- `work/annotation/major_resolution_search.tsv`
- `work/annotation/major_celltype_method.tsv`
- `work/annotation/major_celltype_method_merged.tsv`
- `work/annotation/major_celltype_cluster_markers.tsv`

## Step 4：按 major celltype 分开做 subtype 搜索

本步骤必须按 `Major_CellType` 分开执行，禁止 pooled immune / pooled stroma。

### 必须单独建模的群体

- `T_cell`
- `B_cell`
- `NK_cell`
- `Myeloid`
- `DC`
- `Mast`
- `Fibroblast`
- `Endothelial`
- `Pericyte`
- `Tumor_cells`
- `Normal_Epithelial`

若某 group 细胞数低于最小阈值：

- 允许 `skipped`
- 但必须输出真实 `skipped` 状态的方法表
- 不允许假装该 group 完成了 subtype 搜索

### 每个 major group 的候选 resolution

默认至少包括：

- `0.2`
- `0.4`
- `0.6`
- `0.8`
- `1.0`
- `1.2`
- `1.5`

### 每个候选 resolution 必须真实执行

- 对每个 `major_group`，允许先一次性完成：
  - subset 固定
  - `HVG -> PCA -> neighbors -> UMAP(optional)`
  - 并写出该 group 的 graph-ready checkpoint
- 对每个候选 resolution，至少必须真实执行：
  - `Leiden`
  - `rank_genes_groups`
  - 导出 cluster mean / cluster marker
  - 生成 annotation candidates（bridge 输出或经审计的 fallback 判定）
  - 计算 subgroup coverage、score、delta、分离度、碎裂情况
- 每个 `<major_group>_res_<resolution>` 至少要有以下 micro checkpoint：
  - `00_leiden_done.tsv`
  - `01_markers_ready.tsv`
  - `02_annotation_candidates_ready.json`
  - `03_assignment_ready.tsv`
  - `04_metrics_ready.tsv`
- 每个 `major_group` 还必须额外有：
  - `<major_group>/step4_<major_group>_00_subset_ready.h5ad`
  - `<major_group>/step4_<major_group>_01_graph_ready.h5ad`
  - `<major_group>/step4_<major_group>_05_label_map_written.tsv.gz`

### Step 4 过程留痕要求

- 每个 `major_group` 都必须有自己独立的过程文档与 resolution 搜索记录
- `section3_step4_summary.md` 必须显式列出每个 group 的：
  - `selected_resolution`
  - `status`
  - `resume_from`
  - `skipped_reason`
- 若某个 group 已完成并有有效 checkpoint，后续 retry 不得因其他 group 失败而清空该 group 的已完成记录

### subtype 判定优先级

#### Immune 相关群体

- `Manual`
- `R_ScType_scMarkerAgent`
- `Unknown`

#### Stroma 相关群体

- `Manual`
- `R_ScType_scMarkerAgent`
- `Auto_PanglaoDB`
- `Auto_CellMarker2.0`
- `Unknown`

#### Tumor / Normal epithelial

- `R_ScType_scMarkerAgent`
- `Marker-supported descriptive subcluster`
- `Unknown`

## R bridge 与 CellTypist 的互斥规则

### R bridge 有效输出的定义

同时满足以下条件时，视为“R bridge 有效输出”：

- `scores_raw.tsv` 存在
- `evidence_raw.tsv` 存在
- 输出字段完整，schema 合法
- `evidence_raw.tsv` 行数与 cluster 数一致
- 至少 1 个 cluster 的 `top1_score` 为有限值

### 互斥规则

- 只要 R bridge 已产生有效输出，就必须停止调用 `CellTypist`
- 即使 R bridge 结果中仍存在 unresolved cluster，也不得再用 `CellTypist` 补齐
- 这些 unresolved cluster 必须保留为：
  - `Unknown_Immune`
  - 或 `Unknown_Stroma`

### 仅允许调用 CellTypist 的情况

只有在以下情况下，才允许进入 `CellTypist` fallback：

- R bridge 运行失败
- R bridge 输出文件缺失
- R bridge 输出 schema 非法
- R bridge 输出完全为空，且经 QC 判定为无有效候选

一旦进入 `CellTypist` fallback，必须在方法表、日志与 QC 中明确记录原因。

## Step 5：全局标签回写

本步骤负责统一回写以下正式字段：

- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Annotation_Method`
- `Annotation_Method_Detail`
- `Subtype_Assignment_Score`
- `annotation_confidence`
- `CNV_Score`

### 最低输出

- `work/atlas/merged_section3_annotated.h5ad`
- `work/atlas/global_cell_subtype_labels.tsv.gz`
- `work/atlas/global_subtype_dictionary.tsv`
- `work/annotation/checkpoints/atlas_after_step5.h5ad`

### 必需 micro checkpoint

- `work/annotation/checkpoints/step5/step5_00_global_label_table_ready.tsv.gz`
  - 全局标签表汇总完成后写出
- `work/annotation/checkpoints/step5/step5_01_dictionary_ready.tsv`
  - subtype 字典与方法表合并完成后写出
- `work/annotation/checkpoints/step5/step5_02_prewrite_validated.h5ad`
  - 正式标签列 mutable 校验与写回前一致性检查完成后写出
- `work/annotation/checkpoints/step5/step5_03_global_labels_written.h5ad`
  - 全局标签正式写入 atlas 后写出
- `work/annotation/checkpoints/atlas_after_step5.h5ad`
  - Step 5 里程碑 checkpoint

### Step 5 完成后的恢复约束

- 一旦 `atlas_after_step5.h5ad` 与本步 summary 文档已写出，Step 5 必须视为可恢复完成态
- 之后若仅在 Step 6 出现图件或 QC 报错，必须从 Step 6 恢复，不得重新执行 Step 2 / Step 3 / Step 4 / Step 5
- 若确需推翻 Step 5，必须在 checkpoint manifest 与 `section3_step5_summary.md` 中同步写明失效原因

## Step 6：只做质检，不做补齐

本步骤只能用于质检，不得用于“补完合同”。

### 允许做的事

- 检查文件是否完整
- 检查表格字段是否完整
- 检查是否真实执行了多次 resolution 搜索
- 检查是否按每个 major group 单独建模
- 检查是否存在不合规的 CellTypist fallback
- 检查图件、caption、source data 是否齐全
- 输出 pass/fail 质检结果
- 输出问题清单与阻断项

### 明确禁止

- 生成假的 resolution search 表
- 用已有标签 carry-forward 回填方法表
- 依据现有 `Cell_Subtype` 再反推 subgroup 表
- 重新命名或覆写正式 `Annotation_Method`
- 补画缺失图并冒充上游已执行
- 任何形式的：
  - `contract finalize`
  - `lightweight finalize`
  - `synthetic table generation`
  - `auto repair and mark completed`

### Step 6 失败后的恢复约束

- Step 6 失败只能新增失败记录，不得回写篡改 Step 1 -> Step 5 的完成状态
- Step 6 若因缺失 palette label、caption 字段、source data 字段或图例映射而失败：
  - 必须记为 `section3_step6 failed`
  - 必须保留 `section3_step5 completed`
  - 必须从 Step 6 单独修复
- 禁止把 Step 6 的失败解释成“整个 Section 3 从头失效”，除非 checkpoint manifest 已明确宣告上游数据失效

### 最低 QC 输出

- `work/qc/section3_qc_report.tsv`
- `work/qc/section3_qc_report.md`
- `work/qc/section3_issue_list.tsv`

### 必需 micro checkpoint

- `work/annotation/checkpoints/step6/step6_00_qc_inventory_ready.tsv`
  - QC 输入文件清点完成后写出
- `work/annotation/checkpoints/step6/step6_01_qc_rules_evaluated.tsv`
  - QC 规则逐项判定完成后写出
- `work/annotation/checkpoints/step6/step6_02_figure_contract_checked.tsv`
  - 图件 / caption / source data 合同检查完成后写出
- `work/annotation/checkpoints/step6/step6_03_issue_register_written.tsv`
  - 问题清单与阻断项落盘后写出

### QC 至少检查以下问题

- 是否真实测试了多个 resolution
- 是否存在 pooled immune / pooled stroma 注释
- 是否每个 major group 都单独建模
- 是否在 R bridge 有效输出后仍调用了 CellTypist
- 是否存在 synthetic / carry-forward / finalize 产物
- 是否每张图都交付了 legend、caption、source data
- 是否图件标题、表格 provenance、日志三者一致

## 图件交付合同

最终必须交付：

### 1. 全局总图

- `work/figures/section3/Global_Major_UMAP.pdf`
- `work/figures/section3/Global_Major_UMAP.png`
- `work/figures/section3/Global_Major_UMAP_source_data.tsv`
- `work/figures/section3/Global_Major_UMAP_caption.md`

要求：

- 展示全局 atlas
- 用 `Major_CellType` 着色
- 标题中写明 `selected_resolution`
- 图中有清晰图例
- caption 说明：
  - selected resolution
  - unknown / unresolved 状态
  - 数据来源
  - 颜色与群体对应关系

### 2. 每个 major celltype 的独立图

对每个 `Major_CellType` 单独输出：

- `work/figures/section3/subgroups/<major_group>_Subtype_UMAP.pdf`
- `work/figures/section3/subgroups/<major_group>_Subtype_UMAP.png`
- `work/figures/section3/subgroups/<major_group>_Subtype_UMAP_source_data.tsv`
- `work/figures/section3/subgroups/<major_group>_Subtype_UMAP_caption.md`

要求：

- 只包含该 `major_group` 的细胞
- 标题中写明 `<major_group>` 与 `selected_resolution`
- 图中有清晰图例
- caption 说明：
  - 使用的方法
  - 是否发生 fallback
  - 是否存在 unknown / skipped / merged
  - source data 字段说明

### 3. source data 最低字段

每张图的 source data 至少包含：

- `cell_id`
- `dataset_id`
- `UMAP1`
- `UMAP2`
- `cluster_id`
- `display_label`
- `color_label`

## 明确禁止

- 只跑 1 个 resolution 却声称完成自动搜索
- 使用 pooled immune / pooled stroma 代替 per-major subtype 分析
- 在 Step 6 事后补齐正式方法表、merge 表、resolution search 表
- 生成 synthetic resolution 指标
- 用旧 attempt 的产物覆盖新 attempt 的过程状态
- 用 bridge 内部 `step5_stroma` 冒充顶层 `section3_step5`
- 用 `pending_host_ack` 冒充“后台 durable job 已正常接管”
- 用已停止的 foreground 进程冒充“仍在后台运行”
- 在未写 checkpoint manifest、step summary、process_index 轨迹的情况下宣称支持 resume
- 在 Step 6 失败后把 Step 5 降回未完成，或直接从 Step 2 重跑而不给失效理由

## 关键输出清单

| 项 | 路径 |
|---|---|
| Step checkpoint | `work/annotation/checkpoints/atlas_after_step{1..5}.h5ad` |
| Substep checkpoint 根目录 | `work/annotation/checkpoints/step{1..6}/` |
| checkpoint 清单 | `work/annotation/checkpoints/section3_checkpoint_manifest.tsv` |
| 全局过程索引 | `work/process_index.tsv` |
| bridge 过程索引 | `work/annotation/scmarkeragent_bridge_process.tsv` |
| bridge checkpoint 清单 | `work/annotation/scmarkeragent_bridge_checkpoint_manifest.tsv` |
| Step 过程文档 | `work/annotation/process_docs/section3_step{1..6}_summary.md` |
| Step 3 bridge 目录 | `work/annotation/scmarkeragent_bridge/step3_major/major_res_<resolution>/` |
| Step 4 bridge 目录 | `work/annotation/scmarkeragent_bridge/step4_immune/<major_group>_res_<resolution>/` |
| Step 5 bridge 目录 | `work/annotation/scmarkeragent_bridge/step5_stroma/<major_group>_res_<resolution>/` |
| 全局 atlas 输出 | `work/atlas/merged_section3_annotated.h5ad` |
| 全局标签文件 | `work/atlas/global_cell_subtype_labels.tsv.gz` |
| subtype 字典 | `work/atlas/global_subtype_dictionary.tsv` |
| Step 6 QC 报告 | `work/qc/section3_qc_report.tsv` |
| Step 6 QC 说明 | `work/qc/section3_qc_report.md` |
| Step 6 问题清单 | `work/qc/section3_issue_list.tsv` |

## 完成检查

- [ ] Step 1 -> Step 5 里程碑 checkpoint 已输出，且 `section3_checkpoint_manifest.tsv` 可追溯到 `run_id` / `attempt_id` / `job_id`
- [ ] Step 1 -> Step 6 的 micro checkpoint 已覆盖所有耗时子阶段；不存在“整步只留 1 个 checkpoint”的空档
- [ ] `work/process_index.tsv` 为 append-only，已记录 Step 1 -> Step 6 的状态迁移、失败和恢复轨迹
- [ ] `section3_step1_summary.md` 到 `section3_step6_summary.md` 已输出
- [ ] Step 3 每个已执行 resolution 都有独立 stage 目录与 bridge 运行文档
- [ ] Step 4 / Step 5 每个已执行 major group 与 resolution 都有独立过程目录
- [ ] `work/annotation/scmarkeragent_bridge_checkpoint_manifest.tsv` 已输出，且与 `scmarkeragent_bridge_process.tsv` / `bridge_runtime.json` 一致
- [ ] 对外汇报时已区分顶层 step 与 bridge 内部 stage，没有把二者混为一步
- [ ] 若发生 retry，旧 attempt 与新 attempt 的轨迹未互相覆盖
- [ ] 本 run 未使用 `start_job`；若出现后台 job，已明确标记为 `deviates_from_skill:start_job_forbidden`
- [ ] 若 foreground 进程被人工停止，状态已写为 `stopped_by_operator` 或 `interrupted_foreground_run`
- [ ] 若 Step 6 失败，Step 5 仍保留 completed，且恢复入口仍指向 Step 6
- [ ] 不存在 synthetic / carry-forward / finalize / illegal rewind 产物
