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

## 硬性执行规则

1. **所有 5 个数据集必须全部加载成功。** 不允许以任何理由跳过、放弃或降级任何数据集。
2. **禁止以"数据量过大""内存不足""计算能力不足"为由跳过任何数据集。** 当前服务器环境有足够内存和存储处理 ~200 万细胞的全部数据。
3. **若某个数据集加载失败，必须诊断根因并修复代码后重试，不得 fallback 到子集或直接跳过。**
4. **以下所有代码规范是强制性的，不是建议性的。** agent 必须严格使用指定的函数、列名、文件路径和转置逻辑，不得自行推断或改写。
5. **每个数据集加载完成后，必须立即验证：** (a) 细胞数与已知维度匹配；(b) `ACTA2`、`PTPRC` 在 `var_names` 中可命中。验证失败必须报错阻断。

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

以下规范基于实际文件格式验证。agent 生成加载脚本时**必须严格遵循**，不得自行推断文件格式、列名或维度。

### MTX 加载通用规则（所有 MTX 数据集必须先读这段）

**本仓库中所有 MTX 文件均为 `(features × cells)` 格式。`sc.read_mtx()` 返回的就是这个布局。必须转置为 `(cells × features)` 后再赋值 obs_names 和 var_names。**

强制流程：

```python
# 步骤 1: 读取 MTX
adata = sc.read_mtx(mtx_path)

# 步骤 2: 读取 barcodes 和 features
barcodes = pd.read_csv(bc_path, sep="\t", header=None)[0].values
features = pd.read_csv(feat_path, sep="\t", header=None)

# 步骤 3: 确定哪一列是 gene symbol
# - 2列 features 文件: 第2列(index 1)是 gene symbol
# - 3列 features 文件: 第2列(index 1)是 gene symbol，第1列可能是 Ensembl ID
gene_symbols = features[1].values

# 步骤 4: 验证维度并转置
n_barcodes = len(barcodes)   # = 细胞数
n_features = len(gene_symbols)  # = 基因数
if adata.shape == (n_features, n_barcodes):
    adata = adata.T  # 转置！(features, cells) -> (cells, features)
elif adata.shape == (n_barcodes, n_features):
    pass  # 已经正确
else:
    raise ValueError(f"Dimension mismatch: MTX {adata.shape}, expected ({n_features}, {n_barcodes})")

# 步骤 5: 赋值
adata.obs_names = barcodes
adata.var_names = gene_symbols
adata.var_names_make_unique()

# 步骤 6: 验证核心 marker
for marker in ["ACTA2", "PTPRC", "CD8A"]:
    if marker in adata.var_names:
        pass  # OK
    else:
        logger.warning(f"Core marker {marker} not found after loading")
```

### EGAS00001004809

**格式**：RDS 文件，内含 `dgCMatrix`（稀疏计数矩阵），**不是** Seurat 对象。`pyreadr` 无法读取（会报 `unrecognized object`），必须通过 R 导出。

**已验证维度**：
- Cohort1: 25,288 genes × 175,942 cells
- Cohort2: 25,154 genes × 50,683 cells
- 列名格式: `BIOKEY_13_Pre_AAACCTGCAACAACCT-1`
- 行名: HGNC gene symbols（如 `A1BG`, `A2M`）

**metadata 文件与关键列名（已验证）**：

| 文件 | 关键列 |
|------|--------|
| `1872-BIOKEY_metaData_cohort1_web.csv` | `Cell`（cell ID，作为 index）, `patient_id`, `timepoint`（Pre/Post）, `expansion`（E/NE）, `cellType`, `cohort` |
| `1871-BIOKEY_metaData_cohort2_web.csv` | 同上 |

**强制加载代码**：

