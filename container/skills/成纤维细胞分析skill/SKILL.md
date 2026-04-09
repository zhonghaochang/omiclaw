---
name: 成纤维细胞分析skill
description: 成纤维细胞/CAF 与免疫治疗应答分析的单一入口 skill。当前版本采用 Harmony-only、全量细胞、可重启 atlas checkpoint、严格阻断、patient-level 主分析和 Nature 风格正式图包。
---

# 成纤维细胞分析 skill

## Overview

这是当前仓库里用于成纤维细胞、CAF、ICB 应答与相关单细胞分析的主 skill。结构按“一个主 SKILL.md + references/ 下的分阶段参考文档”组织。

**核心科学问题：肿瘤微环境中的基线成纤维细胞状态，能否预测免疫检查点阻断（ICB）治疗的应答（R）与非应答（NR）？**

当前正式流程采用：

```text
full-data Harmony with restart-safe checkpoints
-> full-optimization UMAP/Leiden
-> major-celltype + fibro-subtype atlas views
-> annotation pushback
-> per-dataset feature engineering -> strict primary modeling
-> gated attribution -> cohort-aware mechanism validation
```

## Execution Authority

本 skill 的 `references/*.md` 不是“建议性说明”，而是正式执行规范。

- 任何 agent / 脚本 / 续跑 helper **必须逐 Section 满足 references 中的硬要求**，不得自行重写为“更快但不等价”的简化流程
- 不允许把“写出了结果文件”解释为“完成了该 Section”
- 不允许把旧 run 中的脚本、旧逻辑、旧 checkpoint 产物当作新版规范已经落实的证据
- 如果脚本实现、日志、产物与 references 描述不一致，**以 references 为准**，并且该 run 必须判定为 `failed` 或 `blocked`，不得写成 `completed`
- 不允许以“fallback”、“resume”、“fresh script”、“coverage=100%”等表述替代对真实方法执行情况的核验
- 任一 Section 若只完成了部分步骤，或缺失该 Section 明示的最低输出，则该 Section **不得**记为 `completed`

本 skill 的正式分析必须同时满足：
- 主预测模型只使用治疗前基线样本
- 主分析中每位病人有且仅有一行，且 `analysis_unit = patient`
- 全局 atlas 必须使用 QC 后全部细胞；禁止任何 `sketch`、`subsample`、`downsampling`
- 正式整合器只允许 `Harmony`
- atlas 允许中间 checkpoint / cache，但只能用于断点恢复与重试；不得改变输入细胞、参数或最终结果
- `Fig_S2_Global_UMAP` 必须是三联图：`dataset_id`、`Major_CellType`、`Fibroblast Cell_Subtype`
- 路由字段、来源字段、样本/病灶标识符、技术计数代理不得进入 primary model
- 结果必须带正式图包：`pdf + png + source_data + caption + figures/index.tsv + figures/README.md`

## When to Use This Skill

当任务涉及以下任一内容时，直接使用本 skill：
- 成纤维细胞、CAF、iCAF、apCAF、myoCAF、mregDC、NKcyto、TCF7_CD8 等 TME 亚型
- 免疫治疗响应、ICB、checkpoint blockade、R/NR、baseline manifest
- EGAS00001004809、GSE236581、GSE269936、GSE123813、GSE241934
- 单细胞到患者级聚合、跨队列基线预测、机制验证、正式 figure bundle

## Runtime Environment

- 推荐解释器：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw/bin/python`
- 等价路径：`/root/miniconda3/envs/omiclaw/bin/python`
- 当前 shell 默认 `python` 指向 `base`，不应直接用于本流程

推荐激活方式：

```bash
source /root/miniconda3/etc/profile.d/conda.sh
conda activate /vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw
```

绘图与导出默认设置：

```python
import matplotlib
matplotlib.use("Agg")

