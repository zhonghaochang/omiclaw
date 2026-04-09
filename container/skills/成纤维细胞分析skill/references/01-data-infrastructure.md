---
name: 01-data-infrastructure
description: Section 1：数据基建与路由。覆盖五个队列的原始数据读入、基础 QC、基因名标准化、manifest 路由、patient-level 主分析合同与 provenance 字段。
type: reference
---

# Section 1：数据基建与路由

## 概述

| 项 | 说明 |
|---|---|
| 读入 | 所有原始单细胞数据及临床 metadata |
| 处理 | 基础 QC -> 基因名标准化 -> 先做 manifest 路由与代表样本/病灶选择 -> 再生成 patient-level 主分析合同 |
| 输出 | QC 后独立 `.h5ad`、`manifest.tsv`、`manifest_mechanism.tsv`、`manifest_all.tsv`、`manifest_validation_report.tsv` |

**前置依赖**：`00-constraints.md`

## 本阶段必须先解决的结构问题

- 主分析在 manifest 阶段就确定唯一 patient-level 行
- `sample_id_main` 不再作为 Section 4 的临时修补逻辑；代表样本/病灶必须在 Section 1 明确选好
- manifest 必须同时承载 route flag 与 provenance 字段，后续只允许读取，不允许临时发明

## 数据集级路由规则

### EGAS00001004809

- Cohort 1：主基线队列
- Cohort 2：仅机制分析
- `E/NE` 只可标记为 `response_semantics = clonal_expansion_proxy`
- 缺失扩增标签的病人保留行，但 `include_main_analysis = False`

### GSE236581

- 主基线队列
- 只保留基线肿瘤样本
- 两例十二指肠癌病例排除：`exclude_reason = non_crc_case`
- 若每位病人只有单一基线样本，主分析输出直接为 `analysis_unit = patient`
- 该病人的原始样本写入 `source_sample_id`

### GSE269936

- 探索性基线队列
- 只保留 `treatment_state = PRE`
- 若一个病人存在多个 PRE 病灶或样本，必须先选择距离治疗开始最近的代表病灶
- manifest 主分析输出仍为 patient-level 行：
  - `analysis_unit = patient`
  - `source_analysis_unit = lesion`
  - `source_lesion_id = selected_pre_lesion`
- `annotation_method = marker_rule_inference`

### GSE123813

- 患者级折叠后纳入主基线模型
- 必须依据 SupplementaryTable 中的 patient 信息，先把同一患者的多个病灶/样本聚合为单一 patient-level 行
- 折叠后必须进入 `manifest.tsv`

### GSE241934

- 仅用于治疗后机制分析
- IIT 与 RWC 都必须先折叠到 patient-level
- `include_main_analysis = False`
- `include_mechanism_analysis = True`
- **`GSE241934_RWC` 在进入 QC cache 或后续 Section 前，必须先通过 gene-axis 审计**
- 若 `var_names` 主要为纯数字列名，必须回到原始 `MTX + features/barcodes` 重新构建对象，并恢复标准 gene symbol
- 若完成标准化后仍不能通过 `ACTA2/CD8A/PTPRC` 核心 marker 断言，必须立刻阻断，不得继续 atlas、annotation、feature 或 mechanism

## Manifest 核心字段

| 字段 | 含义 |
|---|---|
| `dataset_id` | 来源队列标识 |
| `patient_id` | 标准化病人标识 |
| `sample_id` | 标准化样本标识 |
| `lesion_id` | 原始病灶标识 |
| `analysis_unit` | `patient` / `sample` / `lesion` |
| `source_analysis_unit` | 代表主分析行来源的原始层级 |
| `source_sample_id` | 代表主分析行的样本 ID |
| `source_lesion_id` | 代表主分析行的病灶 ID |
| `timepoint_unified` | `baseline` / `post_treatment` / `paired` |
| `treatment_state` | `PRE` / `ON` / `POST` |
| `response_binary` | `Response` / `Non-response` |
| `response_semantics` | `clinical_response` / `clonal_expansion_proxy` |
| `response_tier` | `tier1_clinical` / `tier2_surrogate` |
| `annotation_method` | 注释来源 |
| `include_main_analysis` | 是否进入主基线模型 |
| `include_mechanism_analysis` | 是否进入机制分析 |
| `exclude_reason` | 排除原因 |

## 推荐执行顺序

### 步骤 1：清点原始文件

