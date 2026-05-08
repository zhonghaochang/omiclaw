---
name: 03-clustering-annotation
description: Section 3：肿瘤感知聚类注释与标签下放。在全局 Harmony atlas 上执行 top-level compartment 粗分、CNV 肿瘤鉴定、immune/stroma 精细注释、标签回写与审计。
type: reference
---

# Section 3：肿瘤感知聚类注释与标签下放

## 概述

| 项 | 说明 |
|---|---|
| 读入 | Section 2 的 `merged.h5ad`、marker 基因表、各数据集 QC 后 `.h5ad` |
| 处理 | 全局 coarse clustering -> Top-level compartment 粗分 -> Epithelial/Unknown CNV 鉴瘤 -> Immune/Stroma 主类重建 -> immune/stroma 精细亚型注释 -> 标签回写 -> schema/coverage audit |
| 输出 | 带 `TopLevel_Compartment` / `Major_CellType` / `Cell_Subtype` 标签的独立 `.h5ad`、方法来源表、CNV 诊断表、连续分数摘要、coverage audit |

**前置依赖**：Section 2 完成

## Skill 内置本地资源

本 Section 默认直接读取下列随 skill 提供的本地资源：

- `assets/immune_subtype_markers.tsv`
  - 固定两列：`celltype`、`geneset`
  - 当前允许为空表；空表表示“人工 marker 尚未提供”，但流程仍必须成功读取并进入 fallback
- `assets/stroma_subtype_markers.xlsx`
  - Step 5 的人工基质亚型 marker 主表，优先读取该 `xlsx`
  - 至少包含 `celltype`、`geneset` 两列；允许附带额外证据列
  - 若 `xlsx` 暂时不存在，允许兼容读取历史占位表 `assets/stroma_subtype_markers.tsv`
  - 当前允许为空表；空表表示“人工 marker 尚未提供”，但流程仍必须成功读取并进入 fallback
- `assets/Immune_All_Low.pkl`
  - `CellTypist` fallback 默认模型
- `assets/gencode.v44.gene_positions.tsv.gz`
  - strict 默认 CNV 基因位置表
  - 推荐直接 merge 到 `adata.var` 生成 `chromosome`、`start`、`end`
- `assets/gencode.v44.annotation.gtf.gz`
  - CNV 基因位置表的上游 GTF 源文件
  - 若直接用它驱动 `infercnvpy.io.genomic_position_from_gtf(...)`，环境必须具备 `gtfparse`
- `assets/PanglaoDB_makers.tsv`
  - PanglaoDB来源的细胞亚群特征基因表，作为之后`PanglaoDB`知识库的调用文件
- `assets/Cell_marker_Seq.xlsx`
  - CellMarker2.0来源的细胞亚群特征基因表，作为之后`CellMarker2.0`知识库的调用文件

## 优先级与兼容原则

- Section 2 中关于 `Harmony(full data)`、真实 `Leiden global_cluster`、checkpoint/resume、full-data 禁止下采样等工程约束继续保留，且必须先满足后再进入本 Section。
- `raw_label` / `cellType` / `cluster` / 其他 metadata 只允许作为辅助证据或知识映射输入，不得替代 Section 2 的真实 `global_cluster`，更不得直接冒充最终恶性标签或细粒度亚型。
- 如果命令中要求调用或结合知识库进行基因表撰写，必须调用`assets/PanglaoDB_makers.tsv`作为之后`PanglaoDB`知识库的参考文件，调用`assets/Cell_marker_Seq.xlsx`作为之后`CellMarker2.0`知识库的参考文件

## 本 Section 的执行裁决规则

以下规则用于强制保证 Section 3 按 skill 原样执行，不允许“近似完成”：

- 本 Section 必须严格按 Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6 的顺序执行；不得跳步、并步、合并成单次 marker 打分后直接回写
- 任一步未执行、被简化、被替代、或缺最低输出时，本 Section 只能记为 `failed` 或 `blocked`，不得记为 `completed`
- 任何脚本若采用“全 atlas marker score + `idxmax` 强制命名”作为 Section 3 主路径，而未真实执行 Step 1-5 指定方法，则视为 `ERROR: section3_method_deviation`
- 任何脚本若把 `raw_label`、`cellType`、`cluster` 直接覆盖成 `Tumor_cells`、`Major_CellType` 或 `Cell_Subtype`，视为 `ERROR: metadata_shortcut_forbidden`
- `annotation_coverage_audit.tsv` 中 non-null 为 `1.0`、`unresolved_frac = 0` 只能说明“字段被填上了值”，**不能**单独作为 Section 3 通过依据
- `resume`/`continue`/`finalize` 脚本只允许补做本 Section 已真实执行但未落盘的产物；不得为未执行的方法步骤补写占位文件后冒充完成
- **禁止**自行以任何形式生成基因集进行判定，若无法判定的情况下，强制使用`PanglaoDB`和`CellMarker2.0`作为基因集打分参考
- 若日志、脚本、产物三者互相矛盾，按更严格解释处理，并直接阻断

## 本 Section 的工程硬门禁与恢复要求

