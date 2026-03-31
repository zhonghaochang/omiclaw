---
name: 01-data-infrastructure
description: Section 1：数据基建与路由。覆盖五个队列的原始数据读入、基础 QC、基因名标准化、manifest 路由表生成、患者级折叠。
type: reference
---

# Section 1：数据基建与路由

## 概述

| 项 | 说明 |
|---|---|
| **读入** | 所有原始单细胞数据及临床 Metadata |
| **处理** | 基础质检（去死细胞/双细胞）→ 基因名强制转化为标准化 Symbol → 判定每个样本层级（基线主模型 / 治疗后机制 / 废弃）并执行患者级折叠（如 GSE123813） |
| **输出** | 每个数据集经过 QC 到 PCA 阶段的独立 `.h5ad` 文件 + `manifest.tsv` 路由表 + 基础细胞数量统计报告 |

**前置依赖**：`00-constraints.md`（先读硬性规则）

## 数据集详情

### EGAS00001004809 — 乳腺癌（Bassez 2021，Nature Medicine）

| 字段 | 内容 |
|---|---|
| 癌症类型 | 乳腺癌（BC） |
| 压缩包路径 | `BC/EGAS00001004809/` |
| Cohort 1 角色 | **主基线队列** |
| Cohort 2 角色 | 仅用于机制分析 |
| 测序平台 | 10x Chromium scRNA-seq |

**关键文件：**

| 文件 | 用途 |
|---|---|
| `1863-counts_cells_cohort1.rds` | Cohort 1 全细胞处理后表达矩阵对象 |
| `1864-counts_tcell_cohort1.rds` | Cohort 1 T 细胞和 NK 细胞对象 |
| `1865-counts_myeloid_cohort1.rds` | Cohort 1 髓系细胞对象 |
| `1866-counts_DC_cohort1.rds` | Cohort 1 树突状细胞对象 |
| `1867-counts_cells_cohort2.rds` | Cohort 2 全细胞处理后表达矩阵对象 |
| `1872-BIOKEY_metaData_cohort1_web.csv` | Cohort 1 细胞级元数据 |
| `1871-BIOKEY_metaData_cohort2_web.csv` | Cohort 2 细胞级元数据 |

**应答标签映射：**

| 原始标签 | 标准化标签 |
|---|---|
| `E`（T 细胞克隆扩增） | `Response` |
| `NE`（未扩增） | `Non-response` |
| 无扩增标签 | 排除主模型；`exclude_reason = missing_response_label` |

**重要 caveat：**
- `E/NE` 是 T 细胞克隆扩增代理标签，不等同于 RECIST 或病理缓解
- 必须标记为 `response_semantics = clonal_expansion_proxy`、`response_tier = tier2_surrogate`
- 必须做敏感性分析：1）完全移除该队列；2）将其单列为 surrogate-label 队列

**清单规则：**
- Cohort 1 进入主基线模型
- Cohort 2 仅进入机制分析
- 两名 Cohort 1 病人无扩增标签：保留行，`include_main_analysis = False`

### GSE236581 — 结直肠癌（Chen 2024，Cancer Cell）

| 字段 | 内容 |
|---|---|
| 癌症类型 | 结直肠癌（CRC） |
| 角色 | **主基线队列** |
| 测序平台 | 10x Chromium scRNA-seq |

**关键文件：**

| 文件 | 用途 |
|---|---|
| `GSE236581_counts.mtx.gz` | 基因×细胞表达矩阵 |
| `GSE236581_barcodes.tsv.gz` | 细胞条形码 |
| `GSE236581_features.tsv.gz` | 基因列表 |
| `ClinicalInformation.xlsx` | 病人、样本、治疗方案和应答元数据 |

**应答标签映射：**

| 原始标签 | 标准化标签 |
|---|---|
| `CR`（完全缓解） | `Response` |
| `PR`（部分缓解） | `Response` |
| `SD`（疾病稳定） | `Non-response` |

**清单规则：**
- 只保留基线肿瘤样本
- 两例十二指肠癌病例排除：`exclude_reason = non_crc_case`

### GSE269936 — 转移性黑色素瘤（Yang 2025，Nature Communications）

| 字段 | 内容 |
|---|---|
| 癌症类型 | 黑色素瘤（皮肤） |
| 角色 | 严格筛选后的探索性基线队列 |
| 测序平台 | 10x Chromium scRNA-seq + snATAC-seq |