from matplotlib import rcParams
rcParams["pdf.fonttype"] = 42
rcParams["ps.fonttype"] = 42
```

## Runtime Notes

- 本 skill 的正式整合器是 `harmonypy`，不是 `scVI`、`BBKNN`
- GPU 可以存在，但不是正式流程的前提条件；Harmony 路径按 CPU/内存稳定性优先设计
- 不要假设 `liana` 一定可用；真实通讯分析前必须先验证 import

## Bundled Runtime Assets

以下资源与本 skill 一起提供，Section 3 默认直接读取这些本地文件，而不是运行时临时联网查找：

- `assets/immune_subtype_markers.tsv`
  - 人工免疫亚型 marker 占位表
  - 固定两列：`celltype`、`geneset`
  - 允许暂时为空表，但流程仍必须成功读取；空表表示当前无人工 marker，随后进入 fallback 判定
- `assets/stroma_subtype_markers.xlsx`
  - 人工基质亚型 marker 主表，优先使用该 `xlsx` 版本
  - 至少应包含 `celltype`、`geneset` 两列；允许附带额外说明列
  - 若 `xlsx` 暂时不存在，允许兼容读取历史占位表 `assets/stroma_subtype_markers.tsv`
  - 空表表示当前无人工 marker，随后进入 fallback 判定
- `assets/Immune_All_Low.pkl`
  - `CellTypist` 免疫 fallback 默认模型
  - strict run 中不得仅声明支持 `CellTypist` 而不实际提供模型文件
- `assets/gencode.v44.gene_positions.tsv.gz`
  - strict 默认 CNV 基因位置表
  - 固定字段建议至少包含：`gene_name`、`chromosome`、`start`、`end`
  - 推荐直接 merge 到 `adata.var`，补齐 `chromosome/start/end`
- `assets/gencode.v44.annotation.gtf.gz`
  - CNV 基因位置表的上游来源 GTF
  - 仅在需要重新生成基因位置表时使用；不是 strict 默认运行时入口
  - 若直接走 `infercnvpy.io.genomic_position_from_gtf(...)`，必须确认环境已安装 `gtfparse`
  - 不再允许把 `genomic_position_from_biomart(...)` 当作默认 CNV 基因位置来源

## Available Packages

### Core

| Package | Purpose |
|---|---|
| scanpy | QC、归一化、聚类、打分、可视化 |
| anndata | 单细胞对象 |
| harmonypy | Harmony 批次校正 |
| pandas / numpy / scipy | 表格与统计计算 |

### Single-Cell Utilities

| Package | Purpose |
|---|---|
| scrublet | 双联体检测 |
| celltypist | 辅助转移注释 |
| decoupler | TF / pathway activity |
| pyreadr | 读取 RDS/RData |
| mygene | 基因 ID 到 HGNC Symbol 映射 |

### Visualization

| Package | Purpose |
|---|---|
| matplotlib / seaborn | 正式静态图 |
| plotly | 交互探索图（非正式交付） |

## Sub-Skill Index

开始执行前，**必须先阅读 `references/00-constraints.md`**，然后按 Section 顺序读取对应参考文档。

| 文件 | 名称 | 一句话说明 |
|---|---|---|
| `references/00-constraints.md` | 硬性约束规则 | Harmony-only、全量输入、建模禁区、脚本合规、交付门槛 |
| `references/01-data-infrastructure.md` | Section 1：数据基建与路由 | 原始数据读入、QC、基因名标准化、manifest 路由、patient-level 主分析合同 |
| `references/02-global-atlas.md` | Section 2：全局图谱整合 | 全量 Harmony atlas、UMAP、Leiden、整合诊断 |
| `references/03-clustering-annotation.md` | Section 3：聚类注释与标签下放 | 双层聚类、缓存 schema 修复、标签回写、覆盖率审计 |
| `references/04-feature-engineering.md` | Section 4：特征工程与聚合 | manifest backfill、分层特征、主分析/机制分析拆表 |
| `references/05-modeling.md` | Section 5：主模型与 guardrail | strict design matrix、LODO、敏感性分析、coverage 对账 |
| `references/06-attribution.md` | Section 6：归因与证据等级 | SHAP、消融、拮抗分析、weak_evidence 降级规则 |
| `references/07-mechanism-validation.md` | Section 7：机制验证 | IIT/RWC cohort-aware 验证与 blocked 机制 |
| `references/08-figure-standards.md` | 正式作图标准 | Nature 风格图稿规格、导出格式、图包命名和审计要求 |
| `references/collaboration-and-delivery-contract.md` | 共享协作契约 | 实时汇报、watchdog 边界、图包交付、异常上报 |
| `references/fibro_primary_model_guardrails.py` | 建模 Guardrail 模板 | primary model 的规范 Python 参考实现 |

## Required Reading Order

1. `00-constraints.md`
2. `01-data-infrastructure.md`
3. `02-global-atlas.md`
4. `03-clustering-annotation.md`
5. `04-feature-engineering.md`
6. `05-modeling.md`
7. `06-attribution.md`
8. `07-mechanism-validation.md`
9. `08-figure-standards.md`
10. `collaboration-and-delivery-contract.md`
11. `fibro_primary_model_guardrails.py`

## Recommended Workflow

每个 Section 的详细步骤见对应参考文档。总体流程线性推进，但每一段都采用“通过检查才允许继续”的严格模式。

```text
Section 1（Manifest 与 patient-level 路由）
    ↓ 独立 .h5ad + manifest.tsv / manifest_mechanism.tsv / manifest_all.tsv