- 任一连续分数列、program score、marker score 在写入 `adata.obs` 前，必须先完成 sparse/dense 一维化，得到长度严格等于 `adata.n_obs` 的 1D 向量；推荐封装为 `ensure_obs_vector_1d(...)`
- 若待写入对象仍为稀疏列向量、`shape=(n_obs, 1)` 的二维对象、list-of-lists、或长度与 `adata.n_obs` 不一致，必须立即 `failed`，错误码建议写为 `ERROR: obs_vector_not_1d`
- 任一正式标签列在写入前，必须统一执行 `ensure_obs_columns_mutable(...)` 或等价逻辑，将 categorical 列转换为可写字符串列；至少覆盖：
  - `TopLevel_Compartment`
  - `Major_CellType`
  - `Cell_Subtype`
  - `Annotation_Method`
  - `Annotation_Method_Detail`
- 若因 categorical 列不能写入新类别而失败，必须记为真实结构失败并写入 `process_index.tsv`；**禁止**在局部热修脚本里静默绕过
- Step 3 / Step 4 / Step 5 的 subset 预处理默认优先使用 `cell_ranger` HVG；若触发 duplicated bins / `Bin edges must be unique`，允许审计化 fallback 到 `seurat`
- 上述 HVG fallback 必须至少记录：
  - `step`
  - `subset_name`
  - `n_obs`
  - `n_vars`
  - `original_error`
  - `fallback_flavor`
  - `fallback_batch_key`
- 发生 duplicated bins 时，**禁止**通过 `sketch`、`subsample`、`downsample`、只保留部分 cluster、或其他缩减输入的方式规避；允许 fallback，但不允许下采样
- Step 1 -> Step 5 每步完成后都必须落可复用 checkpoint，推荐目录：

```text
work/annotation/checkpoints/
├── atlas_after_step1.h5ad
├── atlas_after_step2.h5ad
├── atlas_after_step3.h5ad
├── atlas_after_step4.h5ad
├── atlas_after_step5.h5ad
└── section3_checkpoint_manifest.tsv
```

- `section3_checkpoint_manifest.tsv` 至少记录：`step`、`checkpoint_path`、`n_obs`、`n_vars`、`reused`、`invalidated_reason`、`created_at`
- `work/process_index.tsv` 在本 Section 中必须至少为每个 Step 记录一行状态迁移；推荐最少字段：
  - `section`
  - `step`
  - `status`
  - `started_at`
  - `ended_at`
  - `checkpoint_path`
  - `resume_from`
  - `error_code`
- 任一步失败后，只允许从“最近一个成功 checkpoint”恢复；**禁止**跳过失败 Step 直接补写下游产物后宣称 Section 3 完成

## 规范标签层级

本 Section 要求显式维护以下 3 层标签：

1. `TopLevel_Compartment`
   - 取值限制：`Immune`、`Stroma`、`Epithelial_or_Unknown`
   - 作用：Step 1 的全局粗分结果，是后续 subset 的入口
2. `Major_CellType`
   - 取值示例：`Tumor_cells`、`Normal_Epithelial`、`T_cell`、`B_cell`、`NK_cell`、`Myeloid`、`DC`、`Mast`、`Fibroblast`、`Endothelial`、`Pericyte`、`Unknown_Immune`、`Unknown_Stroma`
   - 作用：Step 2 与 Step 3 之后的主要细胞身份
3. `Cell_Subtype`
   - 作用：Step 4 与 Step 5 生成的细粒度功能状态标签

若下游代码仍需兼容旧字段习惯，可新增辅助列如 `Legacy_Major_Group` 映射到 `T_NK` / `Myeloid_DC` 等旧分组，但 **不得反向覆盖** 正式 `Major_CellType`。

## 主流程：6 步肿瘤感知注释

### Step 1：全局大类自动粗分

在 `merged.h5ad` 的全局 Harmony atlas 上执行中低分辨率聚类，并对 `global_cluster` 计算差异基因。

- `global_cluster` 必须来自 Section 2 的真实 Leiden 结果，不得使用 metadata partition 冒充
- 若 Section 2 的 `global_cluster` 分辨率偏高，不适合 top-level compartment 粗分，可在同一 atlas 上额外派生：
  - `global_cluster_coarse`
  - 或 `top_level_cluster`
- 建议起点：`sc.tl.leiden(..., resolution=0.5)`；允许在 `0.4-0.8` 内小幅调参，但必须在日志中记录
- 无论是否派生 coarse key，都必须保留原始 `global_cluster`
- 必须对用于粗分判定的 cluster key 计算差异基因，如 `sc.tl.rank_genes_groups`
- 必须结合知识库进行 coarse mapping：
  - `PanglaoDB`
  - `CellMarker2.0`
- 目标是把 **全部细胞** 强制归入 3 个 Top-level compartment：
  - `Immune`
  - `Stroma`
    -一般包含`Fibroblast`、`Endothelial cell`、`Pericyte`等非免疫细胞及上皮细胞的组织细胞
  - `Epithelial_or_Unknown`
- 允许使用 marker、数据库返回结果、已有 metadata 作为辅助证据，但最终粗分标签必须写成结构化方法记录，不能只留在日志里
- **禁止**跳过 cluster-level 粗分，直接在全体细胞上按 marker score 最大值生成 `TopLevel_Compartment`
- **禁止**用“已有 `Major_CellType` / `Cell_Subtype`”反推 Step 1 已完成
- 若未使用真实 `global_cluster` 或未生成 cluster-level 方法表，Step 1 必须判为失败

