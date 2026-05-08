---
name: 03b-clustering-annotation-scmarkeragent-sctype
description: Section 3 变体：使用 scMarkerAgent Human 知识库与 ScType(R) 执行 major/immune/stroma 注释，但保持 Section 4-7 所需输出 schema 与 canonical label 完全兼容。
type: reference
---

# Section 3 变体：scMarkerAgent + ScType(R) 注释桥接

## 适用场景

当任务满足以下条件时，允许使用本变体替代默认 `03-clustering-annotation.md`：

- 希望在 Section 3 中引入 `scMarkerAgent` 抽取知识库作为主要 marker 证据来源
- 希望在 `R` 环境中使用 `ScType` 完成 cluster-level 打分与候选标签生成
- 希望 Section 4-7 保持现有 Python 主路径与既有特征/建模合同不变

本文件是 **Section 3 的替代执行规范**，不是默认规范的补丁。

同一 run 中：

- 只能选择默认 `03-clustering-annotation.md`
- 或本变体 `03b-clustering-annotation-scmarkeragent-sctype.md`

二者不得混用。

## 核心结论

本变体只替换 Section 3 中的 **知识库与打分后端**，不改变：

- Step 1 的全局粗分入口
- Step 2 的 `infercnvpy` 肿瘤鉴定
- Step 6 的全局标签回写与下放
- Section 4-7 的输入 schema、canonical label、特征定义与建模合同

因此，本变体的目标不是“把整条流程改成 R”，而是：

```text
Python / AnnData 继续持有正式 atlas 状态
-> R / ScType 只负责 Step 3-5 的 cluster score 与候选标签
-> Python 继续负责 policy、merge、checkpoint、obs 回写与下游兼容
```

## 与 scMarkerAgent 的边界

本项目在本变体中 **只使用** 以下 scMarkerAgent 资产：

- `assets/scmarkeragent_db_human.RDS`

允许复用其知识组织思想，但 **不要求** 复用或依赖以下上游模块：

- `annotate_cells.R`
- `ucell_demo.R`
- `LLM API`
- `Seurat` 主流程
- GitHub 仓库中的完整自动注释 pipeline

换句话说：

- 我们使用的是 **抽取出来的人类知识库**
- 不是把整个 scMarkerAgent 项目搬进 OmiClaw

## 本变体新增本地资源

- `assets/scmarkeragent_db_human.RDS`
  - Human-only 的 scMarkerAgent 原始母库
  - 仅作为 Section 3 变体的上游知识源
  - 不直接作为 Section 4-7 输入
- `assets/scmarkeragent_bridge_config.json`
  - 本变体的正式桥接配置母表
  - 统一约束 R 环境默认路径、tier 过滤、允许标签、接受阈值、fallback 规则与 Step 1 粗分种子
  - 若策略需要调整，应优先修改此文件，而不是在脚本中新增硬编码分支
- `assets/scmarkeragent_label_projection.tsv`
  - 本变体的 raw label -> canonical label 投影表
  - Python 与 R 必须共用这一份投影规则
  - 不允许在 Python/R 中维护第二套并行映射逻辑

现有资源继续保留：

- `assets/immune_subtype_markers.tsv`
- `assets/stroma_subtype_markers.xlsx`
- `assets/stroma_subtype_markers.tsv`
- `assets/Immune_All_Low.pkl`
- `assets/PanglaoDB_makers.tsv`
- `assets/Cell_marker_Seq.xlsx`

## 运行环境要求

本变体要求额外存在一个可调用的 `R` 环境，且至少具备：

- `Rscript`
- `Seurat` 或等价矩阵读取工具
- `ScType` 所需依赖
- 读取 `RDS` 的基础能力

正式建议：

- Python 主流程继续使用 OmiClaw 当前 `omiclaw` 环境
- R 注释桥接单独使用独立 conda / system R 环境
- 本项目当前已准备好的默认桥接环境是：
  - `/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-bridge`
- 若需要更接近 scMarkerAgent 上游的 Seurat/UCell 兼容栈，可选：
  - `/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite`
- Python 调用 R 时，默认必须使用 bridge 环境，不得自行切到其他未知 R 环境
- 推荐调用形式：

```bash
source /root/miniconda3/etc/profile.d/conda.sh
conda run -p /vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-bridge Rscript <script.R> ...
```