**关键文件：**

| 文件 | 用途 |
|---|---|
| `41467_2025_62878_MOESM2_ESM.xlsx` | 样本级补充表 |
| `GSE269936_RAW.tar` | 原始样本压缩档案 |

**应答标签映射：** `R` → `Response`，`NR` → `Non-response`

**清单规则：**
- **只保留 `treatment_state = PRE` 的样本进入主基线模型**
- 如一个病人有多个基线样本，保留距治疗开始最近的一个
- `annotation_method` 必须设为 `marker_rule_inference`

**Yang 2025 关键发现：**
- mregDC（CCR7+LAMP3+）是与应答关联最强的 DC 亚型
- 两种成纤维细胞亚型：myoCAF（ACTA2+，MYL9+）和 iCAF（IL6+，CXCL12+）
- iCAF 与 mregDC 之间的 CCL19/CCL21–CCR7 轴是已证实的互作通路

### GSE123813 — 基底细胞癌和鳞状细胞癌（Yost 2019，Nature Medicine）

| 字段 | 内容 |
|---|---|
| 癌症类型 | BCC 和 SCC（皮肤） |
| 角色 | 患者级折叠后纳入主基线模型 |
| 测序平台 | 10x Chromium scRNA-seq |

**关键文件：**

| 文件 | 用途 |
|---|---|
| `GSE123813_bcc_all_metadata.txt.gz` | BCC 细胞级元数据 |
| `GSE123813_bcc_scRNA_counts.txt.gz` | BCC 表达矩阵 |
| `GSE123813_scc_metadata.txt.gz` | SCC 细胞级元数据 |
| `GSE123813_scc_scRNA_counts.txt.gz` | SCC 表达矩阵 |
| `SupplementaryTable.xlsx` | 样本级和病灶级临床补充表 |

**应答标签映射：** `Yes` / `Yes (CR)` → `Response`，`No` → `Non-response`

**清单规则（关键！）：**
- **强制执行患者级折叠**：依据 SupplementaryTable.xlsx 中的 Patient 列，将同一患者的多个病灶/样本聚合为单一患者级行（`analysis_unit = patient`）
- 折叠后必须标注 `include_main_analysis = True` 并进入 `manifest.tsv`
- 对于 `su010`（同时有 BCC 和 SCC 病灶），统一折叠为该患者的单一宏观基线特征
- `manifest_validation_report.tsv` 必须显式检查 GSE123813 路由正确性

### GSE241934 — 非小细胞肺癌（Zhang 2024，Cell Reports Medicine）

| 字段 | 内容 |
|---|---|
| 癌症类型 | NSCLC |
| 角色 | **仅用于治疗后机制分析** |
| 测序平台 | 10x Chromium scRNA-seq |

**关键文件：**

| 文件 | 用途 |
|---|---|
| `Cohort_IIT/GSE241934_IIT_*.{mtx,tsv,txt}.gz` | IIT 队列 |
| `Cohort_RWC/GSE241934_RWC_*.{mtx,tsv,txt}.gz` | RWC 队列 |
| `IIT_ClinicalInformtion.xlsx` | IIT 临床数据 |
| `RWC_ClinicalInformtion.xlsx.xlsx` | RWC 临床数据 |

**应答标签映射：** `Major Pathological Response` / `Pathological Complete Response` → `Response`，`non-Major Pathological Response` → `Non-response`

**清单规则：**
- 完全排除在基线预测之外（`include_main_analysis = False`）
- 只用于治疗后机制分析（`include_mechanism_analysis = True`）
- 同一病人多个样本在机制分析中也必须先折叠到 patient-level

## 数据集路由汇总

| 数据集 | 癌症类型 | 主基线 | 机制分析 | 备注 |
|---|---|---|---|---|
| EGAS00001004809 Cohort 1 | BC | 是 | 否 | 主基线队列 |
| EGAS00001004809 Cohort 2 | BC | 否 | 是 | 仅机制 |
| GSE236581 | CRC | 是 | 补充 | 移除十二指肠癌病例 |
| GSE269936 | 黑色素瘤 | 探索性 | 否 | 需严格筛选 PRE 样本 |
| GSE123813 | BCC/SCC | 是 | 否 | 强制患者级折叠 |
| GSE241934 | NSCLC | 否 | 是（治疗后） | 只用手术样本 |

