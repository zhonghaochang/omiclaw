---
name: 00-constraints
description: 成纤维细胞分析 skill 的全局硬性约束规则。当前版本采用 Harmony-only、全量细胞、patient-level 主分析、严格阻断和 Nature 风格正式交付。
type: reference
---

# 硬性约束规则（所有 Section 共享）

本文件是所有 Section 的前置必读。任何 Section 的执行都必须在本文件规则框架内进行。

## 0. 全局强制规则

- **正式整合器只允许 `Harmony`**
- **必须使用全部数据**。禁止 `sketch`、`subsample`、`downsampling`、`max_cells` 式采样
- 允许为长 atlas 阶段保存中间 checkpoint / cache，但这些 cache 只能用于断点恢复、重试和快速迭代；不得改变输入细胞、HVG/PCA/Harmony 参数或最终图谱结果
- 正式流程采用 **strict fail-closed**：关键门禁失败时必须 `ERROR` 或 `blocked`，不得静默 fallback 为“完成”
- **文件存在不等于步骤完成**。任一 Section 只有在“方法已真实执行 + 最低输出齐全 + acceptance checks 通过”三者同时满足时，才允许标记 `completed`
- **不得把旧脚本逻辑、占位文件、空表、blocked 诊断、或 helper 续跑产物冒充为正式步骤已执行**
- **不得以任何简化替代绕过 skill 指定的方法链路**；若因环境、依赖或数据问题无法执行指定方法，唯一允许的状态是 `failed` 或 `blocked`
- **不得用强制贴标签、默认 `idxmax`、metadata 直接覆盖、或“全列非空”来替代真实注释证据**
- 主分析必须满足 `main_analysis_must_be_patient_level`
- 主模型必须满足 `route_fields_forbidden_in_primary`
- 机制验证必须满足 `mechanism_requires_valid_annotation`
- 每个 Section 完成后，必须同时检查 Deliverables、acceptance checks、图包要求和 anomaly summary

## 1. 数据加载与表达矩阵读取

- 当数据集包含表达矩阵（RDS / H5AD / H5 / MTX / counts.txt.gz）时，必须读取表达矩阵做 QC、归一化和 `score_genes`
- 严禁仅读 metadata 然后用标签伪造 score。若脚本出现此类逻辑，必须标记 `ERROR: expression_matrix_skipped`
- 读取 RDS 文件使用 `pyreadr.read_r()`。若环境中 `pyreadr` 不可用，必须先安装或抛出 `ERROR: pyreadr_unavailable`
- 各数据集表达矩阵读取方式：
  - EGAS00001004809：`pyreadr.read_r()` 读取 cohort1 / cohort2 RDS
  - GSE236581：`scanpy.read_mtx()` + barcodes + features
  - GSE123813：`pd.read_csv(..., sep='\\t')` 读取 counts 矩阵
  - GSE241934：`scanpy.read_mtx()` 读取 IIT / RWC
  - GSE269936：`scanpy.read_10x_h5()` 或 `scanpy.read_mtx()`

## 2. 强制基因标识符标准化

- 加载单细胞对象后，必须立即检查 `adata.var_names`
- 若 `var_names` 中超过 10% 为 `ENSG*` 或纯数字 Entrez ID，必须进入基因名转化流程
- 转化优先级：
  1. 优先使用 `adata.var` 中现成的 `gene_symbol` / `symbol` / `feature_name` / `name`
  2. 若无，则调用 `mygene` 或 `scanpy.queries.biomart_annotations`
- 转化后必须：
  - 全部转为大写
  - 去重并 `var_names_make_unique()`
  - 移除无法映射的基因
- **QC cache 复用前也必须做同样的 gene-axis 审计**。若复用对象的 `var_names` 超过 10% 为纯数字，视为基因轴未对齐，必须拒绝该 cache 并回到原始表达矩阵重建
- **`GSE241934_RWC` 必须显式检查是否出现纯数字基因轴**。若 `var_names` 主要为 `0/1/2/...` 这类数字列名，必须立即 `ERROR: Gene_Symbol_Alignment_Failed`
- 必须写死断言：`ACTA2`、`CD8A`、`PTPRC` 至少存在其一组核心 marker。失败则 `ERROR: Gene_Symbol_Alignment_Failed`

## 3. 全局 Atlas 与批次整合

