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

## 数据集加载技术规范（强制执行）

以下规范基于实际文件格式验证。agent 生成加载脚本时**必须严格遵循**，不得自行推断文件格式。

### EGAS00001004809

**格式**：RDS 文件，内含 `dgCMatrix`（稀疏计数矩阵），**不是** Seurat 对象。`pyreadr` 无法读取，必须通过 R 转换或直接用 `scipy.sparse` 读取。

实际维度（已验证）：
- Cohort1 cells: 25,288 genes × 175,942 cells
- 列名格式: `BIOKEY_13_Pre_AAACCTGCAACAACCT-1`（含 patient_id + timepoint）
- 行名: HGNC gene symbols（如 `A1BG`, `A2M`）

**推荐加载方式**（Python）：

```python
import subprocess, tempfile, os, scipy.io, scipy.sparse
import anndata as ad, pandas as pd

def load_egas_cohort1():
    """通过 R 将 dgCMatrix RDS 转换为 scipy MTX + TSV，再用 scanpy 读取"""
    rds_path = "/tos-mlp-zgci/omics/EGAS00001004809/1863-counts_cells_cohort1.rds"
    tmp_dir = tempfile.mkdtemp(prefix="egas_c1_")
    r_script = f'''
    library(Matrix)
    mat <- readRDS("{rds_path}")
    writeMM(mat, file.path("{tmp_dir}", "matrix.mtx"))
    writeLines(rownames(mat), file.path("{tmp_dir}", "genes.tsv"))
    writeLines(colnames(mat), file.path("{tmp_dir}", "barcodes.tsv"))
    '''
    subprocess.run(["/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite/bin/Rscript",
                    "-e", r_script], check=True, timeout=300)
    adata = sc.read_mtx(os.path.join(tmp_dir, "matrix.mtx")).T  # 转置：MTX 为 (genes, cells)
    adata.var_names = pd.read_csv(os.path.join(tmp_dir, "genes.tsv"), header=None)[0].values
    adata.obs_names = pd.read_csv(os.path.join(tmp_dir, "barcodes.tsv"), header=None)[0].values
    # 从列名解析 patient_id 和 timepoint
    parts = adata.obs_names.str.extract(r'BIOKEY_(\d+)_(Pre|Post)_(.*)')
    adata.obs["patient_id"] = "BIOKEY_" + parts[0]
    adata.obs["timepoint_raw"] = parts[1]
    adata.obs["dataset_id"] = "EGAS00001004809_C1"
    # 合并 metadata
    meta = pd.read_csv("/tos-mlp-zgci/omics/EGAS00001004809/1872-BIOKEY_metaData_cohort1_web.csv")
    meta = meta.set_index("Cell")
    adata.obs = adata.obs.join(meta, how="left", rsuffix="_meta")
    return adata
```

Cohort2 同理，使用 `1867-counts_cells_cohort2.rds` 和 `1871-BIOKEY_metaData_cohort2_web.csv`。

**metadata 关键列**：`patient_id`, `timepoint`（Pre/Post）, `expansion`（E/NE 作为 response proxy）, `cellType`, `cohort`

### GSE236581（colon）

**格式**：10X MTX，但维度布局为 `(features × cells)` = `(36,027 × 975,275)`。barcodes 文件 975,275 行 = cells，features 文件 36,027 行 = genes。

**必须转置**：`sc.read_mtx()` 返回 `(features, cells)`，必须 `.T` 变为 `(cells, features)`。

```python
def load_colon():
    adata = sc.read_mtx("/tos-mlp-zgci/omics/colon/GSE236581_counts.mtx.gz").T  # 转置！
    barcodes = pd.read_csv("/tos-mlp-zgci/omics/colon/GSE236581_barcodes.tsv.gz", sep="\t", header=None)[0].values
    features = pd.read_csv("/tos-mlp-zgci/omics/colon/GSE236581_features.tsv.gz", sep="\t", header=None)
    adata.obs_names = barcodes  # 975,275 cells
    adata.var_names = features[1].values  # gene symbols
    adata.var_names_make_unique()
    # 从 barcode 解析 patient/sample: "CRC01-N-I_AAACGGGTCGTTACGA"
    parts = adata.obs_names.str.extract(r'(CRC\d+)-([NT])-(I|II|III|IV)_')
    adata.obs["patient_id"] = parts[0]
    adata.obs["tissue_type"] = parts[1].map({"N": "Normal", "T": "Tumor"})
    adata.obs["dataset_id"] = "GSE236581"
    return adata
```

### GSE123813（BCC/SCC）

**格式**：制表符分隔的计数矩阵，行为 genes、列为 cells。这种格式可被 `pd.read_csv` 直接读取。

**加载方式**：`adata = ad.AnnData(X=counts.T.values)`，`obs_names = counts.columns`（cells），`var_names = counts.index`（genes）。

无需转置，但 **必须** 转置 pd.DataFrame 的值到 AnnData（因为原文件是 gene × cell）。

### GSE241934（IIT/RWC）

**格式**：10X MTX，维度布局 `(features × cells)` = `(27,693 × N)`，必须转置。

实际维度（已验证）：
- IIT: `(27,693 × 78,691)` → 转置后 78,691 cells × 27,693 genes
- RWC: `(27,693 × 229,505)` → 转置后 229,505 cells × 27,693 genes

features 文件 3 列格式（Ensembl-style gene symbols）：`AL627309.1`, `FAM87B` 等。

