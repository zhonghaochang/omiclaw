---
name: 04-feature-engineering
description: Section 4：独立特征工程与聚合。在各数据集未整合的原始矩阵上独立计算四层特征（组成/状态/互作/参考），按 score-based ratio 公式聚合到患者级。
type: reference
---

# Section 4：独立特征工程与聚合

## 概述

| 项 | 说明 |
|---|---|
| **读入** | Section 3 输出的带 `Cell_Subtype` 标签的独立 `.h5ad` 文件 + 特征表 `characters.xlsx` |
| **处理** | 在各数据集原始的、未经去批次污染的表达矩阵上独立计算基因集得分（Score）→ 强制使用 Score 计算对抗比值特征 → 细胞级 → 样本级 → 患者级 |
| **输出** | 终极患者级特征表格 `fibro_features.tsv` |

**前置依赖**：Section 3 完成

**硬性底线**：在计算病人级特征表时，严禁使用 scVI latent、BBKNN/Harmony 校正后的嵌入或任何整合对象。所有 `sc.tl.score_genes` 必须在各数据集原始的、未整合的归一化矩阵上独立完成。

## 特征组装强制规则

- 全局 atlas 只负责统一标签体系，不直接产出病人级模型特征
- `Cell_Subtype` 确定后，必须回写到各个独立原始数据集对象中，再开始特征工程
- 系统必须同时计算离散比例（`frac`）和连续评分（`score`）
- 如果某亚型 `frac` 全为 0（分类失败），强制使用 `_score` 列作为替代
- **所有关键 ratio 特征一律禁止用 `frac` 相除**，必须使用 `score` + 平滑公式：`(Numerator_score + 0.1) / (Denominator_score + 0.1)`

## 第一层：组成特征

| 特征名 | 定义 |
|---|---|
| `fibro_frac_all` | 成纤维细胞占全部细胞的比例 |
| `fibro_frac_nonimmune` | 成纤维细胞占非免疫细胞的比例 |
| `fibro_subtype_frac_{x}` | 亚型 x 在成纤维细胞中的比例 |
| `fibro_diversity` | 成纤维细胞亚型组成的 Shannon 熵 |
| `fibro_immune_ratio` | 成纤维细胞与免疫细胞的粗组成比 |
| `mycaf_frac` / `icaf_frac` / `apcaf_frac` | CAF 亚型比例 |
| `mycaf_icaf_ratio` | `(myoCAF_score + 0.1) / (iCAF_score + 0.1)` |
| `nk_frac` / `nkrest_frac` / `nkcyto_frac` | NK 相关比例 |
| `nkcyto_nkrest_ratio` | `(NKcyto_score + 0.1) / (NKrest_score + 0.1)` |
| `myoCAF_to_CD8_score_ratio` | `(myoCAF_score + 0.1) / (cytotoxic_score + 0.1)` |
| `iCAF_to_NKcyto_score_ratio` | `(iCAF_score + 0.1) / (NKcyto_score + 0.1)` |
| `apCAF_to_CD4_ratio` | `(apCAF_score + 0.1) / (CD4_helper_score + 0.1)` |

## 第二层：状态与程序特征

先在每个细胞上用基因集打分（`sc.tl.score_genes`），再聚合到病人级。

**通用成纤维细胞程序：**

| 程序 | 代表基因 |
|---|---|
| ECM 重塑 | COL1A1、COL3A1、FN1、MMP2、MMP14、LOXL2、POSTN |
| TGF-β 应答 | TGFB1、TGFBR1、SMAD2、SMAD3、ACTA2、CTGF |
| 炎症趋化因子 | IL6、CXCL12、CXCL14、CCL2、CCL5、CXCL1 |
| 干扰素应答 | IFIT1、IFIT2、IFIT3、MX1、ISG15、OAS1 |
| 抗原呈递 | HLA-DRA、HLA-DRB1、HLA-DPB1、CD74 |
| 血管生成 | VEGFA、VEGFC、ANGPT1、ANGPT2、PDGFB |
| 增殖 | MKI67、TOP2A、PCNA、CDK1 |

**CAF 特异程序：**

| 程序 | 标志基因 |
|---|---|
| `myoCAF_score` | ACTA2、NDUFA4L2、MYL9、MYLK |
| `iCAF_score` | IL6、CXCL12、DPT、CXCL14、C3、CFD、APOD、FBLN1、PTGDS、GSN |
| `apCAF_score` | HLA-DRA、HLA-DQB1、CD74、SLPI、HLA-DPA1、HLA-DQA1 |

**跨舱室程序：**