- 基础 QC 后必须先构建跨全部数据集的全局 atlas，并以 `dataset_id` 为批次键运行 `Harmony`
- **`integration_method` 仅允许 `harmony`**
- **`harmony_sketch_max_cells > 0` 必须立即 `ERROR: atlas_downsampling_forbidden`**
- atlas 输入必须是 QC 后全部细胞；`atlas_input_cells` 必须等于 `qc_total_cells`
- atlas 输入必须是 HVG 表达矩阵，不得使用 score/composition 矩阵。若出现 `make_adata_from_scores`，必须标记 `ERROR: atlas_built_on_scores_not_expression`
- Harmony 正式执行顺序：
  1. `dataset_id` 统一成纯字符串
  2. `ad.concat` 后允许保存 restart-safe concat checkpoint
  3. `normalize_total -> log1p -> PCA(50)`，并允许保存 pre-harmony checkpoint
  4. `harmonypy.run_harmony()` 以 `dataset_id` 为批次键运行
  5. 对 `Z_corr` 做维度方向断言，强制得到 `n_obs x n_pcs`
  6. 写入 `atlas.obsm["X_pca_harmony"]`，并允许保存 post-harmony checkpoint
  7. `neighbors -> sc.tl.umap() -> leiden`
- checkpoint / cache 复用时必须同时满足：
  - `atlas_input_cells == qc_total_cells`
  - `cell_id` 集合与顺序一致
  - `dataset_id`、HVG 数量、PCA 维度、Harmony 参数一致
  - cache 未损坏且通过 schema / shape 审计
- 必须记录 `atlas_checkpoint_manifest.tsv`，至少包含 checkpoint 路径、生成阶段、参数摘要、cell 数、是否复用、失效原因
- cache 损坏或参数不匹配时，必须回退到最近一个可信上游 checkpoint 重建；不得静默继续
- 以下 atlas / annotation 提速捷径在正式运行中一律禁止：
  - 通过显式小迭代上限压缩全局 UMAP，例如 `sc.tl.umap(..., maxiter < 60)`
  - 使用 `init_pos="random"` 作为正式全局 UMAP 的省时默认
  - 对全局 Leiden 或舱室二层 Leiden 施加极低 `n_iterations` 上限，例如 `n_iterations=2`
  - 以提速为目的把 atlas 或舱室 `neighbors` 降到明显偏低的设置；全局 atlas 不得低于 `n_neighbors=30`
- 必须输出并核对：
  - `qc_total_cells`
  - `atlas_input_cells`
  - `harmony_embedding_shape`
  - `batch_key_dtype`
  - `used_full_data`
  - `integration_failed_reason`
- 若出现任何 subsample/sketch 日志、维度不匹配、或 `atlas_input_cells != qc_total_cells`，必须 `ERROR: integration_failed`
- 不允许回退到 `scVI`、`BBKNN` 或未校正 PCA
- `Fig_S2_Global_UMAP` 必须是三联图：全体细胞按 `dataset_id`、全体细胞按 `Major_CellType`、以及仅高亮 `Fibroblast Cell_Subtype` 的 focal panel；不得再用“全体细胞按所有细粒度 `Cell_Subtype`”替代正式 `Fig_S2`

## 4. Manifest、主分析路由与 patient-level 边界

- 主预测模型只允许使用治疗前基线样本
- 主分析中每位病人只能保留一行，且 `analysis_unit = patient`
- 所有关键纳排、折叠和代表样本/病灶选择决策都必须先写入 manifest，再进入下游分析
- `manifest.tsv` 必须包含 canonical provenance 字段：
  - `source_analysis_unit`
  - `source_sample_id`
  - `source_lesion_id`
- `GSE236581` 若每病人只有一个基线样本，主分析输出必须直接是 patient-level 行
- `GSE269936` 若主分析采用病灶代表策略，必须先选择最近 PRE 病灶，再输出 patient-level 主分析行
- `GSE123813` 必须先折叠到患者级再进入主模型
- `GSE241934` 仅允许进入机制分析
- 若主分析任一行 `analysis_unit != patient`，必须 `ERROR: main_analysis_not_patient_level`
- 若主分析任一 patient 缺失唯一 `source_sample_id/source_lesion_id`，必须 `ERROR: missing_main_route_source`

## 5. 注释缓存与特征工程边界

- 细粒度亚型不得仅凭 `raw_label`、字符串包含规则或粗标签直接赋值
- 全局 atlas 统一注释完成后，必须将 `Cell_Subtype` 与 `Major_CellType` 标签下放回各个原始数据集
- annotated `.h5ad` 的必备 schema：
  - `cell_id`
  - `dataset_id`
  - `patient_id`
  - `sample_id`
  - `Cell_Subtype`
  - `Major_CellType`