```python
import subprocess, tempfile, os
import scanpy as sc, pandas as pd

def load_egas_cohort(cohort_num):
    """
    cohort_num: 1 或 2
    通过 R 将 dgCMatrix RDS 转换为 MTX + TSV，再用 scanpy 读取
    """
    rds_map = {
        1: "/tos-mlp-zgci/omics/EGAS00001004809/1863-counts_cells_cohort1.rds",
        2: "/tos-mlp-zgci/omics/EGAS00001004809/1867-counts_cells_cohort2.rds",
    }
    meta_map = {
        1: "/tos-mlp-zgci/omics/EGAS00001004809/1872-BIOKEY_metaData_cohort1_web.csv",
        2: "/tos-mlp-zgci/omics/EGAS00001004809/1871-BIOKEY_metaData_cohort2_web.csv",
    }
    rds_path = rds_map[cohort_num]
    meta_path = meta_map[cohort_num]
    tmp_dir = tempfile.mkdtemp(prefix=f"egas_c{cohort_num}_")

    r_script = f'''
    library(Matrix)
    mat <- readRDS("{rds_path}")
    writeMM(mat, file.path("{tmp_dir}", "matrix.mtx"))
    writeLines(rownames(mat), file.path("{tmp_dir}", "genes.tsv"))
    writeLines(colnames(mat), file.path("{tmp_dir}", "barcodes.tsv"))
    '''
    subprocess.run(
        ["/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw-r-upstream-lite/bin/Rscript",
         "-e", r_script],
        check=True, timeout=600
    )

    # R writeMM 输出 (genes, cells) 格式的 MTX，需要转置
    adata = sc.read_mtx(os.path.join(tmp_dir, "matrix.mtx")).T
    adata.var_names = pd.read_csv(os.path.join(tmp_dir, "genes.tsv"), header=None)[0].values
    adata.obs_names = pd.read_csv(os.path.join(tmp_dir, "barcodes.tsv"), header=None)[0].values
    adata.obs["dataset_id"] = f"EGAS00001004809_C{cohort_num}"

    # 合并 metadata — 注意 index 列名是 "Cell"
    meta = pd.read_csv(meta_path, index_col="Cell")
    adata.obs = adata.obs.join(meta, how="left", rsuffix="_meta")

    # 验证
    assert adata.n_obs in [175942, 50683], f"EGAS C{cohort_num} cell count unexpected: {adata.n_obs}"
    logger.info(f"EGAS C{cohort_num}: {adata.n_obs} cells x {adata.n_vars} genes")
    return adata
```

### GSE236581（colon）

**格式**：10X MTX，`(features × cells)` = `(36,027 × 975,275)`。

**已验证维度**：975,275 cells × 36,027 genes。这是本项目中最大的数据集，**完全可以处理，禁止跳过**。

**barcode 格式**：`CRC01-N-I_AAACGGGTCGTTACGA`（`{patient}-{tissue_type}-{stage}_{10x_barcode}`）

**metadata 来源**：`GSE236581_series_matrix.txt.gz`，barcode 本身包含 patient 和 tissue type 信息。

**强制加载代码**：

```python
def load_colon():
    adata = sc.read_mtx("/tos-mlp-zgci/omics/colon/GSE236581_counts.mtx.gz").T  # 转置！
    barcodes = pd.read_csv("/tos-mlp-zgci/omics/colon/GSE236581_barcodes.tsv.gz",
                           sep="\t", header=None)[0].values
    features = pd.read_csv("/tos-mlp-zgci/omics/colon/GSE236581_features.tsv.gz",
                           sep="\t", header=None)
    adata.obs_names = barcodes   # 975,275 cells
    adata.var_names = features[1].values  # gene symbols（第2列）
    adata.var_names_make_unique()
    adata.obs["dataset_id"] = "GSE236581"

    # 从 barcode 解析 patient/sample: "CRC01-N-I_AAACGGGTCGTTACGA"
    parts = adata.obs_names.str.extract(r'(CRC\d+)-([NT])-(I+)_')
    adata.obs["patient_id"] = parts[0]
    adata.obs["tissue_type"] = parts[1].map({"N": "Normal", "T": "Tumor"})
    adata.obs["tumor_stage"] = parts[2]

    # 验证
    assert adata.n_obs == 975275, f"Colon cell count unexpected: {adata.n_obs}"
    logger.info(f"Colon: {adata.n_obs} cells x {adata.n_vars} genes")
    return adata
```

### GSE123813（BCC/SCC）

**格式**：制表符分隔的计数矩阵，文件中行为 genes（index）、列为 cells（columns）。

**已验证维度**：
- BCC counts: 53,030 cells × 23,309 genes
- SCC counts: 26,016 cells × 18,347 genes

**metadata 文件与关键列名（已验证，禁止搞错）**：

