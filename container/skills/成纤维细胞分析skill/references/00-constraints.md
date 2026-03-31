---
name: 00-constraints
description: 成纤维细胞分析 skill 的全局硬性约束规则。所有 Section 共享，覆盖数据加载、基因标准化、整合边界、建模禁区、脚本合规、目录规范与交付判定。
type: reference
---

# 硬性约束规则（所有 Section 共享）

本文件是所有 Section 的前置必读。任何 Section 的执行都必须在本文件规则框架内进行。

## 0. 全局强制规则

- **必须使用全部数据**——禁止对任何数据集做人为 downsampling/subsampling，所有细胞必须完整参与 QC、注释与特征工程
- 每个 Section 完成后，必须检查该 Section 定义的交付物是否齐全、正确性检查是否通过。如果通过，可以暂时结束该 Section 并回复用户，提示可以进行下一步

## 1. 数据加载与表达矩阵读取

- **当数据集包含表达矩阵（RDS / H5AD / H5 / MTX / counts.txt.gz）时，必须读取表达矩阵做 QC、归一化和 `score_genes`**。严禁仅读元数据 CSV/TXT 然后用字符串标签伪造 score（如 `pseudo_scores_from_labels` 模式）。如果脚本中出现"对有表达矩阵的数据集只读 metadata"的逻辑，脚本合规审计必须标记为 `ERROR: expression_matrix_skipped`
- 读取 RDS 文件使用 `pyreadr.read_r()`（已安装 0.5.4）。若环境中 `pyreadr` 不可用，必须先安装或抛出 `ERROR: pyreadr_unavailable` 阻断，不得用 metadata-only fallback 静默替代
- 各数据集表达矩阵的读取方式：
  - EGAS00001004809：`pyreadr.read_r()` 读取 `1863-counts_cells_cohort1.rds`（C1）和 `1867-counts_cells_cohort2.rds`（C2），与对应 metadata CSV 按 cell barcode 关联
  - GSE236581：`scanpy.read_mtx()` 读取 `GSE236581_counts.mtx.gz` + barcodes + features
  - GSE123813：`pd.read_csv(..., sep='\t')` 读取 `GSE123813_bcc_scRNA_counts.txt.gz` 和 `GSE123813_scc_scRNA_counts.txt.gz`
  - GSE241934：`scanpy.read_mtx()` 读取 IIT 和 RWC 的 `*_Matrix.mtx.gz` + barcodes + features
  - GSE269936：`scanpy.read_10x_h5()` 或 `scanpy.read_mtx()` 读取各样本的 H5/MTX 文件

## 2. 强制基因标识符标准化

- **加载后首要检查**：在读入任何单细胞对象（`.h5ad`、`.h5`、`.mtx`、`.rds`）后，必须立即检查 `adata.var_names` 的格式
- **格式嗅探**：如果 `var_names` 中有超过 10% 的名字以 `ENSG` 开头（Ensembl ID），或为纯数字（Entrez ID），必须强制触发基因名转化流程，严禁直接进入下一步的质控和打分
- **转化优先级法则**：
  1. **优先提取内置元数据**：检查 `adata.var` 表格中是否已经存在名为 `gene_symbol`、`symbol`、`feature_name` 或 `name` 的列。如果有，直接用该列替换 `var_names`
  2. **云端映射兜底**：如果自带元数据中没有 Symbol，必须在 Python 脚本中调用 `mygene` 包或 `scanpy.queries.biomart_annotations` 联网将 Ensembl/Entrez ID 映射为 HGNC Symbol
- **去重与清洗**：转化为 Symbol 后，必须将所有字母转为大写（`.str.upper()`）。对于转化后出现重复的基因名，必须执行去重（如使用 `adata.var_names_make_unique()`）。未能成功映射的基因（如保留为 NaN 的）予以剔除
- **安全断言（Assertion）**：转化完成后，在代码中写死一个断言，检查诸如 `ACTA2`、`CD8A`、`PTPRC` 等经典标志基因是否已存在于 `adata.var_names` 中。若不存在，说明转化失败，必须抛出 `ERROR: Gene_Symbol_Alignment_Failed` 并停止运行

## 3. 全局 Atlas 与批次整合