- 若缓存 annotation 文件缺这些列，不允许直接复用；必须先做 schema repair audit。失败则阻断
- merge 后出现 `_x/_y` 冲突列必须先标准化；若直接流入建模，视为 `ERROR: late_route_merge_suffix_conflict`
- 所有 `score_genes`、frac、score、ratio 特征必须在各数据集未整合的原始/归一化矩阵上独立计算
- 若 `score_genes` 因 gene-axis 错误、marker 无法匹配、或核心 marker 缺失而只能产生整列 `NA`，必须向上游抛出 `ERROR: Gene_Symbol_Alignment_Failed` 或等价阻断；**禁止**以“写入 `NaN` 后继续下游”方式静默放行
- 允许从 manifest 回填以下元数据到缓存注释对象：
  - `response_binary`
  - `response_tier`
  - `annotation_method`
  - `cancer_context`
  - `cancer_type`
  - `subtype_unified`
  - `treatment_state`
- 回填完成后必须生成 `feature_metadata_backfill_audit.tsv`
- 主分析 patient 行在上述字段上的覆盖率必须 100%。否则 `ERROR: incomplete_manifest_backfill`
- 禁止用空字符串占位后继续进入建模
- `sample_id_main` 只允许作为 legacy repair 痕迹存在；若其直接进入设计矩阵，必须 `ERROR: forbidden_primary_feature`

## 6. 建模与特征硬性边界

- 主模型的 trainable feature 只能是生物学患者级特征
- 以下字段只能是 metadata / provenance，不得进入 primary model：
  - `include_main_analysis`
  - `include_mechanism_analysis`
  - `analysis_unit`
  - `sample_id`
  - `lesion_id`
  - `source_analysis_unit`
  - `source_sample_id`
  - `source_lesion_id`
  - `dataset_id`
  - `cancer_context`
  - `cancer_type`
  - `platform`
  - `response_tier`
  - `annotation_method`
- `n_cells`、`fibro_count`、绝对细胞数、QC 保留细胞数、测序深度/覆盖度 proxy、atlas 采样上限相关列，禁止进入主模型
- 所有关键 ratio 特征禁止直接用 `frac/frac` 计算；必须使用 `(score + 0.1) / (score + 0.1)` 平滑公式
- 建模前必须输出 `primary_feature_audit.tsv`
- 若任何禁止列仍被标记为 `include_in_primary = True`，必须 `ERROR: forbidden_primary_feature`
- 建模前必须输出 `modeling_coverage_report.tsv`
- **主分析要求严格等量覆盖**：
  - `fibro_features.tsv` unique patient 数必须等于主 manifest patient 数
  - `design_matrix.tsv.gz` unique patient 数必须等于主 manifest patient 数
  - 任一主数据集 `patient_feature_rows != manifest_patients` 或 `modeled_rows != manifest_patients` 必须报错
- 所有敏感性分析和消融都必须重建 design matrix 并重新跑 LODO
- 每个 sensitivity / ablation scenario 都必须落地自己的 `fold_metrics.tsv` 与 `heldout_predictions.tsv`

## 7. 归因与证据等级

- 不得仅凭单一方法报告特征重要性
- 若 mean ROC-AUC `<= 0.55`、有效 fold `< 3`、或历史上出现 forbidden feature 入模，本轮归因只能输出 `weak_evidence`
- 在 `weak_evidence` 条件下：
  - 不得使用“CAF 一票否决权”措辞
  - `analysis_summary.md` 和 figure caption 必须自动降级为保守表述
- SHAP / coefficients / top features 必须先和 `primary_feature_audit.tsv` 交叉核对

## 8. 机制验证

- `GSE241934` 的 IIT 和 RWC 必须先分别检查：
  - 注释是否有效
  - patient-level 特征是否完整
  - 关键机制特征是否全 NA
- 若任一 cohort 被标记为 `blocked_for_mechanism` 或关键特征全 NA，则 combined inference 必须 blocked
- blocked 时必须输出：
  - `mechanism_block_report.tsv`
  - `Fig_M8b_mechanism_block_diagnostic`
- blocked 时不得继续输出正式 p 值结论表充当成功验证

## 9. 通讯分析

- 正式 `communication/` 结果必须来自真实通讯工具
- 若未运行真实工具，只允许输出显式 blocked diagnostics，不得写 `ready`
- `communication_matrix_diagnostics.tsv` 必须包含：
  - `status`
  - `block_reason`
  - `required_tool`
  - `tool_run`
