---
name: 成纤维细胞分析skill
description: 成纤维细胞/CAF 与免疫治疗应答分析的单一入口 skill。包含 7 个分阶段子 skill（数据基建、全局图谱、聚类注释、特征工程、建模、归因、机制验证）以及独立的硬性约束规则。
---

# 成纤维细胞分析 skill

## Overview

这是当前仓库里用于成纤维细胞、CAF、ICB 应答与相关单细胞分析的主 skill。结构按"一个主 SKILL.md（本文件）+ references/ 下的子 skill 文档"组织。

**核心科学问题：肿瘤微环境中的基线成纤维细胞状态，能否预测免疫检查点阻断（ICB）治疗的应答（R）与非应答（NR）？**

分析必须满足以下要求：
- 主预测模型只使用治疗前（基线）样本
- 每个病人在主分析中有且仅有一行
- 成纤维细胞特征必须在包含其他 TME 舱室（T 细胞、髓系细胞、DC、肿瘤细胞）的全模型中评估重要性
- **必须使用全部数据**——禁止人为采样（downsampling），各数据集的全部细胞都必须参与分析
- 结果必须可解释、在重采样下稳定、在独立队列中可重现

## When to Use This Skill

当任务涉及以下任一内容时，直接使用本 skill：
- 成纤维细胞、CAF、iCAF、apCAF、myCAF、mregDC、NKcyto、TCF7_CD8 等 TME 亚型
- 免疫治疗响应、ICB、checkpoint blockade、R/NR、baseline manifest
- EGAS00001004809、GSE236581、GSE269936、GSE123813、GSE241934
- 单细胞到患者级聚合、四层特征工程、多舱室对照建模、稳定重要性、正式 figure bundle

## Runtime Environment

- 推荐解释器：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw/bin/python`
- 等价路径：`/root/miniconda3/envs/omiclaw/bin/python`
- 当前 shell 默认 `python` 指向 `base`，不应直接用于本流程

推荐激活方式：

```bash
source /root/miniconda3/etc/profile.d/conda.sh
conda activate /vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw
```

绘图时默认设置：

```python
import matplotlib
matplotlib.use("Agg")
```

## GPU

- NVIDIA A100-SXM4-80GB with CUDA 12.8
- 适合 scVI、scANVI、totalVI、SOLO、CellRank 等 PyTorch 模型

自动检测：

```python
import torch
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
```

## Available Packages

### Core Framework

| Package | Purpose |
|---|---|
| scanpy | QC、归一化、聚类、DE、可视化 |
| anndata | 单细胞对象 |
| mudata / muon | 多模态对象与分析 |

### Deep Learning

| Package | Purpose |
|---|---|
| scvi-tools | scVI、scANVI、totalVI、SOLO、PeakVI |
| torch (CUDA) | GPU 加速 |
| cellrank | Fate / Markov-chain 分析 |
| scvelo | RNA velocity |

### Integration & Batch Correction

| Package | Purpose |
|---|---|
| bbknn | Batch-balanced KNN（scVI 失败时的首选备选） |
| scanorama | MNN 风格整合 |
| harmonypy | Harmony 批次校正（仅紧急备选，默认弃用） |

### Functional Analysis

| Package | Purpose |
|---|---|
| decoupler | TF / pathway activity |
| liana | 细胞通讯；使用前必须先验证 import |
| pyscenic | GRN 推断 |

### Specialized

| Package | Purpose |
|---|---|
| scrublet | 双联体检测 |
| celltypist | 自动注释 |
| scirpy | TCR/BCR 分析 |
| pertpy | 扰动分析 |
| squidpy | 空间转录组 |
| infercnvpy | CNV 推断 |
| pydeseq2 | pseudobulk DE |
| pyreadr (0.5.4) | 读取 R 的 .rds/.rda 文件（如 EGAS 的 counts RDS） |
| mygene | Ensembl/Entrez → HGNC Symbol 基因 ID 映射 |

### Visualization

| Package | Purpose |
|---|---|
| matplotlib / seaborn | 正式静态图 |
| plotly | 交互图 |

当前环境限制：
- 不要假设 `liana` 一定可用；真实通讯分析前必须先做 import 验证

## Sub-Skill Index（分阶段子 Skill）

开始执行前，**必须先阅读 `references/00-constraints.md`**，然后按 Section 顺序阅读对应子 skill。

| 文件 | 名称 | 一句话说明 |
|---|---|---|
| `references/00-constraints.md` | **硬性约束规则** | 所有 Section 共享的不可违反规则：数据加载、基因标准化、建模禁区、脚本合规、目录规范 |
| `references/01-data-infrastructure.md` | **Section 1：数据基建与路由** | 读入原始数据 → QC → 基因名标准化 → manifest 路由 → 独立 .h5ad 输出 |
| `references/02-global-atlas.md` | **Section 2：全局图谱整合** | 拼接全部数据集 → scVI（默认）/BBKNN（备选）去批次 → 全局 UMAP |
| `references/03-clustering-annotation.md` | **Section 3：双层聚类与标签下放** | 全局粗分 → 舱室内二次精聚类 → 亚型标签 → 回传原始数据集 → 覆盖率审计 |
| `references/04-feature-engineering.md` | **Section 4：独立特征工程与聚合** | 在未整合矩阵上独立计算 score/frac/ratio → 细胞级 → 样本级 → 患者级 |
| `references/05-modeling.md` | **Section 5：反作弊门控与基线预测建模** | 基线子集化 → 反作弊拦截 → LODO 逻辑回归 → 敏感性分析 |
| `references/06-attribution.md` | **Section 6：核心归因——CAF"一票否决权"** | SHAP 全局霸榜 → 边际 AUC 消融 → 双变量拮抗分析 |
| `references/07-mechanism-validation.md` | **Section 7：独立队列机制反证** | 在治疗后队列中验证基线发现的关键特征，闭环证明 |
| `references/collaboration-and-delivery-contract.md` | **共享协作契约** | 实时进度推送、文件存储、图像交付标准 |
| `references/fibro_primary_model_guardrails.py` | **建模 Guardrail 代码** | primary model 的规范 Python 模板 |

## Required Reading Order

1. **`00-constraints.md`** — 先读全局硬性规则
2. **`01-data-infrastructure.md`** — 数据基建
3. **`02-global-atlas.md`** — 图谱整合
4. **`03-clustering-annotation.md`** — 聚类注释
5. **`04-feature-engineering.md`** — 特征工程
6. **`05-modeling.md`** — 建模
7. **`06-attribution.md`** — 归因
8. **`07-mechanism-validation.md`** — 机制验证
9. **`collaboration-and-delivery-contract.md`** — 协作契约
10. **`fibro_primary_model_guardrails.py`** — 建模代码模板

## Recommended Workflow（总体流程）

每个 Section 的详细步骤见对应子 skill 文档。总体顺序是线性的，每一步的输出就是下一步的输入。

```
Section 1（数据基建）
    ↓ 独立 .h5ad + manifest.tsv
