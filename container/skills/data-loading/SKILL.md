---
name: data-loading
description: Load single-cell RNA-seq data from various formats and sources into AnnData objects for analysis with scanpy.
---

# Data Loading

## When to Use

Use these skills when you need to:
- Load 10x Genomics output files (h5, mtx, h5ad)
- Convert between single-cell data formats (h5ad, loom, csv, Seurat)
- Download public reference datasets for benchmarking or tutorials

## Sub-Skills

| Sub-Skill | Description | Key Functions |
|-----------|-------------|---------------|
| [tenx-loading](tenx-loading/SKILL.md) | Load 10x Genomics h5, mtx, h5ad, and loom files | `sc.read_10x_h5`, `sc.read_10x_mtx`, `sc.read_h5ad`, `sc.read_loom` |
| [format-conversion](format-conversion/SKILL.md) | Convert between h5ad, loom, csv, and Seurat formats; AnnData structure reference | `adata.write()`, `adata.write_loom()`, AnnData slots |
| [public-datasets](public-datasets/SKILL.md) | Download PBMC3k, Tabula Muris, cellxgene census datasets | `sc.datasets.pbmc3k()`, `cellxgene_census` |

## Python Environment

```bash
${CONDA_ENV_PATH}/bin/python
```

## Quick Start

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
import matplotlib; matplotlib.use("Agg")
import scanpy as sc

# Load the most common format: h5ad
adata = sc.read_h5ad("/path/to/data.h5ad")
print(f"Loaded: {adata.n_obs} cells x {adata.n_vars} genes")
print(adata)
```

## Output Directory

All outputs (figures, processed data) should be saved to:

```
/workspace/group/
```