- `omiclaw-r-upstream-lite` 仅用于：
  - 对照 scMarkerAgent 上游脚本
  - 补充验证 Seurat/UCell/BiocParallel 兼容性
  - 临时上游实验
- `omiclaw-r-upstream-lite` 不是本变体的正式默认运行环境

**禁止**让 R 环境接管 Section 3 的正式状态对象所有权；正式状态对象仍然是 `.h5ad`

## 正式执行资产

本变体的正式资产是：

- `assets/scmarkeragent_bridge_config.json`
- `assets/scmarkeragent_label_projection.tsv`

推荐由 Python 主流程统一调度，R 只负责 bridge 阶段，不直接负责正式 `.h5ad` 落盘。

本 skill 不再自带固定 `scripts/` 目录。

若运行时确实需要 helper code：

- 只能生成到 `<run_root>/scripts/`
- 或以内联方式执行
- 不得再把 helper script 固化回 skill 目录

标准调用示例：

```bash
/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw/bin/python \
  <run_root>/scripts/section3_from_s2_scmarkeragent_sctype_run.py \
  --atlas <section2_harmony_atlas.h5ad> \
  --qc-root <qc_root> \
  --skill-dir /vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill \
  --out-root <run_root> \
  --gene-positions /vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/gencode.v44.gene_positions.tsv.gz \
  --r-env-path /vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-bridge \
  --bridge-config /vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/scmarkeragent_bridge_config.json \
  --bridge-projection /vepfs-mlp2/mlp-public/250266/omiclaw/container/skills/成纤维细胞分析skill/assets/scmarkeragent_label_projection.tsv
```

本文件下半部分同时承接实现合同：

- helper script 如何生成
- bridge 输入输出如何约束
- fallback 和错误日志如何落盘
- 首次运行的预编译 / 预缓存如何执行

## 首次运行的预编译与预缓存

本变体要求 OmiClaw 在 **第一次处理该 run 的 03b 路径** 时，先执行一次 cache warmup。

目的：

- 不要在 Step 3 / Step 4 / Step 5 每次都重新全量扫描 `scmarkeragent_db_human.RDS`
- 将“知识库清洗、label 投影、stage gene set 汇总”前移为一次性准备动作
- 为后续 bridge stage 提供可复用的 raw result cache

首次 warmup 至少要完成两层：

1. `compiled cache`
   - 基于 `RDS + config + projection` 生成一次性的知识库编译产物
2. `bridge result cache`
   - 针对每个 stage 的 `cluster_means / cluster_markers / cluster_meta` 生成结果缓存键
   - 若再次运行且输入未变，可直接复用 `scores/evidence/projection_audit`

本变体默认应开启该机制，除非用户明确要求禁用。

### 推荐缓存位置

- `work/annotation/scmarkeragent_cache/`

### 失效原则

以下任一变化都必须使 compiled cache 失效并重建：

- `assets/scmarkeragent_db_human.RDS`
- `assets/scmarkeragent_bridge_config.json`
- `assets/scmarkeragent_label_projection.tsv`

以下任一变化都必须使 stage result cache 失效并重建：

- stage 名称变化
- `cluster_means.tsv.gz` 变化
- `cluster_markers.tsv` 变化
- `cluster_meta.tsv` 变化
- 上游 compiled cache key 变化

## 实现合同与执行细节

### 单一事实来源

本变体的单一事实来源是：

- `assets/scmarkeragent_bridge_config.json`
- `assets/scmarkeragent_label_projection.tsv`
- 本文件

任何 run-local helper script 都只是执行载体，不是额外真理来源。

### Compiled Cache 合同

compiled cache 的目标是把重的知识库准备动作只做一次。

推荐根目录：

- `work/annotation/scmarkeragent_cache/<compiled_cache_key>/`

compiled cache key 必须至少由以下三者的内容哈希组成：

- `assets/scmarkeragent_db_human.RDS`
- `assets/scmarkeragent_bridge_config.json`
- `assets/scmarkeragent_label_projection.tsv`

哈希策略默认取自：

- `scmarkeragent_bridge_config.json -> precompile_cache.hash_strategy`

compiled cache 最低产物：

- `compiled_cache_manifest.json`
- `_CACHE_READY`
- `projected_labels_all_stages.tsv.gz`
- `kb_human_filtered.tsv.gz`
- `stage_gene_sets_step3_major.tsv.gz`
- `stage_gene_sets_step4_immune.tsv.gz`
- `stage_gene_sets_step5_stroma.tsv.gz`