| 文件 | 列名 |
|------|------|
| `GSE123813_bcc_scRNA_counts.txt.gz` | index=genes, columns=cell IDs（格式 `bcc.su001.pre.tcell_AAACCTGCAGATCGGA`） |
| `GSE123813_scc_scRNA_counts.txt.gz` | index=genes, columns=cell IDs（格式 `scc.su010.post_AAACCTGAGACAAAGG`） |
| `GSE123813_bcc_all_metadata.txt.gz` | **`cell.id`**（不是 `Cell`！）, `patient`, `treatment`, `sort`, `cluster`, `UMAP1`, `UMAP2` |
| `GSE123813_scc_metadata.txt.gz` | **`cell.id`**（不是 `Cell`！）, `patient`, `treatment`, `cluster`, `UMAP1`, `UMAP2` |
| `SupplementaryTable.xlsx` | header 在第 4 行（`skiprows=3`）。列: `Patient`, `Tumor Type`, `Treatment`, `Response`（Yes/No/Yes (CR)）, `Best % change` |

**cell ID 命名规则**：
- BCC: `bcc.{patient}.{pre/post}.{compartment}_{barcode}`
- SCC: `scc.{patient}.{pre/post}_{barcode}`

**Response 映射**（从 SupplementaryTable）：
- `Response` 列为 `Yes` 或 `Yes (CR)` → `response_binary = Response`
- `Response` 列为 `No` → `response_binary = Non-response`

**强制加载代码**：

```python
def load_gse123813():
    # 加载 BCC
    bcc_counts = pd.read_csv("/tos-mlp-zgci/omics/GSE123813/GSE123813_bcc_scRNA_counts.txt.gz",
                             sep="\t", index_col=0)
    bcc = ad.AnnData(X=bcc_counts.T.values)
    bcc.obs_names = bcc_counts.columns
    bcc.var_names = bcc_counts.index.str.upper()
    bcc.var_names_make_unique()
    bcc.obs["dataset_id"] = "GSE123813_BCC"
    bcc.obs["cancer_type"] = "BCC"

    # 加载 SCC
    scc_counts = pd.read_csv("/tos-mlp-zgci/omics/GSE123813/GSE123813_scc_scRNA_counts.txt.gz",
                             sep="\t", index_col=0)
    scc = ad.AnnData(X=scc_counts.T.values)
    scc.obs_names = scc_counts.columns
    scc.var_names = scc_counts.index.str.upper()
    scc.var_names_make_unique()
    scc.obs["dataset_id"] = "GSE123813_SCC"
    scc.obs["cancer_type"] = "SCC"

    # 合并 metadata — 注意列名是 "cell.id"，不是 "Cell"
    bcc_meta = pd.read_csv("/tos-mlp-zgci/omics/GSE123813/GSE123813_bcc_all_metadata.txt.gz",
                           sep="\t", index_col="cell.id")
    bcc.obs = bcc.obs.join(bcc_meta, how="left", rsuffix="_meta")

    scc_meta = pd.read_csv("/tos-mlp-zgci/omics/GSE123813/GSE123813_scc_metadata.txt.gz",
                           sep="\t", index_col="cell.id")
    scc.obs = scc.obs.join(scc_meta, how="left", rsuffix="_meta")

    # 加载临床 response 信息
    clinical = pd.read_excel("/tos-mlp-zgci/omics/GSE123813/SupplementaryTable.xlsx",
                             skiprows=3, nrows=20)
    clinical.columns = clinical.iloc[0]
    clinical = clinical[1:]
    response_map = dict(zip(
        clinical["Patient"],
        clinical["Response"].map(lambda x: "Response" if str(x).startswith("Yes") else "Non-response")
    ))

    for adata in [bcc, scc]:
        adata.obs["response_binary"] = adata.obs["patient"].map(response_map)
        # 从 cell ID 解析 timepoint
        tp = adata.obs_names.str.extract(r'\.(pre|post)[.\-_]', flags=re.IGNORECASE)[0]
        adata.obs["treatment_state"] = tp.str.upper().map({"PRE": "PRE", "POST": "POST"})

    logger.info(f"BCC: {bcc.n_obs} cells, SCC: {scc.n_obs} cells")
    return bcc, scc
```

### GSE241934（IIT/RWC）

**格式**：10X MTX，`(features × cells)` 格式，必须转置。

**已验证维度**：
- IIT: `(27,693 × 78,691)` → 转置后 78,691 cells × 27,693 genes
- RWC: `(27,693 × 229,505)` → 转置后 229,505 cells × 27,693 genes

**文件路径注意**（前缀命名不一致）：