最低输出：
- `work/annotation/top_level_compartment_method.tsv`: 记录聚类结果和方法
- Step 1 全局 coarse UMAP 所需 source data
- 若上述输出不完全，则强行终止并返回'error: Step1 output'

### Step 2：基于 CNV 的肿瘤细胞精准鉴定

从 Step 1 的 `TopLevel_Compartment == "Epithelial_or_Unknown"` 细胞中提取子集，形成独立对象后执行 CNV 评估。

- 工具要求：必须使用 `infercnvpy`
- 依赖要求：不使用 BioMart ，必须使用本地 GTF / 基因位置表
- strict 默认本地参考：`assets/gencode.v44.gene_positions.tsv.gz`
- 参考调用形式：
  1. 先将基因位置表 merge 到 `adata.var`，补齐 `chromosome`、`start`、`end`
  2. 再调用 `infercnvpy.tl.infercnv(...)`
- `assets/gencode.v44.annotation.gtf.gz` 仅作为重建 `gene_positions.tsv.gz` 的本地源文件；若直接使用 GTF，必须确认 `gtfparse` 已安装
- 必须为每个细胞计算 `CNV_Score`
- 标签划分优先级：
  1. 高斯混合模型 `GMM`
  2. 若 `GMM` 不稳定或样本量过小，可退到中位数或经过审计的固定阈值
- 高 CNV 得分细胞标记为 `Tumor_cells`
- 低 CNV 得分细胞标记为 `Normal_Epithelial`
- 在将 `Tumor_cells` / `Normal_Epithelial` 回写到 `Major_CellType` 前，必须先对正式标签列执行 `ensure_obs_columns_mutable(...)` 或等价的 `categorical -> str` 标准化
- 不能因为 CNV 没做出来，就把 `Epithelial_or_Unknown` 细胞整体并回 immune/stroma 大类
- 若 inferCNV 环节失败，必须显式输出 `cnv_blocked` 审计，并直接终止运行，返回'error: cnv blocked'
- **禁止**用 marker score、metadata 覆盖、或把 `Tumor_cells` 写成默认桶，来冒充 Step 2 已完成
- 若 `cnv_diagnostics.tsv` 为 `blocked`，则本 Section 的最终状态必须是 `blocked` 或 `failed`，绝不允许继续写 `annotation completed`

最低输出：
- `work/annotation/epithelial_cnv_scores.tsv`: 记录每个聚类的CNV
- `work/annotation/epithelial_cnv_threshold.tsv`: 采取的阈值
- 若上述输出不完全，则强行终止并返回 'error: Step2 output'

### Step 3：核心舱室剥离与主类精注释

将 Step 1 得到的 `Immune` 与 `Stroma` 细胞一同 subset，重新计算高变基因、PCA、UMAP，并结合知识库识别主要类群。

- 必须重新执行：`HVG -> PCA -> neighbors -> UMAP`
- 必须调用以下作为知识库辅助：
  - `PanglaoDB`
  - `CellMarker2.0`
- 至少要显式区分以下 major classes：
  - `T_cell`
  - `B_cell`
  - `NK_cell`
  - `Myeloid`
  - `DC`
  - `Fibroblast`
- 允许并鼓励继续解析：
  - `Mast`
  - `Endothelial`
  - `Pericyte`
  - `Unknown_Immune`
  - `Unknown_Stroma`
- Step 3 的输出是 **正式 `Major_CellType` 的主体来源**
- **禁止**把 Step 3 简化为“沿用全 atlas score 最大值”
- **禁止**跳过 immune/stroma subset 重建，直接在全 atlas 上给所有细胞赋 `Major_CellType`
- **禁止**把 Step 1 或 metadata 产生的粗标签直接冒充 Step 3 的正式 `Major_CellType`
- 特异性强化规则：背景表达扣除：
  - 为了避免多个 Cluster 因为共享基础基质基因而被重复注释为同一类：
    1. 在计算特定 Subtype的 Z-score 之前，必须首先计算该 Marker 基因集在所有基质细胞中的平均表达背景（Background Expression）。
    2. 只有当某 Cluster 的 Marker 表达量显著高于整个基质大群的平均水平时，才能贡献正向得分。如果某个基因在几乎所有的 Cluster 中都高表达，必须降低该基因在计算 Z-score 时的权重，寻找只在特定 Cluster 中表达的稀有特异性基因。