- 若通讯矩阵全部为 `0` 或 `NaN`，必须阻断正式出图并输出根因诊断

## 10. 正式图稿与交付

- 正式图稿规范见 `08-figure-standards.md`
- 每张正式图必须同步交付：
  - 向量文件：`pdf`
  - 位图文件：`png`
  - 源数据：`*_source_data.tsv`
  - 图注：`*_caption.md`
- 最终目录必须包含：
  - `work/figures/index.tsv`
  - `work/figures/README.md`
  - `work/figure_data/`
- 若模型弱、blocked、或存在 unresolved/forbidden feature，图注和 `analysis_summary.md` 必须自动降级为保守表述
- `Fig_S2_Global_UMAP` 的 source data 必须能同时追溯 `dataset_id`、`Major_CellType`、`Cell_Subtype` 与 `is_fibro` / `focal_panel_label`

## 11. 脚本合规与运行环境

- 禁止复制历史 `run_*` 主脚本作为新任务脚本
- 若新脚本与既往脚本完全同哈希，视为 `ERROR: reused_prior_run_script`
- 新任务必须在 clean-room run directory 中执行
- 禁止用 stage6 / stage7 fallback 文件伪造“成功完成”
- 禁止脚本实现与 skill 文档分叉后仍宣称“按 skill 完成”
- 若某 Section 的脚本没有实现该 Section 文档中点名的关键方法、关键工具或关键输出，则必须在 preflight / compliance 中直接报错，而不是等到最终审计再发现
- 若 helper / resume 脚本只负责补文件、补图、补索引，则其权限仅限对应 Section；不得回溯性把上游未执行的方法学步骤改写为 `completed`

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
        "pattern": r"communication_proxy|formal_communication_not_run_in_this_execution",
        "message": "Formal communication output must be real or explicitly blocked",
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
        "rule_id": "forbid_scvi_or_bbknn",
        "severity": "ERROR",
        "pattern": r"SCVI\.setup_anndata|scvi\.model|bbknn\.",
        "message": "Formal skill is Harmony-only",
    },
    {
        "rule_id": "forbid_atlas_downsampling",
        "severity": "ERROR",
        "pattern": r"sketch|subsample|max_cells|sample_frac",
        "message": "Atlas downsampling is forbidden in formal runs",
    },
    {
        "rule_id": "forbid_random_umap_init_shortcut",
        "severity": "ERROR",
        "pattern": r"sc\.tl\.umap\([^\n]*init_pos\s*=\s*[\"']random[\"']",
        "message": "Formal atlas UMAP must not use random-init shortcut",
    },
    {
        "rule_id": "forbid_low_umap_iterations",
        "severity": "ERROR",
        "pattern": r"sc\.tl\.umap\([^\n]*maxiter\s*=\s*(?:[1-5]?\d)\b",
        "message": "Formal atlas UMAP must not cap maxiter below 60",
    },
    {
        "rule_id": "forbid_short_leiden_iterations",
        "severity": "ERROR",
        "pattern": r"sc\.tl\.leiden\([^\n]*n_iterations\s*=\s*(?:[1-9]|1\d|20)\b",
        "message": "Formal Leiden must not use short forced iteration caps",
    },
    {
        "rule_id": "forbid_legacy_route_merge_artifact",
        "severity": "ERROR",
        "pattern": r"sample_id_main|_x\\b|_y\\b",
        "message": "Legacy route-merge artifacts must not survive into formal scripts",
    },
]

REQUIRED_PATTERNS = [
    ("require_cell_level_concat", r"ad\.concat\(", "Global atlas must start from cell-level concatenation"),
    ("require_harmony", r"run_harmony|harmonypy", "Harmony integration call is required"),
    ("require_score_genes", r"score_genes", "Continuous program scoring is required"),
    ("require_score_summary_output", r"subtype_continuous_scores_summary\.tsv", "Subtype continuous score summary output is required"),
    ("require_backfill_audit", r"feature_metadata_backfill_audit\.tsv", "Feature metadata backfill audit is required"),
    ("require_communication_diagnostics", r"communication_matrix_diagnostics\.tsv", "Communication diagnostics table is required"),
    (
        "require_formal_communication_or_explicit_block",
        r"CellPhoneDB|CellChat|LIANA|write_blocked_communication|mechanism_block_report",
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
    df.to_csv(audit_root / "script_compliance_report.tsv", sep="\\t", index=False)

    if ((df["severity"] == "ERROR") & (df["status"] != "pass")).any():
        raise RuntimeError("Script compliance gate failed; regenerate or patch script before execution")
    return df
```