```python
def load_gse241934_cohort(cohort_name):
    """cohort_name: 'IIT' 或 'RWC'"""
    prefix = f"/tos-mlp-zgci/omics/GSE241934/Cohort_{cohort_name}/GSE241934_{cohort_name if cohort_name == 'IIT' else 'Real'}"
    mtx_path = f"{prefix}_Matrix.mtx.gz"
    bc_path = f"/tos-mlp-zgci/omics/GSE241934/Cohort_{cohort_name}/GSE241934_{cohort_name}_barcodes.tsv.gz"
    feat_path = f"/tos-mlp-zgci/omics/GSE241934/Cohort_{cohort_name}/GSE241934_{cohort_name}_features.tsv.gz"

    adata = sc.read_mtx(mtx_path).T  # 转置！(features, cells) -> (cells, features)
    barcodes = pd.read_csv(bc_path, sep="\t", header=None)[0].values
    features = pd.read_csv(feat_path, sep="\t", header=None)
    adata.obs_names = barcodes
    adata.var_names = features[1].values  # 第2列为 gene symbol
    adata.var_names_make_unique()
    adata.obs["dataset_id"] = f"GSE241934_{cohort_name}"
    # 合并 metadata
    meta_path = f"/tos-mlp-zgci/omics/GSE241934/Cohort_{cohort_name}/GSE241934_{cohort_name if cohort_name == 'IIT' else cohort_name}_Meta.txt.gz"
    meta = pd.read_csv(meta_path, sep="\t")
    meta = meta.set_index(meta.columns[0])
    adata.obs = adata.obs.join(meta, how="left", rsuffix="_meta")
    return adata
```

**注意**：RWC 的 MTX 文件名为 `GSE241934_Real_Matrix.mtx.gz`，barcodes 为 `GSE241934_RWC_barcodes.tsv.gz`，注意前缀不一致。

### GSE269936

**格式**：38 个 10X 样本，每个样本独立目录（`GSM*_D*/` 下有 `matrix.mtx.gz`, `barcodes.tsv.gz`, `features.tsv.gz`）。

单个样本维度（已验证）：`(33,538 × 6,037)` = `(features × cells)`，必须转置。features 3 列格式：`ENSG00000243485  MIR1302-2HG  Gene Expression`，**必须使用第 2 列作为 gene symbol**。

sample title 格式为 `patientID_timepoint`（如 `926_1` = patient 926, timepoint 1），其中 `_1` = PRE，`_2`/`_3`/`_4`/`_5` = POST 或后续。

```python
def load_gse269936():
    """逐样本加载 GSE269936 的 38 个 10X 样本并合并"""
    raw_dir = Path("/tos-mlp-zgci/omics/GSE269936/GSE269936_RAW")
    adatas = []
    # 获取 sample title -> GSM ID 映射（从 series matrix 解析）
    sample_map = parse_gse269936_sample_titles()  # {GSM_ID: "patient_timepoint"}

    for sample_dir in sorted(raw_dir.glob("GSM*_D*")):
        sample_id = sample_dir.name.split("_")[0]  # GSM8330641
        mtx_file = list(sample_dir.glob("*_matrix.mtx.gz"))[0]
        bc_file = list(sample_dir.glob("*_barcodes.tsv.gz"))[0]
        feat_file = list(sample_dir.glob("*_features.tsv.gz"))[0]

        adata = sc.read_mtx(str(mtx_file)).T  # 转置！
        barcodes = pd.read_csv(str(bc_file), sep="\t", header=None)[0].values
        features = pd.read_csv(str(feat_file), sep="\t", header=None)
        adata.obs_names = barcodes
        adata.var_names = features[1].values  # gene symbol 列
        adata.var_names_make_unique()

        # 从 sample title 解析 patient 和 timepoint
        title = sample_map.get(sample_id, "")
        parts = title.rsplit("_", 1)
        adata.obs["patient_id"] = parts[0] if len(parts) == 2 else "unknown"
        adata.obs["timepoint_num"] = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else -1
        adata.obs["treatment_state"] = "PRE" if adata.obs["timepoint_num"].iloc[0] == 1 else "POST"
        adata.obs["sample_id"] = sample_id
        adata.obs["dataset_id"] = "GSE269936"
        adatas.append(adata)

    merged = ad.concat(adatas, join="outer", fill_value=0)
    merged.var_names_make_unique()
    return merged
```

**响应信息**：GSE269936 的 response 标签需要从论文 Supplementary Table 2（`41467_2025_62878_MOESM2_ESM.xlsx`）提取。若 xlsx 损坏无法读取，需从论文 PDF 或其他来源获取。

### MTX 加载通用规则

**所有 MTX 文件在加载时必须检查维度并正确转置**：

```python
adata = sc.read_mtx(mtx_path)
# 检查：barcodes 数量应该匹配 cells（obs）维度
n_barcodes = len(barcodes_df)
n_features = len(features_df)
if adata.shape[0] == n_features and adata.shape[1] == n_barcodes:
    # MTX 格式为 (features, cells)，需要转置
    adata = adata.T
elif adata.shape[0] == n_barcodes:
    # MTX 格式已经是 (cells, features)，不需要转置
    pass
else:
    raise ValueError(f"Dimension mismatch: MTX {adata.shape}, barcodes {n_barcodes}, features {n_features}")
```

本仓库涉及的所有 MTX 数据集（GSE236581、GSE241934、GSE269936）均为 `(features × cells)` 格式，**必须转置**。不得假设 `sc.read_mtx()` 返回 `(cells × features)`。

## 推荐执行顺序

### 步骤 1：清点原始文件

- 列出所有文件路径、扩展名、大小
- 先校验原始表达矩阵是否存在，再决定各数据集加载方式
- **必须参照上方「数据集加载技术规范」中的已验证维度和加载代码**

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