- 亚群注释分配规则升级：全局竞争与次优降级：
  - 在进行人工 Marker (Manual Marker) 匹配时，必须废弃“各个 Cluster 独立取最高分”的简单逻辑，改用以下综合评估机制：
    1. 计算全矩阵得分：计算每个 Cluster 对每种 Subtype 的 Z-score。设定次优阈值 (Delta Z)：对于任意一个 Cluster，如果其排名第一的 Subtype 得分与排名第二的 Subtype 得分差距极其微小（Delta Z < 0.5），说明该 Cluster 处于模糊地带。
    2. 全局排他性降级 (Global Exclusion)：如果在整个数据集中，已经有其他 Cluster 以极高的绝对优势认领了该类群，比较两者的rank2的Delta Z，对于具有模糊地带的Delta Z更小的 Cluster，请强制采纳其排名第二的 Subtype 作为最终注释，并在 method_detail 中标记为 manual_runner_up_assigned。若Delta Z更小的Cluster没有模糊地带，则才也标记为该Subtype。
    3. 若排名第二的Subtype也有其他 Cluster 以极高的绝对优势认领了该类群，则重复以上过程进行对比
    - 目标：最大化字典中 Subtype 的覆盖率，压制单一强信号 Subtype 的全局霸榜。
- 最终清理：同源 Cluster 自动融合机制：
  - 在完成上述所有注释和次优降级后，如果依然存在多个 Cluster 被赋予了完全相同的 selected_subtype：
    - 必须将这些具有相同 Subtype 标签的 Cluster 进行合并（Merge）。
    - 在最终输出的 UMAP 图和特征矩阵中，不再保留原始的细碎 Cluster 编号，而是直接以 Subtype_Name作为一个完整的统一大群（Meta-cluster）进行下游的细胞比例计算和生存分析。

#### Step 3 长时运行裁决规则

- 当 `Immune + Stroma` 子集达到大 atlas 量级时，Step 3 的 `HVG -> PCA -> neighbors -> UMAP -> Leiden -> marker` 本来就可能持续很久：
  - 若 `major_subset_cells >= 150000`，允许 Step 3 的单个长步骤持续数十分钟到数小时
  - 若 `major_subset_cells >= 200000`，`UMAP done` 之后继续等待 `Leiden` 与 marker 写出 90 分钟以上仍然可能是正常现象
- **禁止**仅因为“前台执行窗口太长”“运行超过十几分钟”“刚好一段时间没新消息”就把 Step 3 判为 `blocked`
- 若满足任一真实进展信号，必须继续运行或继续监控，不得中断后重试：
  - `run_pipeline.log` 有新增行
  - 进程仍存活且 CPU 时间继续增长
  - job heartbeat 继续刷新
  - 相关输出文件大小继续增长
  - 已完成 `UMAP`，但 `Leiden` / marker / method table 仍在后续计算中
- 只有同时满足以下条件，才允许把 Step 3 记为 runtime stall：
  1. 已检查进程状态、日志、输出目录
  2. 明确没有新的进展信号
  3. 无进展持续至少 45 分钟
  4. 或者进程已报错退出
- 本 skill / 本 Section 明确禁止 `start_job`；Section 3 只允许以前台方式执行并持续汇报进展，**不得**把“需要 durable 后台运行”当作前提条件
- **禁止**为了“避免运行太久”而私自加入 cluster-level 采样、限额 marker 统计、downsample、或其他 Section 3 references 未授权的提速捷径
- **禁止**使用类似“current foreground execution window”这类未在 skill 中定义的自造理由提前终止 Step 3

最低输出：
- `work/annotation/major_celltype_method.tsv`：每个聚类注释所用的方法
- `work/annotation/major_celltype_cluster_markers.tsv`：每个聚类所用的基因集（若有）
- Step 3 major-class UMAP 所需 source data
- 若上述输出不完全，则强行终止并返回 'error: Step3 output'

### Step 4：免疫细胞亚群细分

将 `T_cell`、`B_cell`、`NK_cell`、`Myeloid`、`DC`、`Mast` subset 为 `immune_subset`，重新进行高分辨率聚类与亚型注释。

- 必须重新执行：`HVG -> PCA -> neighbors -> UMAP -> high-resolution Leiden`
- 必须读取人工 marker 表：`assets/immune_subtype_markers.tsv`
- 表头固定为 `celltype`、`geneset`
- 若该表仅含表头、无数据行，视为“当前无人工 marker 可用”，但不能报缺文件错误，必须继续进入 fallback
- 混合注释优先级：
  1. `Manual`
  2. `Auto_CellTypist`
  3. `Unknown`
- 若人工 marker 存在且富集显著，如 `z-score > 1.5`，该亚群直接采纳`assets/immune_subtype_markers.tsv`人工标签
- 若人工 marker 无法判定或为空，必须 fallback 到 `CellTypist`
  - 默认本地模型：`assets/Immune_All_Low.pkl`
- 若仍无法判定，标记为未知免疫细胞，并输出 Top5 marker 基因
- 任一 `score_gene_sets` / continuous score / model score 在写回 `immune_subset.obs` 前，必须先通过 sparse/dense 一维化与长度断言；不得把二维对象或稀疏列直接写入 `obs`
- 在将 `Cell_Subtype`、`Annotation_Method`、`Annotation_Method_Detail` 回写到 `immune_subset.obs` 或全局 atlas 前，必须先执行 `ensure_obs_columns_mutable(...)`
- 不允许使用人工标签以外的自定义基因集定义
- 空 marker 表只表示 `Manual` 不可用，**绝不表示**可以直接退回脚本内置固定 marker 集并宣布完成
- 若 `CellTypist` 模型缺失、加载失败或未实际调用，Step 4 必须 `failed` / `blocked`
- **禁止**把 `T_cell/NK_cell/B_cell/Myeloid/DC` 的 subtype 通过单次 `idxmax` 或固定 if/else 写死后冒充为高分辨率亚群注释
- 特异性强化规则：背景表达扣除：
  - 为了避免多个 Cluster 因为共享基础基质基因而被重复注释为同一类：
    1. 在计算特定 Subtype的 Z-score 之前，必须首先计算该 Marker 基因集在所有基质细胞中的平均表达背景（Background Expression）。
    2. 只有当某 Cluster 的 Marker 表达量显著高于整个基质大群的平均水平时，才能贡献正向得分。如果某个基因在几乎所有的 Cluster 中都高表达，必须降低该基因在计算 Z-score 时的权重，寻找只在特定 Cluster 中表达的稀有特异性基因。