| | MTX 文件 | barcodes 文件 | features 文件 | metadata 文件 |
|---|---|---|---|---|
| IIT | `GSE241934_IIT_Matrix.mtx.gz` | `GSE241934_IIT_barcodes.tsv.gz` | `GSE241934_IIT_features.tsv.gz` | `GSE241934_IIT_Meta.txt.gz` |
| RWC | `GSE241934_Real_Matrix.mtx.gz` | `GSE241934_RWC_barcodes.tsv.gz` | `GSE241934_RWC_features.tsv.gz` | `GSE241934_RWC_Meta.txt.gz`（实际文件名需确认） |

**features 文件 3 列**：`AL627309.1  AL627309.1  Gene Expression`，使用第 2 列（index=1）作为 gene symbol。

**metadata 文件格式**：Tab 分隔，第一列为 cell ID（自动作为 index）。

**gene-axis audit**：在加载并转置后，检查 `var_names` 中数字比例。features 文件第 2 列已经是 gene symbol，转置后 `var_names` 应该全是字母开头的 gene symbol，不会出现数字轴。如果出现，说明转置搞错了。

**强制加载代码**：

```python
def load_gse241934():
    datasets = {}
    for cohort, mtx_name in [("IIT", "IIT"), ("RWC", "Real")]:
        base = f"/tos-mlp-zgci/omics/GSE241934/Cohort_{cohort}"
        adata = sc.read_mtx(f"{base}/GSE241934_{mtx_name}_Matrix.mtx.gz").T  # 转置！

        barcodes = pd.read_csv(f"{base}/GSE241934_{cohort}_barcodes.tsv.gz",
                               sep="\t", header=None)[0].values
        features = pd.read_csv(f"{base}/GSE241934_{cohort}_features.tsv.gz",
                               sep="\t", header=None)

        adata.obs_names = barcodes
        adata.var_names = features[1].values  # 第2列是 gene symbol
        adata.var_names_make_unique()
        adata.obs["dataset_id"] = f"GSE241934_{cohort}"

        # 合并 metadata — 第一列作为 index
        meta_files = {
            "IIT": f"{base}/GSE241934_IIT_Meta.txt.gz",
            "RWC": f"{base}/GSE241934_RWC_Meta.txt.gz",
        }
        meta_path = meta_files[cohort]
        if os.path.exists(meta_path):
            meta = pd.read_csv(meta_path, sep="\t", index_col=0)
            adata.obs = adata.obs.join(meta, how="left", rsuffix="_meta")

        # Gene-axis audit
        numeric_frac = sum(v[0].isdigit() for v in adata.var_names[:100]) / 100
        if numeric_frac > 0.5:
            raise RuntimeError(f"GSE241934_{cohort}: gene axis appears numeric ({numeric_frac:.0%}), transpose or features mismatch")

        logger.info(f"GSE241934_{cohort}: {adata.n_obs} cells x {adata.n_vars} genes")
        datasets[cohort] = adata

    return datasets["IIT"], datasets["RWC"]
```

### GSE269936

**格式**：38 个独立 10X 样本，每个在 `GSE269936_RAW/GSM*_D*/` 目录下。单个样本 `(features × cells)` = `(33,538 × ~6,000)`，**总细胞数 321,289**。

**已验证**：
- features 3 列：`ENSG00000243485  MIR1302-2HG  Gene Expression`，**必须使用第 2 列（index=1）作为 gene symbol**
- sample title 格式：`{patientID}_{timepoint}`（如 `926_1` = patient 926, timepoint 1）
- `_1` = PRE（基线），`_2`/`_3`/`_4`/`_5` = POST（治疗后）

**sample title 与 GSM ID 映射**：从 `GSE269936_series_matrix.txt.gz` 的 `!Sample_title` 和 `!Sample_geo_accession` 行解析。

**response 标签**：`41467_2025_62878_MOESM2_ESM.xlsx` 可能损坏无法读取。若无法读取，从论文 PDF `Yang 2025 Nature Com.pdf` 或其他来源获取，或标记为 `response_unknown`。

**强制加载代码**：

