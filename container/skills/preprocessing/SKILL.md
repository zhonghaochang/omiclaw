---
name: preprocessing
description: Single-cell RNA-seq preprocessing pipeline including QC, doublet detection, ambient RNA removal, normalization, feature selection, and dimensionality reduction.
---

# Preprocessing

## When to Use

Use these skills after loading raw single-cell data and before clustering/analysis. Preprocessing is essential for removing technical artifacts and preparing data for biological interpretation.

## Recommended Pipeline Order

```
Raw counts
  |
  v
1. Quality Control         -- Remove low-quality cells and genes
  |
  v
2. Doublet Detection       -- Identify and remove doublets
  |
  v
3. Ambient RNA Removal     -- (Optional) Remove background contamination
  |
  v
4. Normalization           -- Scale counts for comparability
  |
  v
5. Feature Selection       -- Select highly variable genes
  |
  v
6. Dimensionality Reduction -- PCA, neighbor graph, UMAP
  |
  v
Ready for clustering
```

## Sub-Skills

| Sub-Skill | Description | Key Functions |
|-----------|-------------|---------------|
| [quality-control](quality-control/SKILL.md) | Filter cells/genes by QC metrics, MAD-based outlier detection | `sc.pp.calculate_qc_metrics`, `sc.pp.filter_cells`, `sc.pp.filter_genes` |
| [doublet-detection](doublet-detection/SKILL.md) | Detect doublets with Scrublet or SOLO (scvi-tools) | `scrublet.Scrublet`, `scvi.external.SOLO` |
| [ambient-rna](ambient-rna/SKILL.md) | Remove ambient RNA contamination (SoupX, CellBender) | SoupX (R), CellBender (CLI) |
| [normalization](normalization/SKILL.md) | Normalize counts: total-count, scran, Pearson residuals | `sc.pp.normalize_total`, `sc.pp.log1p`, `sc.experimental.pp.normalize_pearson_residuals` |
| [feature-selection](feature-selection/SKILL.md) | Select highly variable genes across flavors | `sc.pp.highly_variable_genes` |
| [dimensionality-reduction](dimensionality-reduction/SKILL.md) | PCA, neighbor graph, UMAP, t-SNE | `sc.tl.pca`, `sc.pp.neighbors`, `sc.tl.umap` |

## Python Environment

```bash
${CONDA_ENV_PATH}/bin/python
```

## Quick Full Pipeline

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
import matplotlib; matplotlib.use("Agg")
import scanpy as sc

adata = sc.read_h5ad("/path/to/raw.h5ad")

# QC
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()

# Store raw counts
adata.layers["counts"] = adata.X.copy()

# Normalize
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# Feature selection
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

# Dimensionality reduction
sc.tl.pca(adata, n_comps=50, use_highly_variable=True)
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)

adata.write("/workspace/group/preprocessed.h5ad")
```

## Output Directory

All outputs should be saved to `/workspace/group/`.