- 亚群注释分配规则升级：全局竞争与次优降级：
  - 在进行人工 Marker (Manual Marker) 匹配时，必须废弃“各个 Cluster 独立取最高分”的简单逻辑，改用以下综合评估机制：
    1. 计算全矩阵得分：计算每个 Cluster 对每种 Subtype 的 Z-score。设定次优阈值 (Delta Z)：对于任意一个 Cluster，如果其排名第一的 Subtype 得分与排名第二的 Subtype 得分差距极其微小（Delta Z < 0.5），说明该 Cluster 处于模糊地带。
    2. 全局排他性降级 (Global Exclusion)：如果在整个数据集中，已经有其他 Cluster 以极高的绝对优势认领了该类群，比较两者的rank2的Delta Z，对于具有模糊地带的Delta Z更小的 Cluster，请强制采纳其排名第二的 Subtype 作为最终注释，并在 method_detail 中标记为 manual_runner_up_assigned。若Delta Z更小的Cluster没有模糊地带，则才也标记为该Subtype。
    3. 若排名第二的Subtype也有其他 Cluster 以极高的绝对优势认领了该类群，则重复以上过程进行对比
    - 目标：最大化字典中 Subtype 的覆盖率，压制单一强信号 Subtype 的全局霸榜。
- 最终清理：同源 Cluster 自动融合机制：
  - 在完成上述所有注释和次优降级后，如果依然存在多个 Cluster 被赋予了完全相同的 selected_subtype：
    - 必须将这些具有相同 Subtype 标签的 Cluster 进行合并（Merge）。
    - 在最终输出的 UMAP 图和特征矩阵中，不再保留原始的细碎 Cluster 编号，而是直接以 Subtype_Name作为一个完整的统一大群（Meta-cluster）进行下游的细胞比例计算和生存分析。

最低输出：
- `work/annotation/immune_subtype_method.tsv`：每个聚类注释所用的方法
- `work/annotation/immune_subtype_method_merged.tsv`：融合后聚类注释所用的方法
- `work/annotation/immune_cluster_markers.tsv`：每个聚类所用的基因集（若有）
- Step 4 immune subset UMAP 所需 source data
- 若上述输出不完全，则强行终止并返回 'error: Step4 output'

### Step 5：基质细胞亚群细分

将 `Fibroblast`、`Endothelial`、`Pericyte` subset 为 `stroma_subset`，重新进行高分辨率聚类与亚型注释。

- 必须重新执行：`HVG -> PCA -> neighbors -> UMAP -> high-resolution Leiden`
- 必须优先读取人工 marker 表：`assets/stroma_subtype_markers.xlsx`
- 若 `xlsx` 不存在，允许兼容读取历史占位表：`assets/stroma_subtype_markers.tsv`
- 表头固定为 `celltype`、`geneset`
- 若该表仅含表头、无数据行，视为“当前无人工 marker 可用”，但不能报缺文件错误，必须继续进入 fallback
- 混合注释优先级：
  1. `Manual`
  2. `Auto_PanglaoDB`
  3. `Auto_CellMarker2.0`
  3. `Auto_Paper`
  4. `Unknown`
- 若某亚群人工 marker 富集显著，如 `z-score > 1.5`，该亚群直接采纳人工标签
- 若某亚群人工 marker 无法判定，必须使用 `PanglaoDB` 和  `CellMarker2.0` 作为细胞亚群基因集参考，进行标签的富集评分，选取最佳项作为注释
- 若数据库证据仍不足，允许基于 Top10 marker 基因检索 PubMed 等核心文献推断类群
- 若进入 `Auto_Paper`，方法表中必须附带：
  - `PMID`
  - `citation_short`
  - 推荐格式：`FirstAuthor+Year+JournalAbbrev`