- 基础 QC 后必须先构建跨全部数据集的全局 atlas，并以 `dataset_id` 为批次键运行去批次整合生成统一图谱
- **默认整合方法为 scVI**（`scvi-tools`，已安装，支持 GPU A100）。scVI 直接接受原始 counts 矩阵，通过变分自编码器学习去批次的 latent representation
- **scVI 失败时首选备选为 BBKNN**（`bbknn`，已安装），不再默认使用 Harmony（Harmony 易报错，降级为紧急备选）
- **全局 atlas 的输入必须是 HVG 表达矩阵（原始 counts）**，不得使用 score/composition 矩阵。若脚本中出现 `make_adata_from_scores` 或类似的将 score 列转为 AnnData.X 再做整合的逻辑，脚本合规审计必须标记为 `ERROR: atlas_built_on_scores_not_expression`
- 整合产出的 latent representation（`adata.obsm["X_scVI"]` 或 BBKNN 校正后的 neighbors graph）只用于全局 atlas 的 neighbors → UMAP → clustering → 统一注释，不能替代归一化表达矩阵做基因集打分
- **若整合方法返回维度不匹配、报错或触发 fallback，必须立即阻断流程并抛出 `ERROR: integration_failed`**，不得静默降级为未校正 PCA 继续运行
- **必须调用真正的 `sc.tl.umap()`** 生成嵌入，不得用 PCA 前两维冒充 UMAP

## 4. 建模与特征硬性边界

- 主预测模型只允许使用治疗前基线样本
- 主分析中每位病人只能保留一行
- 成纤维细胞的重要性必须在包含其他 TME 舱室的全模型中评估
- 除参考文档明确授权外，不得让病灶级、治疗后或机制专用队列污染主基线模型
- `GSE123813` 必须先折叠到患者级再进入主模型；`GSE241934` 仅允许进入机制分析
- 所有关键纳排、折叠与样本选择决策都必须先写入 manifest，再进入下游分析
- 全零或近零方差特征禁止进入模型；`fibro_feature_qc.tsv` 必须标注并过滤
- **若某特征仅在 1 个数据集中有非零信号（`single_dataset_signal`），必须在 feature gate 中标记为 `GATE: single_dataset_signal` 并从模型输入中移除**
- **主模型的 trainable feature 只能是生物学患者级特征**。`dataset_id`、`cancer_context`、`cancer_type`、`platform`、`response_tier`、`annotation_method` 只能保留为元数据
- **`n_cells`、`fibro_count`、绝对细胞数、QC 保留细胞数、测序深度/覆盖度 proxy、atlas 采样上限相关列，禁止进入主模型**
- 建模前必须输出 `work/modeling/<run_id>/primary_feature_audit.tsv`，逐列记录 `feature_name`、`include_in_primary`、`reason`。若任何禁止列仍被标记为 `include_in_primary = True`，必须立即 `ERROR: forbidden_primary_feature`
- 建模前必须输出 `work/modeling/<run_id>/modeling_coverage_report.tsv`。若总建模行数 < 主 manifest 的 90%，或任一主数据集损失 > 20% 且无书面解释，必须 `ERROR: modeling_coverage_mismatch`
- 所有敏感性分析和消融都必须在各自子集/特征集上**重建 design matrix 并重新跑 LODO**。禁止只改 `n` 或标签筛选后沿用 full-model AUC
- 每个 sensitivity / ablation scenario 都必须落地自己的明细产物，至少包括 `sensitivity/<scenario>__fold_metrics.tsv` 与 `sensitivity/<scenario>__heldout_predictions.tsv`
- 主图中的 response-associated 特征分布图，只能使用 `include_main_analysis = True` 且 response 非空的病人

## 5. 注释与特征工程

- 细粒度亚型不得仅凭 `raw_label`、字符串包含规则或粗标签直接赋值；必须来自二层 sub-clustering 或 marker-based continuous scoring
- 如果 major compartment 存在但细亚型全零，默认优先判定为注释流程未分辨成功，不得直接解释为生物学缺失
- 全局 atlas 统一注释完成后，必须将 `Cell_Subtype` 标签下放回各个原始数据集，再做病人级特征工程
- 所有 `sc.tl.score_genes`、frac、score、ratio 特征必须在各数据集未整合的原始/归一化矩阵上独立计算，严禁直接在 scVI latent / 整合对象上求病人级特征
- 所有关键对抗 ratio 特征禁止直接用细胞占比 `frac` 相除；必须基于连续程序分数 `score` 按统一平滑公式 `(Numerator_score + 0.1) / (Denominator_score + 0.1)` 计算
- 若声明完成了 per-dataset 注释，`__cluster_markers.tsv` 与 `__subtype_marker_scores.tsv` 不得为空表头文件
- 若 `iCAF`、`myoCAF`、`apCAF`、`mregDC` 这些 focal subtype 在大多数主数据集中持续零覆盖或 unresolved，必须阻断 subtype-specific 主图与机制性表述