| 程序 | 标志基因 |
|---|---|
| `NKcyto_score` | NKG7、GNLY、PRF1、FGFBP2、FCGR3A、GZMB、GZMH |
| `NKrest_score` | GZMK、XCL1、XCL2、IL7R、SELL、KLRC1 |
| `Treg_suppressive_score` | FOXP3、IL2RA、CTLA4、TIGIT、IKZF2 |
| `CD4_helper_score` | IL7R、LTB、MALAT1 |
| `Cytotoxic_score` | NKG7、PRF1、GZMB、IFNG、GNLY |
| `Exhausted_score` | PDCD1、LAG3、HAVCR2、TOX、TIGIT |
| `M1_like_score` | IL1B、TNF、CXCL10、HLA-DRA、STAT1 |
| `M2_like_score` | MRC1、CD163、TGFB1、C1QA、APOE |
| `Mast_activation_score` | TPSAB1、TPSB2、CPA3、KIT、HDC、MS4A2、HPGDS |
| `Non_tumor_epithelial_score` | EPCAM、KRT8、KRT18、KRT19、CDH1、AGR2 |

## 第三层：互作特征

| 特征名 | 定义 |
|---|---|
| `fibro_exhaustedT_cooccurrence` | 成纤维细胞比例与耗竭 T 细胞比例的共丰度 |
| `fibro_treg_interaction` | CAF 状态分数 × Treg 丰度 |
| `fibro_m2_interaction` | CAF 状态 × M2 样巨噬细胞评分 |
| `fibro_nkcyto_antagonism` | iCAF/ECM 程序与 NK 杀伤之间的负向耦合 |
| `icaf_mregDC_interaction` | `iCAF_score × mregDC_frac`（CCL19/CCL21-CCR7 轴） |
| `apcaf_cd4_treg_axis` | `apCAF_score × Treg_suppressive_score` |

通讯特征优先在数据集内部用 CellPhoneDB 或 CellChat 计算。

**通讯分析真实性约束：**
- 正式交付必须来自真实通讯工具
- 若条件不足，近似量必须命名为 `communication_proxy`
- 通讯矩阵全为 0 或 NaN 视为失败

## 第四层：其他舱室参考特征

**T 细胞：**

| 特征名 | 定义 |
|---|---|
| `cd8_frac` | CD8 T 细胞比例 |
| `tcf7_cd8_frac` | TCF7+ 干性 CD8 比例 |
| `exhausted_cd8_frac` | 耗竭 CD8 比例 |
| `cytotoxic_score` | 细胞毒程序评分 |
| `treg_frac` / `treg_suppressive_score` | Treg 相关 |
| `T_Exhausted_to_Cytotoxic_ratio` | `(Exhausted_score + 0.1) / (Cytotoxic_score + 0.1)` |

**髓系和 DC：**

| 特征名 | 定义 |
|---|---|
| `macrophage_frac` | 巨噬细胞比例 |
| `m1_like_score` / `m2_like_score` | 极化评分 |
| `m1_m2_ratio` | `(M1_like_score + 0.1) / (M2_like_score + 0.1)` |
| `mregDC_frac` / `cDC1_frac` / `cDC2_frac` | DC 亚型 |

**NK、肥大与其他：**

| 特征名 | 定义 |
|---|---|
| `nkcyto_score` / `nkrest_score` | NK 程序评分 |
| `mast_frac` / `mast_activation_score` | 肥大细胞 |
| `non_tumor_epithelial_frac` / `_score` | 非肿瘤上皮 |
| `Bcell_frac` / `plasma_frac` | B/浆细胞 |

## 聚合规则

1. 基因集打分在归一化表达矩阵上计算（不是整合嵌入）
2. 细胞级评分先聚合到样本级（均值）
3. 样本级再聚合到病人级
4. 如果一个病人有多个基线样本，只使用 manifest 选定的那个
5. ratio 特征统一使用 `(score + 0.1)` 平滑公式

## 标准化规则

1. 跨数据集合并前，在每个数据集内对所有特征做 z-score 标准化
2. 保留 `dataset_id`、`cancer_type`、`cancer_context` 等作为元数据列
3. 不能让平台差异压过生物学信号

## 特征质量门控（mandatory）

| 条件 | 动作 | 标记 |
|---|---|---|
| 方差 < 1e-10 | 移除 | `GATE: zero_variance` |
| 缺失率 > 50% | 移除 | `GATE: high_missing_gt50pct` |
| 所有非零值来自单一数据集 | **移除** | `GATE: single_dataset_signal` |
| 与另一特征 r > 0.99 | 保留其一 | `GATE: near_duplicate` |
| ratio 由 frac 直接相除 | 移除 | `GATE: frac_ratio_forbidden` |