- 若仍不能稳定判定，则标记为 `Unknown_Stroma`
- 任一 `score_gene_sets` / continuous score / enrichment score 在写回 `stroma_subset.obs` 前，必须先通过 sparse/dense 一维化与长度断言；不得把二维对象或稀疏列直接写入 `obs`
- 若 Step 5 的 `cell_ranger` HVG 因 duplicated bins 失败，允许审计化 fallback 到 `seurat`，但必须记录 fallback 审计；**禁止**为规避该错误缩减 `stroma_subset`
- 在将 `Cell_Subtype`、`Annotation_Method`、`Annotation_Method_Detail` 回写到 `stroma_subset.obs` 或全局 atlas 前，必须先执行 `ensure_obs_columns_mutable(...)`
- 空 marker 表只表示 `Manual` 不可用，**绝不表示**可以直接退回内置 fibro marker 集并宣布 Step 5 已完成
- 若 `PanglaoDB`或 `CellMarker2.0` / 文献 fallback 实际未执行，则 Step 5 不得记为完成
- **禁止**把 `Fibroblast/Endothelial/Pericyte` 的亚型通过固定规则或单次 `idxmax` 硬写后冒充 Step 5 完成
- 特异性强化规则：背景表达扣除：
  - 为了避免多个 Cluster 因为共享基础基质基因而被重复注释为同一类：
    1. 在计算特定 Subtype的 Z-score 之前，必须首先计算该 Marker 基因集在所有基质细胞中的平均表达背景（Background Expression）。
    2. 只有当某 Cluster 的 Marker 表达量显著高于整个基质大群的平均水平时，才能贡献正向得分。如果某个基因在几乎所有的 Cluster 中都高表达，必须降低该基因在计算 Z-score 时的权重，寻找只在特定 Cluster 中表达的稀有特异性基因。
- 亚群注释分配规则升级：全局竞争与次优降级：
  - 在进行人工 Marker (Manual Marker) 匹配时，必须废弃“各个 Cluster 独立取最高分”的简单逻辑，改用以下综合评估机制：
    1. 计算全矩阵得分：计算每个 Cluster 对每种 Subtype 的 Z-score。设定次优阈值 (Delta Z)：对于任意一个 Cluster，如果其排名第一的 Subtype 得分与排名第二的 Subtype 得分差距极其微小（Delta Z < 0.5），说明该 Cluster 处于模糊地带。
    2. 全局排他性降级 (Global Exclusion)：如果在整个数据集中，已经有其他 Cluster 以极高的绝对优势认领了该类群，比较两者的rank2的Delta Z，对于具有模糊地带的Delta Z更小的 Cluster，请强制采纳其排名第二的 Subtype 作为最终注释，并在 method_detail 中标记为 manual_runner_up_assigned。若Delta Z更小的Cluster没有模糊地带，则才也标记为该Subtype。
    3. 若排名第二的Subtype也有其他 Cluster 以极高的绝对优势认领了该类群，则重复以上过程进行对比
    - 目标：最大化字典中 Subtype 的覆盖率，压制单一强信号 Subtype 的全局霸榜。
- 最终清理：同源 Cluster 自动融合机制：
  - 在完成上述所有注释和次优降级后，如果依然存在多个 Cluster 被赋予了完全相同的 selected_subtype：
    - 必须将这些具有相同 Subtype 标签的 Cluster 进行合并（Merge）。
    - 在最终输出的 UMAP 图和特征矩阵中，不再保留原始的细碎 Cluster 编号，而是直接以 Subtype_Name作为一个完整的统一大群（Meta-cluster）进行下游的细胞比例计算和生存分析。


最低输出：
- `work/annotation/stroma_subtype_method.tsv`：每个聚类注释所用的方法
- `work/annotation/stroma_subtype_method_merged.tsv`：融合后聚类注释所用的方法
- `work/annotation/stroma_cluster_markers.tsv`：每个聚类所用的基因集（若有）
- Step 5 stroma subset UMAP 所需 source data
- 若上述输出不完全，则强行终止并返回 'error: Step5 output'


### Step 6：全局标签拼合与下放

将 Step 2 的肿瘤/上皮标签与 Step 4、Step 5 的精细亚型重新汇回全局 `merged.h5ad`，并按原始数据集拆分下放。

- 必须回填到全局对象的正式字段：
  - `TopLevel_Compartment`
  - `Major_CellType`
  - `Cell_Subtype`
- 建议同步保留：
  - `Annotation_Method`
  - `Annotation_Method_Detail`
  - `CNV_Score`
  - `annotation_confidence`
- merge 前必须先执行 schema normalization：
  - 历史别名列必须统一到正式列名
  - 旧的 `_x` / `_y` 后缀列必须先重命名、隔离或删除
  - 必须先输出或更新 `schema_repair_audit.tsv`
- 标签回写必须基于 `cell_id + dataset_id`
- 防泄漏拆分必须基于：
  - `dataset_id`
  - `cell_id` / barcode
- 不得在 split-down 阶段重新按名称模糊匹配细胞
- merge 后必须再次强制扫描 `_x` / `_y` 冲突列；若正式标签字段出现双份冲突版本，必须立即 `failed`
- merge 前后都必须对正式标签列执行 `ensure_obs_columns_mutable(...)`，然后才允许 `fillna(...)`、新类别写入或默认值回填
- Step 6 只是拼合与下放，**不得**回头替代 Step 1-5 的方法学执行
- 若上游 Step 1-5 任一步未通过，Step 6 不允许单独把 annotation 状态写成完成

正式输出：
- 带高置信度标签的独立数据集 `.h5ad`
- `work/atlas/global_cell_subtype_labels.tsv.gz`
- `work/atlas/global_subtype_dictionary.tsv`

## Fig_S2 的 focal compartment 约定