## 6. 通讯分析

- 正式 `communication/` 结果必须来自真实通讯工具；proxy 只能写作 `communication_proxy`
- 若通讯矩阵全部为 `0` 或 `NaN`，必须阻断正式出图并输出根因诊断
- 正式 `work/communication/` 目录不得只包含 `__communication_proxy.*` 文件

## 7. Manifest 与验证

- `GSE123813` 在患者级折叠后必须出现在 `work/manifest/manifest.tsv` 中，且 `analysis_unit = patient`、`include_main_analysis = True`
- 若某 fold AUC ≤ 0.55，必须标注 near-random 并解释原因
- 若 `manifest.tsv` 中的主分析病人未能在最终建模表中保留，必须显式记录 attrition 原因；静默丢失病人视为失败

## 8. 数据约束（Section 12 合并）

- 不得将基线、治疗中、治疗后样本混入同一个主预测模型
- 不得让同一个病人在主分析中贡献多行
- 不得将病灶级行当成病人级行，除非 manifest 明确写了折叠规则
- 不得忽略原始包与补充表之间的元数据不一致
- 不得将 EGAS00001004809 的 `E/NE` 与直接临床 `R/NR` 视为完全等价，而不做 `response_semantics` 标注与敏感性分析

## 9. 特征约束

- 不得将治疗后专属特征用作基线预测因子
- 不得在完成数据集内特征提取之前跨数据集聚合
- 不得将只存在于机制队列中的 iCAF/myoCAF 特征描述为基线预测因子
- **不得让全零或近零方差特征进入模型**
- **不得将 marker 推断的成纤维细胞计数与原始注释的成纤维细胞计数等价对待**
- **不得把 `score = frac(...)` 或 `ratio = frac(...)` 的旧逻辑重新带回脚本**

## 10. 建模约束

- 不得在测试集上调整超参数
- 不得让同一个病人同时出现在训练集和测试集
- 不得从只含成纤维细胞特征的模型中报告成纤维细胞重要性
- **不得将 AUC ≤ 0.55 的 LODO fold 作为"模型有效"的证据**
- **不得让 ON-treatment 或 POST-treatment 样本进入主基线模型**

## 11. 批次校正约束

- scVI 接受原始 counts 矩阵（通过 `layer="counts"`），BBKNN 作用在 PCA 嵌入的 neighbors graph 上；两者都不得替代归一化表达矩阵做基因集打分
- 不得用整合后的嵌入进行基因集打分
- 运行整合之前必须完成 `dataset_id` 的标注

## 12. 脚本合规与运行环境

- 禁止将历史 `run_*` 目录中的主分析脚本直接复制、改名或原样复用为新任务脚本
- 若新脚本与既往脚本完全同哈希，默认视为 `ERROR: reused_prior_run_script`
- 运行前必须做脚本文本级反模式扫描；若命中以下任一模式，必须阻断执行并重写脚本：
  - `communication_proxy` 作为正式输出
  - `score = frac(...)`、`ratio = frac(...)`
  - `unit-level atlas proxy` / `composition proxy`
  - `pseudo_scores_from_labels`
  - `make_adata_from_scores`
  - 整合方法 `except Exception` 后静默 fallback 到未校正 PCA
- 新任务必须在 clean-room run directory 中执行
- 禁止通过解压旧结果包或复制旧目录来"补齐"本轮交付

### 脚本合规 Gate（参考实现）