Section 2（全量 Harmony atlas + restart-safe checkpoints）
    ↓ merged.h5ad + atlas checkpoints + atlas diagnostics + Fig_S2(dataset / major / fibro) + S2b / S3
Section 3（聚类注释与标签下放）
    ↓ 带 Cell_Subtype / Major_CellType 的独立 .h5ad + coverage audit
Section 4（特征工程）
    ↓ fibro_features.tsv + fibro_features_mechanism.tsv + backfill audit
Section 5（主模型）
    ↓ strict design matrix + LODO + sensitivity + Fig_M1 / M2 / M3
Section 6（归因）
    ↓ SHAP / ablation / bivariate figures + evidence grade
Section 7（机制验证）
    ↓ Fig_M8 或 Fig_M8b + analysis_summary / methods / figure_legend
```

**阶段性完成规则**：每个 Section 完成后，必须检查该 Section 的 Deliverables 与 acceptance checks。任一硬门禁失败，必须立刻阻断并上报，不能以 fallback 文件伪造“完成”状态。

## Collaboration and Delivery

共享协作契约见 `references/collaboration-and-delivery-contract.md`。本 skill 额外必查：
- 启动长任务前必须汇报脚本路径、哈希、preflight/compliance 结果、run 目录洁净度
- 凡是预计超过 60 秒的主流程、watchdog 或重跑任务，优先使用宿主原生 `start_job`；禁止再用 `nohup`、`setsid`、`&` 这类临时后台化方式替代正式作业管理
- 对于 15 万到 30 万细胞级别的 atlas / compartment 子集，聚类、UMAP、Leiden、marker 统计本来就可能持续数十分钟到数小时；**不得仅因运行时间长就擅自判定“stalled”并中断**
- 若 `start_job` 当前接口不可用，但前台脚本仍有真实进展（日志追加、心跳刷新、CPU 持续、输出文件增长），允许在当前 turn 内继续前台监控；这属于受限执行，不属于 blocked
- Manifest 校验后必须汇报主分析病人数、`analysis_unit`、`source_sample_id/source_lesion_id` 完整性
- Atlas 完成后必须汇报 `qc_total_cells`、`atlas_input_cells`、`harmony_embedding_shape`
- 特征完成后必须汇报 `manifest.tsv` 病人数、`fibro_features.tsv` 行数、`design_matrix.tsv.gz` 行数是否完全一致
- 建模完成后必须说明 `primary_feature_audit.tsv` 是否含 forbidden feature
- 机制验证完成后必须明确说明是 `valid` 还是 `blocked`
- 若某 Section 实际执行路径与 skill 规定不一致，必须在中途汇报中直接写明 `deviates_from_skill`，并立即阻断，不得在最终总结里用“完成”“通过”“full PASS”掩盖

## Expected Outputs

- `work/manifest/` — `manifest.tsv`, `manifest_mechanism.tsv`, `manifest_all.tsv`, `manifest_validation_report.tsv`
- `work/audit/` — `script_provenance.md`, `script_compliance_report.tsv`, `run_dir_hygiene_report.tsv`, `run_pipeline.log`
- `work/qc/` — 每数据集 QC 报告
- `work/atlas/` — `merged.h5ad`, `checkpoints/`, `atlas_checkpoint_manifest.tsv`, `global_atlas_integration_diagnostics.tsv`, 全局 UMAP / Dotplot / mixing diagnostics
- `work/annotation/` — 每数据集注释、marker、覆盖率审计、schema repair audit
- `work/features/` — `fibro_features.tsv`, `fibro_features_mechanism.tsv`, `feature_metadata_backfill_audit.tsv`, gate 日志
- `work/communication/` — 真实通讯结果或显式 blocked diagnostics
- `work/modeling/` — `design_matrix.tsv.gz`, `primary_feature_audit.tsv`, `modeling_coverage_report.tsv`, LODO, SHAP, sensitivity
- `work/mechanism/` — `GSE241934_mechanism_features.tsv`, `mechanism_validation_stats.tsv` 或 `mechanism_block_report.tsv`
- `work/figures/` — `main/`, `supplementary/`, `index.tsv`, `README.md`
- `work/figure_data/` — 每张正式图的 `*_source_data.tsv`
- `work/reports/` — `analysis_summary.md`, `methods.md`, `figure_legend.md`