- 本 skill 的正式 focal compartment 固定为 `Fibroblast`
- `Fig_S2_Global_UMAP` 的第三个 panel 必须依赖 Fibroblast 二层亚型标签，而不是全体细胞统一 `Cell_Subtype`
- 正式 panel 3 使用全局 atlas 的同一 UMAP 坐标：
  - Fibroblast 细胞按 `Cell_Subtype` 着色
  - 非 Fibroblast 细胞统一浅灰显示
- 若 Fibroblast 二层亚型尚未稳定、marker 证据不足或 unresolved 过高，应阻断正式 `Fig_S2` 导出，而不是退回到“全体细胞按 `Cell_Subtype`”

## 缓存注释对象的必备 schema

任一准备用于回写或复用的 annotated `.h5ad` 必须至少包含：

- `cell_id`
- `dataset_id`
- `patient_id`
- `sample_id`
- `TopLevel_Compartment`
- `Major_CellType`
- `Cell_Subtype`

缺任一列时：
1. 先输出 `schema_repair_audit.tsv`
2. 尝试用 manifest / atlas labels 修复
3. 修复失败则阻断，不能直接继续下游

## 缓存修复与 merge hygiene

- 标签回写必须基于 `cell_id + dataset_id`
- Step 6 merge 前必须先规范历史别名列；例如 `cellSubType`、`cellSubtype`、`majorCellType` 等旧字段不得直接流入正式 merge
- merge 后如果出现 `_x` / `_y` 冲突列，必须先标准化并审计
- merge 前允许先重命名历史 `_x` / `_y` 冲突列到 `legacy_*` 或 `normalized_*`，但 merge 完成后正式标签列上不允许再保留任何 `_x` / `_y`
- 若 `_x/_y` 冲突列流到 Section 4 或 Section 5，视为结构失败，不得再靠 late merge 补救
- `TopLevel_Compartment`、`Major_CellType`、`Cell_Subtype`、`CNV_Score`、`Annotation_Method` 不得在 merge 后出现双份冲突版本
- merge 前后都必须执行一次 schema 审计；若进行了 rename / drop / alias normalization，必须写入 `schema_repair_audit.tsv`
- 不允许为了提速对舱室二层聚类设置极低的 `Leiden n_iterations` 或显著偏低的 `neighbors` 参数

## 覆盖率审计规则

- 必须生成 `__annotation_coverage_audit.tsv`
- 必须生成 `__subtype_continuous_scores_summary.tsv`
- 必须生成 `__cluster_markers.tsv`
- 必须生成 `__subtype_marker_scores.tsv`
- 必须生成 top-level / major / subtype 三层标签的 non-null 覆盖率摘要
- `Epithelial_or_Unknown` 进入 CNV 后必须统计：
  - `n_epithelial_unknown_input`
  - `n_tumor_cells`
  - `n_normal_epithelial`
  - `n_cnv_unresolved`
- 如果某 major compartment 存在，但 focal subtype 基本全 unresolved，应写为 `coarse_label_only_or_subclustering_missing`
- 只有二层 sub-clustering 和 continuous scoring 都不支持时，才允许判定 `absent_in_tissue`

## 机制队列的特别规则

### GSE241934_RWC

若满足任一条件，必须标记 `blocked_for_mechanism`：
- `Cell_Subtype` 基本全为 `Unresolved`
- 关键连续分数列整列为空
- mechanism top feature 在该 cohort 几乎全为 `NA`
- 肿瘤/上皮细胞在 CNV 步骤被整体留在 `Epithelial_or_Unknown`

此时允许完成注释审计，但不允许在 Section 7 继续 combined inference。

## 参考实现骨架

```python
import numpy as np
import pandas as pd


def push_labels_back(adata, atlas_labels):
    label_df = atlas_labels[
        [
            "cell_id",
            "dataset_id",
            "TopLevel_Compartment",
            "Major_CellType",
            "Cell_Subtype",
            "Annotation_Method",
            "CNV_Score",
        ]
    ].drop_duplicates()
    adata.obs = adata.obs.merge(
        label_df,
        on=["cell_id", "dataset_id"],
        how="left",
        validate="one_to_one",
    )
    return adata


def ensure_obs_vector_1d(values, n_obs, column_name):
    if hasattr(values, "toarray"):
        values = values.toarray()
    arr = np.asarray(values).reshape(-1)
    if arr.shape[0] != n_obs:
        raise RuntimeError(f"ERROR: obs_vector_not_1d::{column_name}::{arr.shape[0]}!={n_obs}")
    return arr


def ensure_obs_columns_mutable(adata, columns):
    for col in columns:
        if col in adata.obs.columns and pd.api.types.is_categorical_dtype(adata.obs[col]):
            adata.obs[col] = adata.obs[col].astype(str)


def assert_annotation_schema(adata):
    required = {
        "cell_id",
        "dataset_id",
        "patient_id",
        "sample_id",
        "TopLevel_Compartment",
        "Major_CellType",
        "Cell_Subtype",
    }
    missing = sorted(required.difference(adata.obs.columns))
    if missing:
        raise RuntimeError(f"ERROR: annotation_schema_missing::{','.join(missing)}")
```

## 强制作图