## 参考实现脚本

```python
def safe_score_ratio(num, den, pseudocount=0.1):
    return (num.astype(float) + pseudocount) / (den.astype(float) + pseudocount)


def score_programs(adata, gene_sets):
    if "lognorm" in adata.layers:
        adata.X = adata.layers["lognorm"].copy()
    for score_name, genes in gene_sets.items():
        valid = [g for g in genes if g in adata.var_names]
        if len(valid) >= 2:
            sc.tl.score_genes(adata, gene_list=valid, score_name=score_name, use_raw=False)
        else:
            adata.obs[score_name] = np.nan
    return adata


def build_patient_features(cell_obs):
    score_cols = [c for c in cell_obs.columns if c.endswith("_score")]
    sample_scores = cell_obs.groupby(["dataset_id", "sample_id"], dropna=False)[score_cols].mean().reset_index()
    patient_scores = sample_scores.groupby(["dataset_id", "patient_id"], dropna=False).mean(numeric_only=True).reset_index()

    patient_scores["mycaf_icaf_ratio"] = safe_score_ratio(patient_scores["myoCAF_score"], patient_scores["iCAF_score"])
    patient_scores["myoCAF_to_CD8_score_ratio"] = safe_score_ratio(patient_scores["myoCAF_score"], patient_scores["Cytotoxic_score"])
    patient_scores["iCAF_to_NKcyto_score_ratio"] = safe_score_ratio(patient_scores["iCAF_score"], patient_scores["NKcyto_score"])
    patient_scores["T_Exhausted_to_Cytotoxic_ratio"] = safe_score_ratio(patient_scores["Exhausted_score"], patient_scores["Cytotoxic_score"])
    patient_scores["m1_m2_ratio"] = safe_score_ratio(patient_scores["M1_like_score"], patient_scores["M2_like_score"])
    patient_scores["nkcyto_nkrest_ratio"] = safe_score_ratio(patient_scores["NKcyto_score"], patient_scores["NKrest_score"])
    patient_scores["apCAF_to_CD4_ratio"] = safe_score_ratio(patient_scores["apCAF_score"], patient_scores["CD4_helper_score"])
    return patient_scores
```

**绝对不要这样写：**
- `mycaf_score = frac(mycaf, fibro)` — 用比例冒充 score
- `mycaf_icaf_ratio = frac(mycaf, icaf)` — frac/frac
- 在 scVI latent 上做 `score_genes`
- 声称执行了 fallback 却没生成 `subtype_continuous_scores_summary.tsv`

## 参考实现脚本（Communication Gate）

```python
def should_block_communication(feature_df, required_cols):
    missing = [c for c in required_cols if c not in feature_df.columns]
    if missing:
        return True, f"missing_required_features: {','.join(missing)}"
    dead = []
    for c in required_cols:
        vals = pd.to_numeric(feature_df[c], errors="coerce")
        if vals.dropna().empty or (vals.fillna(0) == 0).all():
            dead.append(c)
    if dead:
        return True, f"all_zero_or_nan_features: {','.join(dead)}"
    return False, "ready"
```

## 输出表格

| 文件名 | 内容 |
|---|---|
| `fibro_features.tsv` | 每行一个 manifest 行；全部四层特征 |
| `fibro_feature_meta.tsv` | 特征名、层次、定义、来源程序 |
| `fibro_feature_qc.tsv` | 每个特征的缺失率、值域、门控状态 |
| `feature_gate_log.tsv` | 每个被门控/警告的特征及原因 |

## Deliverables（交付物清单）

| 交付物 | 路径 |
|---|---|
| 患者级特征表 | `work/features/fibro_features.tsv` |
| 特征元数据 | `work/features/fibro_feature_meta.tsv` |
| 特征 QC | `work/features/fibro_feature_qc.tsv` |
| 门控日志 | `work/features/feature_gate_log.tsv` |
| 通讯诊断 | `work/communication/communication_matrix_diagnostics.tsv` |

### 完成检查

- [ ] 所有特征在各数据集原始矩阵上独立计算（非整合嵌入）
- [ ] ratio 特征使用 score + 0.1 平滑公式
- [ ] feature_gate_log.tsv 已输出，single_dataset_signal 特征已 GATE
- [ ] fibro_features.tsv 行数与 manifest 主分析病人数一致

**完成后可暂停并回复用户，提示进入 Section 5。**