- 列出所有文件路径、扩展名、大小
- 先校验原始表达矩阵是否存在，再决定各数据集加载方式

### 步骤 2：临床 routing 表预构建

- 在加载表达矩阵之前，先从补充表 / clinical metadata 构建临时 routing 表
- 先决定：
  - 主分析/机制分析/排除
  - `response_binary`
  - `response_semantics`
  - `response_tier`
  - 代表样本/病灶选择逻辑

### 步骤 3：表达矩阵读入与基础 QC

- 读取表达矩阵
- 进行 gene symbol 标准化
- 做基础 QC、双联体过滤、归一化
- 保存原始 counts 与 `lognorm`

对 `GSE241934_RWC` 额外强制执行：

- 读取 `MTX` 后，必须立刻核对基因轴是否来自对应 `features.tsv` / `genes.tsv`
- 若 `adata.var_names` 呈现 `0/1/2/...` 纯数字模式，不得写出 QC cache；必须先完成 gene symbol 恢复
- 任何复用的 `GSE241934_RWC` QC cache 在正式使用前，必须重新检查：
  - `numeric_var_frac <= 0.10`
  - `ACTA2`、`CD8A`、`PTPRC` 至少一组核心 marker 可命中
  - 不满足任一条件都必须 `ERROR: Gene_Symbol_Alignment_Failed`
- 不允许把“marker 匹配不到时写 `NaN`”当作容错；这属于上游数据对象失效，不是可接受缺失

### 步骤 4：生成正式 manifest

- 将临床 routing、QC 保留对象、patient/sample/lesion 映射合并成三套 manifest：
  - `manifest.tsv`：主分析 patient-level
  - `manifest_mechanism.tsv`：机制分析 patient-level
  - `manifest_all.tsv`：全量路由总表
- 正式 manifest 一旦写出，后续只允许读取，不允许在 Section 4 再临时决定代表样本/病灶

### 步骤 5：Manifest 校验

必须检查：
- 主分析任一行 `analysis_unit != patient`
- 主分析是否存在重复 `dataset_id + patient_id`
- 主分析是否混入 `ON` / `POST`
- 主分析是否缺失 `response_binary`
- `source_sample_id/source_lesion_id` 是否为空且无解释
- `GSE123813` 是否已进入 `manifest.tsv`
- `GSE241934` 是否只出现在机制分析
- `GSE241934_RWC` 的 QC 对象是否通过 gene-axis 审计；若 `var_names` 为数字轴或核心 marker 缺失，必须在 Section 1 直接失败

## 强制作图

| 图名 | 目的 |
|---|---|
| `Fig_S1_cohort_routing_flow` | 展示五个队列如何进入主分析、机制分析或排除 |
| `Fig_S1b_response_semantics_composition` | 展示 `clinical_response` 与 `clonal_expansion_proxy` 的构成与占比 |

每张图都必须同步交付：`pdf`、`png`、`*_source_data.tsv`、`*_caption.md`

## Deliverables

| 交付物 | 路径 |
|---|---|
| 三套 manifest | `work/manifest/manifest.tsv`, `manifest_mechanism.tsv`, `manifest_all.tsv` |
| manifest 校验报告 | `work/manifest/manifest_validation_report.tsv` |
| route 审计摘要 | `work/manifest/manifest_route_summary.tsv` |
| 每数据集 QC'd `.h5ad` | `work/qc/{dataset_id}/` |
| gene-axis 审计表 | `work/qc/qc_gene_axis_audit.tsv` |
| QC 汇总统计 | `work/qc/qc_summary_all_datasets.tsv` |
| 清点报告 | `work/inventory/inventory.tsv` |
| Section 1 图包 | `work/figures/supplementary/Fig_S1*` |

## 完成检查

- [ ] 所有 5 个数据集的表达矩阵已读取
- [ ] 基因名已标准化为 HGNC Symbol，ACTA2/CD8A/PTPRC 断言通过
- [ ] `GSE241934_RWC` 未携带纯数字 gene axis 进入 QC cache
- [ ] 主分析所有行 `analysis_unit = patient`
- [ ] 主分析每位病人有唯一 `source_sample_id` 或 `source_lesion_id`
- [ ] `GSE123813` 已折叠到患者级并进入 `manifest.tsv`
- [ ] `GSE241934` 只出现在 `manifest_mechanism.tsv`
- [ ] `Fig_S1` 与 `Fig_S1b` 已生成