| 图名 | 目的 |
|---|---|
| `Fig_S4_annotation_coverage_heatmap` | 展示各数据集关键亚型覆盖率与注释完成度 |
| `Fig_S4b_unresolved_fraction_by_dataset` | 展示各数据集 unresolved 比例，特别标识机制队列 |
| `Fig_S2_Annotation_Companion` | Section 3 肿瘤感知注释的补充图组，内部 panel 对应 Step 1 / 3 / 4 / 5 / 6 ，每个panel都强行进行注释与撰写标题|

注：
- 正式全局三联 `Fig_S2` 归属于 Section 2，但其第三个 Fibroblast panel 依赖本 Section 的二层亚型定义与 marker 证据
- 肿瘤感知注释建议额外交付一个复合补充图 `Fig_S2_Annotation_Companion`，内部 panel 可标作 `a-e`
- 若项目改为单独拆分 `Fig_S2a` 至 `Fig_S2e` 文件，文件名必须避免覆盖 Section 2 已保留的 `Fig_S2b_Harmony_batch_mixing_diagnostic`

每张图都必须同步交付：`pdf`、`png`、`*_source_data.tsv`、`*_caption.md`

## Deliverables

| 交付物 | 路径 |
|---|---|
| 带标签的独立 `.h5ad` | `work/annotation/{dataset_id}/` |
| 全局 subtype 字典 | `work/atlas/global_subtype_dictionary.tsv` |
| 全局标签文件 | `work/atlas/global_cell_subtype_labels.tsv.gz` |
| top-level 方法表 | `work/annotation/top_level_compartment_method.tsv` |
| top-level cluster 映射表 | `work/annotation/top_level_cluster_mapping.tsv` |
| major class 方法表 | `work/annotation/major_celltype_method.tsv` |
| epithelial CNV score | `work/annotation/epithelial_cnv_scores.tsv` |
| epithelial CNV 阈值审计 | `work/annotation/epithelial_cnv_threshold.tsv` |
| epithelial CNV 方法表 | `work/annotation/epithelial_cnv_method.tsv` |
| immune 亚型方法表 | `work/annotation/immune_subtype_method.tsv` |
| stroma 亚型方法表 | `work/annotation/stroma_subtype_method.tsv` |
| cluster markers | `work/annotation/{dataset_id}/{dataset_id}__cluster_markers.tsv` |
| subtype marker scores | `work/annotation/{dataset_id}/{dataset_id}__subtype_marker_scores.tsv` |
| 覆盖率审计 | `work/annotation/{dataset_id}/{dataset_id}__annotation_coverage_audit.tsv` |
| 连续分数摘要 | `work/annotation/{dataset_id}/{dataset_id}__subtype_continuous_scores_summary.tsv` |
| schema 修复审计 | `work/annotation/{dataset_id}/{dataset_id}__schema_repair_audit.tsv` |
| Step checkpoint | `work/annotation/checkpoints/atlas_after_step{1..5}.h5ad` |
| Section 3 checkpoint 清单 | `work/annotation/checkpoints/section3_checkpoint_manifest.tsv` |
| 全局过程索引 | `work/process_index.tsv` |
| Section 3 图包 | `work/figures/supplementary/Fig_S4*` + `Fig_S2_Annotation_Companion*` |

## 完成检查

- [ ] 所有数据集都有 `TopLevel_Compartment`、`Major_CellType` 和 `Cell_Subtype`
- [ ] Step 1 使用的是真实 `global_cluster`，不是 metadata partition
- [ ] Step 2 已对 `Epithelial_or_Unknown` 进行 CNV 肿瘤鉴定；若 `cnv_blocked`，则 Section 3 必须显式 `blocked`，不得记为 `completed`
- [ ] `Tumor_cells` 与 `Normal_Epithelial` 的划分规则已审计
- [ ] Step 3 已重新建立 immune/stroma 主类，而不是沿用旧 metadata
- [ ] cluster markers 与 subtype marker scores 非空
- [ ] annotation coverage audit 已输出
- [ ] subtype continuous scores summary 已输出
- [ ] schema repair audit 已输出或明确标记 `not_needed`
- [ ] Step 1 -> Step 5 checkpoint 已输出，且可用于恢复到最近成功步骤
- [ ] `work/process_index.tsv` 已记录 Step 1 -> Step 6 的状态迁移、失败和恢复轨迹
- [ ] 任一 score 列写回 `obs` 前都经过一维化与长度断言
- [ ] 任一正式标签列写入前都经过 `ensure_obs_columns_mutable(...)` 或等价 `categorical -> str` 标准化
- [ ] 若出现 `cell_ranger` duplicated bins，已记录 `cell_ranger -> seurat` 的 fallback 审计，且未发生下采样
- [ ] `immune_subtype_method.tsv` 与 `stroma_subtype_method.tsv` 已输出
- [ ] Step 6 merge 前后均已完成 schema normalization，且正式标签列不存在 `_x` / `_y` 冲突残留
- [ ] `GSE241934_RWC` 若 unresolved 过高，已显式标记 `blocked_for_mechanism`
- [ ] `Fig_S4`、`Fig_S4b` 与 `Fig_S2_Annotation_Companion` 已生成
- [ ] 本 Section 的脚本、日志、产物三者一致，且不存在“用空表、占位文件或 helper 伪造已执行步骤”的情况