```python
import gzip, re
from pathlib import Path

def parse_gse269936_sample_titles():
    """从 series matrix 解析 {GSM_ID: sample_title} 映射"""
    titles = {}
    with gzip.open("/tos-mlp-zgci/omics/GSE269936/GSE269936_series_matrix.txt.gz", "rt") as f:
        sample_ids = None
        for line in f:
            if line.startswith("!Sample_geo_accession"):
                sample_ids = line.strip().split("\t")[1:]
                sample_ids = [s.strip('"') for s in sample_ids]
            elif line.startswith("!Sample_title") and sample_ids:
                title_vals = line.strip().split("\t")[1:]
                title_vals = [t.strip('"') for t in title_vals]
                titles = dict(zip(sample_ids, title_vals))
                break
    return titles

def load_gse269936():
    raw_dir = Path("/tos-mlp-zgci/omics/GSE269936/GSE269936_RAW")
    sample_map = parse_gse269936_sample_titles()
    adatas = []
    total_cells = 0

    for sample_dir in sorted(raw_dir.glob("GSM*_D*")):
        gsm_id = sample_dir.name.split("_")[0]  # e.g. GSM8330641
        mtx_files = list(sample_dir.glob("*_matrix.mtx.gz"))
        if not mtx_files:
            continue
        mtx_file = mtx_files[0]
        bc_file = list(sample_dir.glob("*_barcodes.tsv.gz"))[0]
        feat_file = list(sample_dir.glob("*_features.tsv.gz"))[0]

        adata = sc.read_mtx(str(mtx_file)).T  # 转置！
        barcodes = pd.read_csv(str(bc_file), sep="\t", header=None)[0].values
        features = pd.read_csv(str(feat_file), sep="\t", header=None)
        adata.obs_names = barcodes
        adata.var_names = features[1].values  # gene symbol 列
        adata.var_names_make_unique()

        # 从 sample title 解析 patient 和 timepoint
        title = sample_map.get(gsm_id, "")
        parts = title.rsplit("_", 1)
        patient_id = parts[0] if len(parts) == 2 else "unknown"
        tp_num = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else -1

        adata.obs["patient_id"] = patient_id
        adata.obs["sample_id"] = gsm_id
        adata.obs["treatment_state"] = "PRE" if tp_num == 1 else "POST"
        adata.obs["dataset_id"] = "GSE269936"
        total_cells += adata.n_obs
        adatas.append(adata)

    merged = ad.concat(adatas, join="outer", fill_value=0)
    merged.var_names_make_unique()

    # 验证
    logger.info(f"GSE269936: {len(adatas)} samples, {merged.n_obs} cells (expected ~321,289)")
    return merged
```

## 各数据集预期细胞数汇总（加载后必须核对）

| 数据集 | 预期细胞数 | 基因数 | 路由 |
|--------|-----------|--------|------|
| EGAS00001004809_C1 | 175,942 | 25,288 | 主分析 |
| EGAS00001004809_C2 | 50,683 | 25,154 | 机制分析 |
| GSE236581 (colon) | **975,275** | 36,027 | 主分析 |
| GSE123813_BCC | 53,030 | 23,309 | 主分析 |
| GSE123813_SCC | 26,016 | 18,347 | 主分析 |
| GSE241934_IIT | 78,691 | 27,693 | 机制分析 |
| GSE241934_RWC | 229,505 | 27,693 | 机制分析 |
| GSE269936 | **321,289** | ~33,538 | 主分析 |
| **合计** | **~1,910,431** | | |

## 推荐执行顺序

### 步骤 1：清点原始文件

- 列出所有文件路径、扩展名、大小
- 先校验原始表达矩阵是否存在，再决定各数据集加载方式
- **必须严格使用上方「数据集加载技术规范」中的强制加载代码，不得自行改写**

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
- 不允许把"marker 匹配不到时写 `NaN`"当作容错；这属于上游数据对象失效，不是可接受缺失

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

- [ ] 所有 5 个数据集的表达矩阵已读取（共 ~190 万细胞）
- [ ] 每个数据集细胞数与「预期细胞数汇总」表一致
- [ ] 基因名已标准化为 HGNC Symbol，ACTA2/CD8A/PTPRC 断言通过
- [ ] `GSE241934_RWC` 未携带纯数字 gene axis 进入 QC cache
- [ ] 主分析所有行 `analysis_unit = patient`
- [ ] 主分析每位病人有唯一 `source_sample_id` 或 `source_lesion_id`
- [ ] `GSE123813` 已折叠到患者级并进入 `manifest.tsv`
- [ ] `GSE241934` 只出现在 `manifest_mechanism.tsv`
- [ ] `Fig_S1` 与 `Fig_S1b` 已生成