## 步骤 1 — 清点原始文件

列出所有文件的路径、扩展名和大小，在决定加载哪些数据集之前先完整检查。

## 步骤 2 — 生成统一清单（Manifest）

清单是原始解析和全部下游分析之间的合同。每一个分析决策都必须先反映在清单字段里，再加载任何表达矩阵。

**清单核心字段：**

| 字段 | 含义 |
|---|---|
| `dataset_id` | 来源队列标识符 |
| `cancer_type` | 标准化癌症类型 |
| `subtype_unified` | 标准化亚型；CRC 强制归一为 `MSI` 或 `MSS` |
| `cancer_context` | `cancer_type__subtype_unified` |
| `patient_id` | 标准化病人标识符 |
| `sample_id` | 标准化样本标识符 |
| `lesion_id` | 病灶级行的病灶标识符；病人级行留空 |
| `analysis_unit` | `patient`、`lesion` 或 `sample` |
| `timepoint_unified` | `baseline`、`post_treatment`、`paired` |
| `response_binary` | `Response` 或 `Non-response` |
| `response_semantics` | `clinical_response` 或 `clonal_expansion_proxy` |
| `include_main_analysis` | 该行是否进入主基线模型 |
| `include_mechanism_analysis` | 该行是否进入机制分析 |
| `exclude_reason` | 排除原因 |
| `annotation_method` | `original_metadata` / `marker_rule_inference` / `de_novo_clustering` / `celltypist_transfer` |
| `response_tier` | `tier1_clinical` 或 `tier2_surrogate` |
| `treatment_state` | `PRE` / `ON` / `POST` |

## 步骤 3 — 校验清单

检查项：
- 主分析中的重复病人
- 基线泄漏（治疗后样本被标记为主分析）
- 已包含行中的缺失应答标签
- `GSE123813` 是否仍停留在病灶级
- `treatment_state` 严格验证：主分析行必须为 `PRE`
- `annotation_method` 和 `response_tier` 字段完整性

## 步骤 4a — 细胞层质控

- 按总 UMI 数过滤（设置上下截断值）
- 按检测到的基因数过滤
- 按线粒体基因比例过滤（通常 < 20–25%）
- 去除双联体（Scrublet 或 DoubletFinder）

## 步骤 4b — 归一化

- 归一化至每细胞 10,000 个计数后取 `log1p`
- 将归一化矩阵与原始计数矩阵分开存储
- **保留各数据集原始/归一化矩阵副本**（后续特征工程必须回到这些未整合矩阵）

## 步骤 4c — 高变基因选择

- 在数据集内部选取 2,000–5,000 个高变基因
- 从 HVG 选择中排除线粒体基因和核糖体基因
- 为全局整合准备批次平衡的 HVG 集合

## 癌症类型与亚型异质性处理

五个队列涵盖 BC、CRC、黑色素瘤、BCC/SCC、NSCLC。

- 所有跨数据集模型中必须保留 `cancer_context` 作为总协变量
- CRC 亚型必须优先使用微卫星稳定度统一为 `MSI` / `MSS`
- 其他癌种如元数据中存在亚型字段，必须标准化后写入 `subtype_unified`
- 在报告任何跨癌症结论之前，先做癌症类型分层的敏感性分析

## Deliverables（交付物清单）

| 交付物 | 路径 |
|---|---|
| 三套 manifest | `work/manifest/manifest.tsv`, `manifest_mechanism.tsv`, `manifest_all.tsv` |
| manifest 校验报告 | `work/manifest/manifest_validation_report.tsv` |
| 每数据集 QC'd .h5ad | `work/qc/{dataset_id}/` |
| QC 汇总统计 | `work/qc/qc_summary_all_datasets.tsv` |
| 清点报告 | `work/inventory/inventory.tsv` |

### 完成检查

- [ ] 所有 5 个数据集的表达矩阵已读取（非仅 metadata）
- [ ] 基因名已标准化为 HGNC Symbol，ACTA2/CD8A/PTPRC 断言通过
- [ ] GSE123813 已折叠到患者级并进入 manifest.tsv
- [ ] GSE241934 仅标记为机制分析
- [ ] manifest_validation_report.tsv 无 ERROR
- [ ] 每数据集 QC'd .h5ad 存在且保留了原始 counts 层

**完成后可暂停并回复用户，提示进入 Section 2。**