其中：

- `projected_labels_all_stages.tsv.gz`
  - 记录 raw label 在各 stage 下被投影成哪个 canonical label
- `kb_human_filtered.tsv.gz`
  - 记录过滤掉非 Human、病理实体、细胞系等之后的知识库长表
- `stage_gene_sets_*.tsv.gz`
  - 是 bridge 真正应优先读取的 stage-ready gene set

compiled cache manifest 最低字段：

- `compiled_cache_key`
- `created_at`
- `hash_strategy`
- `kb_rds_sha256`
- `bridge_config_sha256`
- `projection_tsv_sha256`
- `compiled_cache_root`
- `projected_labels_path`
- `filtered_kb_path`
- `step3_major_gene_sets_path`
- `step4_immune_gene_sets_path`
- `step5_stroma_gene_sets_path`

### Bridge Result Cache 合同

bridge result cache 的目标是同一个 run 中重复执行同一 stage 时，直接复用 raw result。

推荐根目录：

- `work/annotation/scmarkeragent_cache/<compiled_cache_key>/bridge_result_cache/<stage_cache_key>/`

stage cache key 必须至少由以下内容组成：

- `compiled_cache_key`
- `stage_name`
- `cluster_means.tsv.gz` 内容哈希
- `cluster_markers.tsv` 内容哈希
- `cluster_meta.tsv` 内容哈希

stage result cache 最低产物：

- `scores_raw.tsv`
- `evidence_raw.tsv`
- `projection_raw.tsv`
- `stage_cache_manifest.json`

stage cache 命中规则：

1. `stage_cache_manifest.json` 存在
2. `scores_raw.tsv / evidence_raw.tsv / projection_raw.tsv` 存在
3. manifest 中记录的：
   - `compiled_cache_key`
   - `stage_name`
   - `cluster_means_sha256`
   - `cluster_markers_sha256`
   - `cluster_meta_sha256`
   与当前输入完全一致

命中后：

- 直接复用 raw result
- 不再重新执行知识库扫描和 stage scoring
- 但仍然要写正式的 process / audit / checkpoint 轨迹

cache 生成顺序：

1. 先计算 `compiled_cache_key`
2. 若 compiled cache 缺失或失效：
   - 重新生成 `projected_labels_all_stages.tsv.gz`
   - 重新生成 `kb_human_filtered.tsv.gz`
   - 重新生成各 stage gene set
   - 写 `compiled_cache_manifest.json`
   - 最后写 `_CACHE_READY`
3. 每个 bridge stage 执行前：
   - 先计算 `stage_cache_key`
   - 检查 stage result cache 是否命中
   - 命中则直接复用
   - 未命中则执行 scoring 并回写 cache

### Step 1 实现合同

Python 端必须继续负责全局 coarse mapping。

top-level gene set 的构造规则：

1. 从 `scmarkeragent_bridge_config.json -> step1_compartment.curated_genes` 读取三类种子：
   - `Immune`
   - `Stroma`
   - `Epithelial_or_Unknown`
2. 从 `step1_compartment.keyword_groups` 读取每类关键词
3. 用这些关键词分别在：
   - `assets/PanglaoDB_makers.tsv`
   - `assets/Cell_marker_Seq.xlsx`
   中扩展 gene set
4. gene set 最终只保留 atlas 中存在的基因

cluster 判定规则：

1. 对全局 cluster 做 `rank_genes_groups`
2. 统计 top markers 与三类 gene set 的 overlap
3. 若 overlap 全为 0，使用弱启发式：
   - `KRT* / EPCAM` 优先判为 `Epithelial_or_Unknown`
   - `COL1A1/COL1A2/DCN/LUM/VWF/KDR/RGS5` 明显时优先判为 `Stroma`
   - 否则回落为 `Immune`

### Bridge 输入合同

每个 bridge stage 必须在：

- `work/annotation/scmarkeragent_bridge/<stage>/`

至少写出：

- `cluster_means.tsv.gz`
- `cluster_meta.tsv`
- `cluster_markers.tsv`
- `bridge_config_snapshot.json`
- `label_projection_snapshot.tsv`

其中：