```python
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pandas as pd


ANTI_PATTERNS = [
    {
        "rule_id": "forbid_proxy_communication_as_formal_output",
        "severity": "ERROR",
        "pattern": r"communication_proxy|ligand_receptor_proxy",
        "message": "Formal work/communication outputs must not be proxy-labeled",
    },
    {
        "rule_id": "forbid_score_equals_frac",
        "severity": "ERROR",
        "pattern": r"\b(?:myo?caf|i?caf|apcaf|nkcyto|nkrest|treg|mregdc|tcf7_cd8|exhausted_cd8)_score\s*=\s*frac\(",
        "message": "Continuous score is being faked by a fraction helper",
    },
    {
        "rule_id": "forbid_ratio_equals_frac",
        "severity": "ERROR",
        "pattern": r"\b(?:mycaf_icaf_ratio|nkcyto_nkrest_ratio|T_Exhausted_to_Cytotoxic_ratio|m1_m2_ratio|myoCAF_to_CD8_score_ratio|iCAF_to_NKcyto_score_ratio|apCAF_to_CD4_ratio)\s*=\s*frac\(",
        "message": "Score-based ratio has regressed to frac/frac",
    },
    {
        "rule_id": "forbid_unit_level_atlas_proxy",
        "severity": "ERROR",
        "pattern": r"unit-level atlas proxy|unit-level proxy embedding|composition proxy",
        "message": "Global atlas has regressed to a unit/sample composition proxy",
    },
]

REQUIRED_PATTERNS = [
    ("require_cell_level_concat", r"ad\.concat\(", "Global atlas must start from cell-level concatenation"),
    ("require_integration", r"SCVI\.setup_anndata|scvi\.model|bbknn\.|harmony_integrate|run_harmony", "Batch integration call (scVI or BBKNN) is required"),
    ("require_score_genes", r"score_genes", "Continuous program scoring is required"),
    ("require_score_summary_output", r"subtype_continuous_scores_summary\.tsv", "Subtype continuous score summary output is required"),
    ("require_communication_diagnostics", r"communication_matrix_diagnostics\.tsv", "Communication diagnostics table is required"),
    (
        "require_formal_communication_or_explicit_block",
        r"CellPhoneDB|CellChat|LIANA|run_formal_communication_or_block|write_blocked_communication",
        "Script must either call a real communication tool or explicitly block formal communication",
    ),
]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit_generated_script(script_path: str, search_root: str, audit_dir: str) -> pd.DataFrame:
    script = Path(script_path)
    root = Path(search_root)
    audit_root = Path(audit_dir)
    audit_root.mkdir(parents=True, exist_ok=True)

    text = script.read_text(encoding="utf-8")
    rows = []

    current_hash = sha256_file(script)
    for prior in root.glob("**/scripts/run_fibro_response_full_pipeline.py"):
        if prior.resolve() == script.resolve():
            continue
        if current_hash == sha256_file(prior):
            rows.append(
                {
                    "rule_id": "forbid_reused_prior_run_script",
                    "severity": "ERROR",
                    "status": "hit",
                    "detail": f"hash-identical to prior run script: {prior}",
                }
            )

    for spec in ANTI_PATTERNS:
        hit = bool(re.search(spec["pattern"], text))
        rows.append(
            {
                "rule_id": spec["rule_id"],
                "severity": spec["severity"],
                "status": "hit" if hit else "pass",
                "detail": spec["message"],
            }
        )

    for rule_id, pattern, message in REQUIRED_PATTERNS:
        hit = bool(re.search(pattern, text))
        rows.append(
            {
                "rule_id": rule_id,
                "severity": "ERROR",
                "status": "pass" if hit else "missing",
                "detail": message,
            }
        )

    df = pd.DataFrame(rows)
    df.to_csv(audit_root / "script_compliance_report.tsv", sep="\t", index=False)
    (audit_root / "script_provenance.md").write_text(
        "# Script provenance\n\n"
        f"- script_path: {script}\n"
        f"- script_sha256: {current_hash}\n"
        "- generation_policy: regenerate_or_patch_against_current_skill_reference\n"
        "- reused_prior_run_script: false unless compliance report shows otherwise\n",
        encoding="utf-8",
    )
    (audit_root / "script_compliance_summary.md").write_text(
        "# Script compliance summary\n\n"
        f"- total_rules: {len(df)}\n"
        f"- error_rows: {(df['severity'].eq('ERROR') & df['status'].ne('pass')).sum()}\n",
        encoding="utf-8",
    )

    if ((df["severity"] == "ERROR") & (df["status"] != "pass")).any():
        raise RuntimeError("Script compliance gate failed; regenerate or patch script before execution")
    return df
```

### 运行目录洁净度 Gate（参考实现）