Section 2（全局图谱）
    ↓ merged.h5ad（含整合坐标）
Section 3（聚类注释）
    ↓ 带 Cell_Subtype 标签的独立 .h5ad
Section 4（特征工程）
    ↓ fibro_features.tsv（患者级）
Section 5（建模）
    ↓ 全模型 + LODO 性能报告
Section 6（归因）
    ↓ SHAP / 消融 / 拮抗分析
Section 7（机制验证）
    ↓ 治疗后队列闭环验证
```

**阶段性完成规则**：每个 Section 完成后，必须检查该 Section 定义的交付物（Deliverables）是否齐全、正确性检查是否通过。如果通过，可以暂时结束该 Section 并回复用户，提示可以进行下一步。

## Collaboration and Delivery

共享协作契约统一见 `references/collaboration-and-delivery-contract.md`。

本项目额外必查项：
- 启动长任务前必须汇报当前主脚本路径、是否为新生成/修订脚本、脚本哈希，以及 preflight 是否通过
- 启动长任务前必须汇报当前 run 目录是否 clean
- Manifest 校验后必须明确汇报 `GSE123813` 是否已进入 `manifest.tsv`
- 注释完成后必须汇报全局 atlas 是否完成、哪些亚型零覆盖
- 特征完成后必须汇报 `manifest.tsv` 病人数、`fibro_features.tsv` 病人数、实际建模表病人数
- 建模完成后必须说明 primary model 是否含有禁止列
- 最终总结必须写清 `GSE123813` 与 `GSE241934` 的最终路由，以及 primary model 实际使用了多少病人

## Expected Outputs（全局交付物汇总）

各 Section 的详细交付物见对应子 skill 文档。全局汇总如下：

- `work/manifest/` — manifest.tsv, manifest_mechanism.tsv, manifest_all.tsv, manifest_validation_report.tsv
- `work/audit/` — script_provenance.md, script_compliance_report.tsv, run_dir_hygiene_report.tsv, run_pipeline.log
- `work/atlas/` — 全局图谱、整合诊断、UMAP、Dotplot
- `work/qc/` — 每数据集 QC 报告
- `work/annotation/` — 每数据集注释、marker、覆盖率审计
- `work/features/` — 特征表、门控日志
- `work/communication/` — 通讯分析或阻断说明
- `work/modeling/` — 建模产物、LODO、敏感性分析、SHAP
- `work/figures/main/`, `work/figures/supplementary/` — 正式图像
- `work/figure_data/` — 图像源数据
- `work/reports/` — analysis_summary.md, methods.md, figure_legend.md
- `fibro_features.tsv`, `fibro_feature_meta.tsv`, `fibro_feature_qc.tsv`