- `cluster_means.tsv.gz`
  - 第一列固定为 `gene_symbol`
  - 其余列为 cluster id
  - 值为 cluster mean expression
- `cluster_meta.tsv`
  - 至少包含 `cluster_id`
  - 可附带 `n_cells`、`top_level_mode`、`major_mode`
- `cluster_markers.tsv`
  - 至少包含 `cluster_id`、`names`

### R Bridge 算法合同

R bridge 必须执行以下逻辑：

1. 校验 config / projection / cluster meta / kb schema
2. 读取 `scmarkeragent_db_human.RDS`
3. 将 raw label 通过 `scmarkeragent_label_projection.tsv` 映射成 stage-specific canonical label
4. 用 `exclude_label_patterns` 去除病理实体、肿瘤实体、细胞系等条目
5. 按 `kb_tiers` 做 tier 选择：
   - 优先 `breast_context`
   - 不足时回退 `human_pan_tissue`
6. 只保留该 stage `allowed_labels` 中允许的 canonical label
7. 按 raw label 汇总 positive / negative gene sets
8. `min_positive_markers` 不满足时丢弃
9. 将 cluster mean matrix 按 gene 做 z-score 标准化
10. 采用 ScType 风格加权：
   - positive genes 用 inverse-frequency 权重
   - negative genes 作为惩罚项扣除
11. 输出 canonical candidate ranking 和 top1/top2 evidence

若某 stage 没有可用 gene set：

- 不允许直接报错退出
- 必须继续输出空的 `scores_raw.tsv`
- 必须为每个 cluster 输出一行空 `evidence_raw.tsv`
- `top1_projection_rule` 固定写 `unmapped`

### Python 回收合同

Python 端必须继续负责：

- stage-specific acceptance / rejection
- manual marker 优先级
- fallback
- `Subtype_Assignment_Score`
- `annotation_confidence`
- 正式 `.h5ad`
- 正式 `process_index.tsv`
- 正式 `section3_checkpoint_manifest.tsv`

Step 3：

1. 先做 `Immune + Stroma` subset clustering
2. 调 bridge 取 `top1_score / delta / kb_filter_tier`
3. 只有满足 config 中 `min_score / min_delta` 才接受
4. 若不满足，按 `fallback_by_top_level`：
   - `Immune -> Unknown_Immune`
   - `Stroma -> Unknown_Stroma`

Step 4：

1. `Manual`
2. `R_ScType_scMarkerAgent`
3. `Auto_CellTypist`
4. `Unknown`

细节：

- `Manual` 接受阈值来自 `manual_accept_score`
- bridge 未通过时才允许走 `CellTypist`
- `CellTypist` 输出必须再次通过 `scmarkeragent_label_projection.tsv` 投影到 canonical immune subtype

Step 5：

1. `Manual`
2. `R_ScType_scMarkerAgent`
3. `Auto_PanglaoDB`
4. `Auto_CellMarker2.0`
5. `Unknown`

细节：

- `Manual` 继续保留 background-adjusted scoring 思路
- bridge 未通过时，fallback keyword 只能来自 `scmarkeragent_bridge_config.json -> stages.step5_stroma`
- 正式 subtype 必须收敛到：
  - `myoCAF`
  - `iCAF`
  - `apCAF`
  - `Endothelial`
  - `Pericyte`
  - `Mesothelial_like`
  - `Unknown_Stroma`

### 置信度合同

bridge-derived confidence 只能由 config 驱动：

- `confidence_base`
- `confidence_score_weight`
- `confidence_delta_weight`
- `confidence_pan_tissue_penalty`
- `pan_tissue_min_score_increment`

不允许在实现脚本里再写平行的常量表。

## 输出兼容总原则

本变体必须保证以下正式列与默认 Section 3 完全兼容：

- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`
- `Annotation_Method`
- `Annotation_Method_Detail`
- `Subtype_Assignment_Score`
- `annotation_confidence`

Section 4-7 只能依赖这些正式列与现有 `.h5ad`/TSV 产物，不得反向依赖：

- R 会话对象
- Seurat 对象
- scMarkerAgent 仓库脚本
- scMarkerAgent 原始 label 名称

## Canonical Label 合同

为保证 Section 4 特征工程无需改写，本变体输出标签时必须投影到既有 canonical label。

### Major_CellType 允许值

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

### 免疫 Cell_Subtype 最终允许值

- `CD4_helper`
- `Treg`
- `TCF7_CD8`
- `Cytotoxic_CD8`
- `Exhausted_CD8`
- `NKcyto`
- `NKrest`
- `mregDC`
- `cDC1`
- `cDC2`
- `M1_like`
- `M2_like`
- `Mast_activated`
- `B_cell`
- `Unknown_Immune`

### 基质 Cell_Subtype 最终允许值

- `myoCAF`
- `iCAF`
- `apCAF`
- `Endothelial`
- `Pericyte`
- `Mesothelial_like`
- `Unknown_Stroma`

### Raw label 与 canonical label 分离

R / ScType / scMarkerAgent 原始命名允许保留，但只能写入辅助字段，例如：

- `Cell_Subtype_Raw`
- `Cell_Subtype_Source_Label`
- `Cell_Subtype_KB_Tier`

**不得**让 raw label 直接替代正式 `Cell_Subtype`

## 知识库过滤原则

`scmarkeragent_db_human.RDS` 是母库，不是直接可用的 subtype 表。

进入 ScType 前，必须先做过滤与投影：

1. 仅保留 `species == Human`
2. 优先保留与乳腺 / mammary / breast cancer / TNBC 相关的 disease/tissue 上下文
3. 若乳腺上下文不足，允许回退到 Human pan-tissue，但必须降低置信度并记录
4. 去除明显病理实体、肿瘤实体、疾病名本身作为 cell label 的条目
5. 区分 `positive` 与 `negative` marker
6. 将 scMarkerAgent cell label 映射到本 skill 的 canonical label

## Step 1 与 Step 2 不变

### Step 1：全局粗分

仍必须遵守默认 Section 3 的 Step 1：

- 在全局 Harmony atlas 上做 coarse clustering
- 用 Python / Scanpy 计算 cluster marker
- 形成 `TopLevel_Compartment`

本变体允许在 Step 1 的知识证据层引入 scMarkerAgent 生成的 top-level gene sets，  
但 **不能** 跳过原有 cluster-level coarse mapping，也 **不能** 让 R 直接接管全 atlas。

### Step 2：CNV 鉴瘤

完全不变，仍必须使用：

- `infercnvpy`
- 本地 `gene_positions.tsv.gz`
- GMM / median fallback

任何 scMarkerAgent / ScType 分数都 **不能** 代替 CNV 肿瘤判定。

## Step 3：Major class 注释改为 R bridge

### Python 侧职责

Python 继续负责：

- subset：`Immune + Stroma`
- `HVG -> PCA -> neighbors -> UMAP -> Leiden`
- `rank_genes_groups`
- 生成 Step 3 checkpoint
- 导出给 R 的桥接输入

### R 侧职责

R 只负责：

- 从 `scmarkeragent_db_human.RDS` 过滤出用于 major class 的 gene sets
- 用 `ScType` 对 Step 3 cluster 执行打分
- 返回每个 cluster 的候选 major label、runner-up、delta、支持 marker 信息

### 必须输出的桥接文件

- `work/annotation/step3_scmarkeragent_major_scores.tsv`
- `work/annotation/step3_scmarkeragent_major_evidence.tsv`

最低字段建议包含：

- `major_cluster`
- `candidate_label`
- `candidate_rank`
- `score`
- `delta_to_top1`
- `n_positive_markers_used`
- `n_negative_markers_used`
- `source_backend`
- `kb_filter_tier`

### 正式方法表

仍需写正式：

- `work/annotation/major_celltype_method.tsv`
- `work/annotation/major_celltype_cluster_markers.tsv`

但 `method` / `method_detail` 改为能反映新后端，例如：

- `method = R_ScType_scMarkerAgent`
- `method_detail = step3_major_cluster_sctype_with_scmarkeragent_human`

## Step 4：免疫亚型注释改为 Manual -> R bridge -> CellTypist

### 优先级

1. `Manual`
2. `R_ScType_scMarkerAgent`
3. `Auto_CellTypist`
4. `Unknown`

### 说明

- 手工 marker 仍然优先
- 当手工 marker 不足时，允许用 scMarkerAgent + ScType 生成免疫亚型候选
- 仅当 R bridge 仍 unresolved 时，才退回 `CellTypist`

### 重要限制

- 输出 subtype 必须投影到 canonical immune label 集
- 不允许把 scMarkerAgent 的原始 label 直接写为正式 `Cell_Subtype`
- 若 `CellTypist` 被作为最终 fallback，仍需保留原有 `method` 记录

### 必须输出的桥接文件

- `work/annotation/step4_scmarkeragent_immune_scores.tsv`
- `work/annotation/step4_scmarkeragent_immune_evidence.tsv`

### 正式输出保持不变

- `work/annotation/immune_subtype_method.tsv`
- `work/annotation/immune_subtype_method_merged.tsv`
- `work/annotation/immune_cluster_markers.tsv`

## Step 5：基质亚型注释改为 Manual -> R bridge -> KB fallback

### 优先级

1. `Manual`
2. `R_ScType_scMarkerAgent`
3. `Auto_PanglaoDB`
4. `Auto_CellMarker2.0`
5. `Auto_Paper`
6. `Unknown`

### 说明

- 手工 marker 仍保留最高优先级
- scMarkerAgent + ScType 成为主要自动知识后端
- 当 R bridge 输出不足或知识覆盖明显不足时，才退回现有 `PanglaoDB / CellMarker2.0`

### 对下游最重要的要求

无论 raw label 多丰富，正式 `Cell_Subtype` 必须最终折叠到：

- `myoCAF`
- `iCAF`
- `apCAF`
- `Endothelial`
- `Pericyte`
- `Mesothelial_like`
- `Unknown_Stroma`

这样 Section 4 无需改写即可继续兼容现有：

- `mycaf_frac`
- `icaf_frac`
- `apcaf_frac`
- `myoCAF_score`
- `iCAF_score`
- `apCAF_score`

### 必须输出的桥接文件

- `work/annotation/step5_scmarkeragent_stroma_scores.tsv`
- `work/annotation/step5_scmarkeragent_stroma_evidence.tsv`

### 正式输出保持不变

- `work/annotation/stroma_subtype_method.tsv`
- `work/annotation/stroma_subtype_method_merged.tsv`
- `work/annotation/stroma_cluster_markers.tsv`

## Python <-> R 桥接合同

推荐桥接形式：

### Python 导出给 R

- cluster assignment
- cluster marker 表
- cluster mean expression matrix
- cluster meta 表
- var gene symbols
- `dataset_id`
- `TopLevel_Compartment`
- `Major_CellType`（若是 Step 4/5）

### R 回传给 Python

- cluster score matrix
- top1 / top2 label
- delta
- positive/negative marker counts
- raw source label
- canonical projected label
- 置信度建议

### 正式状态对象

正式 `.h5ad` 与 checkpoint 只能由 Python 回写。  
R 不负责最终 `.h5ad` 落盘。

## 背景表达扣除、runner-up 降级、merge 仍由 Python 执行

本变体明确规定：

- ScType 只负责产生 score 与候选标签
- 背景表达扣除规则继续由 Python 主流程执行
- `manual_runner_up_assigned` 风格的全局竞争降级仍由 Python 控制
- cluster merge / meta-cluster 归并仍由 Python 控制

因此，本变体不会把 Section 3 业务规则外包给 ScType。

## Section 4-7 兼容合同

只要本变体满足以下条件，Section 4-7 不需要知道注释后端已经变更：

1. 正式 `.h5ad` 仍由 Python 写出
2. `TopLevel_Compartment / Major_CellType / Cell_Subtype` 列名不变
3. `Cell_Subtype` 使用本文件规定的 canonical label
4. `Annotation_Method` 只作为 provenance，不进入主模型
5. `Subtype_Assignment_Score` 与 `annotation_confidence` 仍为 1D 数值列

若以上任一条件不满足，则不得进入 Section 4。

## 最低产物

除默认 Section 3 产物外，本变体最低还需新增：

- `work/annotation/step3_scmarkeragent_major_scores.tsv`
- `work/annotation/step3_scmarkeragent_major_evidence.tsv`
- `work/annotation/step4_scmarkeragent_immune_scores.tsv`
- `work/annotation/step4_scmarkeragent_immune_evidence.tsv`
- `work/annotation/step5_scmarkeragent_stroma_scores.tsv`
- `work/annotation/step5_scmarkeragent_stroma_evidence.tsv`
- `work/annotation/scmarkeragent_label_projection_audit.tsv`
- `work/annotation/scmarkeragent_bridge_runtime_audit.tsv`
- `work/annotation/scmarkeragent_bridge_checkpoint_manifest.tsv`
- `work/annotation/scmarkeragent_bridge_process.tsv`
- `work/annotation/scmarkeragent_cache/cache_warmup_audit.tsv`

并且每个 bridge stage 还必须保留独立目录：

- `work/annotation/scmarkeragent_bridge/step3_major/`
- `work/annotation/scmarkeragent_bridge/step4_immune/`
- `work/annotation/scmarkeragent_bridge/step5_stroma/`

其中：

- `scmarkeragent_label_projection_audit.tsv` 记录 raw label -> canonical label 的映射
- `scmarkeragent_bridge_runtime_audit.tsv` 记录 R 环境、入口脚本、过滤 tier、是否触发 fallback
- `scmarkeragent_bridge_checkpoint_manifest.tsv` 记录每个 bridge stage 的输入快照、raw 输出、stdout/stderr 与 config/projection snapshot
- `scmarkeragent_bridge_process.tsv` 记录每个 bridge stage 的开始/结束时间、状态与错误码
- `cache_warmup_audit.tsv` 记录 compiled cache 与 stage result cache 的命中、重建与失效原因

每个 `scmarkeragent_bridge/<stage>/` 目录至少应包含：

- `cluster_means.tsv.gz`
- `cluster_meta.tsv`
- `cluster_markers.tsv`
- `scores_raw.tsv`
- `evidence_raw.tsv`
- `projection_raw.tsv`
- `bridge_config_snapshot.json`
- `label_projection_snapshot.tsv`
- `bridge_stdout.log`
- `bridge_stderr.log`

这些文件属于正式中间产物，不是可随意省略的临时缓存。

## 明确错误目录

本变体除了沿用默认 Section 3 的阻断错误外，至少还必须显式支持并记录以下 bridge 级错误：

- `ERROR:bridge_config_missing`
- `ERROR:bridge_config_invalid`
- `ERROR:bridge_config_schema_invalid`
- `ERROR:bridge_projection_missing`
- `ERROR:bridge_projection_schema_invalid`
- `ERROR:bridge_r_script_missing`
- `ERROR:bridge_r_env_missing`
- `ERROR:conda_binary_missing`
- `ERROR:scmarkeragent_human_rds_missing`
- `ERROR:bridge_output_missing`
- `ERROR:bridge_output_schema_invalid`
- `ERROR:cluster_meta_schema_invalid`
- `ERROR:kb_schema_invalid`
- `ERROR:compiled_cache_manifest_missing`
- `ERROR:compiled_cache_incomplete`
- `ERROR:compiled_cache_invalid`
- `ERROR:stage_cache_manifest_missing`
- `ERROR:stage_cache_invalid`
- `ERROR:cache_hash_failed`
- `ERROR:cache_warmup_failed`

要求：

- 所有异常必须继续写入 `work/audit/section3_exception_traceback.log`
- bridge 子阶段异常必须同步写入 `scmarkeragent_bridge_process.tsv` 与 `scmarkeragent_bridge_checkpoint_manifest.tsv`
- 不允许只在终端打印错误而不落盘

## 明确禁止

- 禁止把 `scMarkerAgent` 原始 label 直接当正式 `Cell_Subtype`
- 禁止让 R/Seurat 直接接管 Step 1、Step 2 或 Step 6
- 禁止让 Section 4-7 直接读取 `scmarkeragent_db_human.RDS`
- 禁止让 Section 4-7 依赖 R 会话对象
- 禁止为了接入 ScType 而修改 Section 4-7 的主分析合同
- 禁止把 `scMarkerAgent` GitHub 仓库的 LLM 注释流程当成 OmiClaw 正式依赖

## 实施建议

推荐分三阶段落地：

1. 影子模式：
   - 新后端只产出 `*_scores.tsv` 与 `*_evidence.tsv`
   - 不覆盖正式标签
2. Section 5 先切换到基质亚型：
   - 优先验证 `myoCAF / iCAF / apCAF` 投影是否稳定
3. 再切换 Step 4 immune 与 Step 3 major：
   - 逐步降低对旧 fallback 的依赖

正式替换前，必须确认：

- Section 4 特征工程无须改写
- Section 5 建模输入 schema 不变
- `global_subtype_dictionary.tsv` 中不存在 major/subtype 冲突泛滥