```python
from __future__ import annotations

from pathlib import Path

import pandas as pd


def audit_run_directory_hygiene(run_dir: str, audit_dir: str) -> pd.DataFrame:
    root = Path(run_dir)
    audit_root = Path(audit_dir)
    audit_root.mkdir(parents=True, exist_ok=True)

    allowed_roots = {
        "scripts",
        "external_data",
        "work",
        "README.md",
        "run_summary.json",
        "fibro_features.tsv",
        "fibro_feature_meta.tsv",
        "fibro_feature_qc.tsv",
    }

    rows = []

    top_level = {p.name for p in root.iterdir()}
    unexpected = sorted([x for x in top_level if x not in allowed_roots])
    for name in unexpected:
        rows.append(
            {
                "rule_id": "forbid_unexpected_top_level_payload",
                "severity": "ERROR",
                "status": "hit",
                "detail": f"unexpected top-level entry: {name}",
            }
        )

    nested_legacy = sorted(
        [
            str(p)
            for p in root.glob("**/*")
            if p.is_dir() and p.name.startswith("fibro_response_analysis")
        ]
    )
    for p in nested_legacy:
        rows.append(
            {
                "rule_id": "forbid_nested_legacy_run_tree",
                "severity": "ERROR",
                "status": "hit",
                "detail": p,
            }
        )

    stale_proxy = sorted(root.glob("work/communication/**/*__communication_proxy.*"))
    for p in stale_proxy:
        rows.append(
            {
                "rule_id": "forbid_stale_proxy_figure_in_clean_run",
                "severity": "ERROR",
                "status": "hit",
                "detail": str(p),
            }
        )

    stale_lr = sorted(root.glob("work/communication/**/*__lr_pairs.tsv"))
    for p in stale_lr:
        rows.append(
            {
                "rule_id": "forbid_legacy_proxy_lr_tables",
                "severity": "ERROR",
                "status": "hit",
                "detail": str(p),
            }
        )

    stale_work = sorted(
        [
            str(p)
            for p in root.glob("**/work")
            if p.parent.resolve() != root.resolve()
        ]
    )
    for p in stale_work:
        rows.append(
            {
                "rule_id": "forbid_nested_work_tree",
                "severity": "ERROR",
                "status": "hit",
                "detail": p,
            }
        )

    if not rows:
        rows.append(
            {
                "rule_id": "run_dir_clean",
                "severity": "INFO",
                "status": "pass",
                "detail": "no legacy payload detected",
            }
        )

    df = pd.DataFrame(rows)
    df.to_csv(audit_root / "run_dir_hygiene_report.tsv", sep="\t", index=False)
    (audit_root / "run_dir_hygiene_summary.md").write_text(
        "# Run directory hygiene summary\n\n"
        f"- error_rows: {((df['severity'] == 'ERROR') & (df['status'] != 'pass')).sum()}\n",
        encoding="utf-8",
    )

    if ((df["severity"] == "ERROR") & (df["status"] != "pass")).any():
        raise RuntimeError("Run directory hygiene gate failed; clear run_dir before execution")
    return df
```

## 13. 过程文件保存与目录规范

### 推荐目录结构

```text
work/
├── inventory/
├── manifest/
│   ├── manifest.tsv
│   ├── manifest_mechanism.tsv
│   ├── manifest_all.tsv
│   ├── manifest_issues.tsv
│   ├── manifest_decisions.md
│   └── manifest_validation_report.tsv
├── atlas/
│   ├── README.md
│   ├── global_atlas_integration_diagnostics.tsv
│   ├── global_cluster_markers.tsv
│   ├── global_cell_subtype_labels.tsv.gz
│   ├── global_subtype_dictionary.tsv
│   └── figures/
├── qc/
│   └── {dataset_id}/
├── annotation/
│   └── {dataset_id}/
│       ├── {dataset_id}__cluster_markers.tsv
│       ├── {dataset_id}__celltype_annotation.tsv
│       ├── {dataset_id}__annotation_evidence.tsv
│       ├── {dataset_id}__subtype_marker_scores.tsv
│       └── {dataset_id}__annotation_coverage_audit.tsv
├── features/
│   ├── fibro_features.tsv
│   ├── fibro_feature_meta.tsv
│   ├── fibro_feature_qc.tsv
│   ├── feature_gate_log.tsv
│   └── feature_gate_summary.md
├── communication/
│   └── {dataset_id}/
├── modeling/
│   └── {run_id}/
│       ├── design_matrix.tsv.gz
│       ├── features_used.tsv
│       ├── primary_feature_audit.tsv
│       ├── modeling_coverage_report.tsv
│       ├── fold_metrics.tsv
│       ├── heldout_predictions.tsv
│       ├── coefficients.tsv
│       ├── permutation_importance.tsv
│       ├── shap_values.tsv.gz
│       └── sensitivity/
├── figures/
│   ├── main/
│   └── supplementary/
├── figure_data/
├── reports/
│   ├── analysis_summary.md
│   ├── methods.md
│   └── figure_legend.md
├── audit/
│   ├── script_provenance.md
│   ├── script_compliance_report.tsv
│   ├── run_dir_hygiene_report.tsv
│   └── run_pipeline.log
└── process_index.tsv
```

### 文件命名约定

```text
{dataset_id}__{level}__{content}.{ext}
```

- `level` 只使用：`cell`、`sample`、`patient`、`lesion`、`model`、`figure`
- 禁止使用 `final`、`new`、`latest2` 之类含糊命名

### 每个目录必须配说明文件

每个主要目录至少保留 `README.md` 或 `index.tsv`。

## 14. 图像与可视化交付标准

目标是 Nature/Science 级别投稿图标准：信息密度高、层级清晰、颜色克制、排版干净。

### 输出格式要求

每张关键图至少输出四类文件：
1. 矢量图：`pdf` 或 `svg`
2. 位图：`png`，主图 600 dpi，补图至少 300 dpi
3. 源数据：`*_source_data.tsv`
4. 图注草稿：`*_caption.md`

### 视觉标准

- 统一字体体系和字号层级
- 色盲友好配色
- 线宽、点大小、透明度在全套图中统一
- 轴标签必须带单位或明确定义
- 每个分组必须标注 n 值
- 同一实体在所有图中使用相同颜色

### 图像自动 QC 检查（mandatory before delivery）

| 检查项 | 规则 |
|---|---|
| 空白面板检测 | 任何 subplot 的数据点数 < 2 → 标注 `WARN: empty_panel` |
| 标签可读性 | 所有轴标签和图例文字不得被截断或重叠 |
| 样本量标注 | 每个分组必须标注 n 值 |
| 配色一致性 | 同一实体在所有图中使用相同颜色 |

### 不接受的图像风格

- 默认 Scanpy 风格且无二次整理的 UMAP 截图
- 只有 PNG、没有源数据和图注
- Forest plot 只有线条没有数据点（渲染失败）
- Box plot 只有 1-2 个点却未标注 n 值

## 15. 交付失败判定

以下任一情况默认视为"分析未完整交付"：

- 只有结果表，没有正式图像目录
- 只有 PNG，没有 `pdf/svg + source_data + caption`
- 缺少 `annotation_coverage_audit.tsv`
- 缺少 `subtype_continuous_scores_summary.tsv`
- 缺少全局 atlas 图谱（`Fig_S2_Global_UMAP` 与 `Fig_S3_Global_Dotplot`）
- 缺少脚本合规留痕（`script_provenance.md` + `script_compliance_report.tsv`）
- 缺少运行目录洁净度留痕
- 脚本合规报告仍有 ERROR 却继续执行
- 直接复用旧 run 脚本
- 新 run 目录中存在旧结果套娃目录或旧 proxy 残留
- 只用粗标签或字符串规则直接生成细亚型
- 通讯图为空白但仍视为完成
- 关键 ratio 特征仍由 `frac` 直接相除生成
- 缺少 `feature_gate_log.tsv` 或 `manifest_validation_report.tsv`
- `GSE123813` 未进入主 manifest
- 模型使用了全零特征
- LODO fold 有 near_random 结果但未标注
- `run_pipeline.log` 缺失或为空
- `methods.md` / `figure_legend.md` 是占位文本
- per-dataset markers 文件为空
- 建模覆盖率未对账
- 缺少 `primary_feature_audit.tsv`
- primary model 学到了元/技术特征
- 主特征图混入 mechanism-only 行
- 敏感性分析只是 full-model AUC 的重复值，没有 scenario 级明细文件
- 全程未发送进度推送
- 最终推送只有文件列表没有科学结论

### 核心主图硬性要求（Hard Gate for Visuals）

如果未成功生成并交付以下图，视为严重执行失败：
- `Fig_S2_Global_UMAP.pdf`
- `Fig_S3_Global_Dotplot.pdf`
- 全局 SHAP Summary Plot (Beeswarm)
- CAFs SHAP Summary Plot (Beeswarm)
- 边际 AUC 消融条形图 (Marginal AUC Barplot)
