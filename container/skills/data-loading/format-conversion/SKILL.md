# Format Conversion and AnnData Structure

## When to Use

Use this skill when you need to:
- Convert single-cell data between formats (h5ad, loom, csv, Seurat RDS)
- Understand the AnnData object structure (obs, var, X, layers, obsm, uns)
- Export data for use in R/Seurat or other tools

## Prerequisites

All packages are pre-installed:
- `scanpy`, `anndata`
- `pandas`, `numpy`, `scipy`
- `loompy` (for loom format)

## AnnData Structure Reference

```
AnnData object
 ├── .X          # Main data matrix (cells x genes), sparse or dense
 ├── .obs        # DataFrame: cell metadata (n_obs x n_obs_fields)
 │    ├── index  # Cell barcodes / IDs
 │    ├── ...    # e.g., cell_type, sample, n_genes, pct_counts_mt
 ├── .var        # DataFrame: gene metadata (n_vars x n_var_fields)
 │    ├── index  # Gene names
 │    ├── ...    # e.g., gene_ids, highly_variable, means, dispersions
 ├── .obsm       # Dict of arrays: cell embeddings (PCA, UMAP, etc.)
 │    ├── "X_pca"   # PCA coordinates
 │    ├── "X_umap"  # UMAP coordinates
 ├── .varm       # Dict of arrays: gene-level embeddings (PCA loadings)
 ├── .layers     # Dict of matrices: alternative data representations
 │    ├── "raw_counts"  # Raw count matrix
 │    ├── "spliced"     # Spliced counts (RNA velocity)
 ├── .obsp       # Dict of sparse matrices: cell-cell relationships
 │    ├── "connectivities"  # Neighbor graph
 │    ├── "distances"       # Distance matrix
 ├── .uns        # Unstructured dict: misc metadata, color palettes, etc.
 │    ├── "leiden"     # Clustering parameters
 │    ├── "umap"       # UMAP parameters
 └── .raw        # Frozen copy of adata before filtering genes
```

## Script 1: AnnData Basics -- Inspect and Manipulate

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Demonstrate AnnData structure and basic operations."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import anndata as ad
import numpy as np
import pandas as pd
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load example data ---
print("Loading PBMC3k dataset...")
adata = sc.datasets.pbmc3k_processed()
print(f"Shape: {adata.n_obs} cells x {adata.n_vars} genes\n")

# --- Inspect each slot ---
print("=== .X (main matrix) ===")
print(f"  Type: {type(adata.X)}, dtype: {adata.X.dtype}")
print(f"  Shape: {adata.X.shape}")

print("\n=== .obs (cell metadata) ===")
print(f"  Columns: {list(adata.obs.columns)}")
print(adata.obs.head(3))

print("\n=== .var (gene metadata) ===")
print(f"  Columns: {list(adata.var.columns)}")
print(adata.var.head(3))

print("\n=== .obsm (embeddings) ===")
for key, val in adata.obsm.items():
    print(f"  {key}: shape {val.shape}")

print("\n=== .layers ===")
for key, val in adata.layers.items():
    print(f"  {key}: shape {val.shape}")

print("\n=== .obsp (cell-cell graphs) ===")
for key, val in adata.obsp.items():
    print(f"  {key}: shape {val.shape}")

print("\n=== .uns (unstructured) ===")
print(f"  Keys: {list(adata.uns.keys())}")

# --- Subsetting ---
print("\n=== Subsetting ===")
# Subset by cell type
t_cells = adata[adata.obs["louvain"].isin(["CD4 T cells", "CD8 T cells"])].copy()
print(f"  T cells: {t_cells.n_obs} cells")

# Subset by gene
selected_genes = ["CST3", "NKG7", "PPBP"]
adata_sub = adata[:, selected_genes].copy()
print(f"  Selected genes: {adata_sub.n_vars} genes")

# --- Adding metadata ---
print("\n=== Adding metadata ===")
adata.obs["random_score"] = np.random.rand(adata.n_obs)
adata.var["is_mito"] = adata.var_names.str.startswith("MT-")
print(f"  Added 'random_score' to obs, 'is_mito' to var")

# --- Saving raw counts ---
print("\n=== Storing layers ===")
# Before normalization, save raw counts in a layer
# adata.layers["raw_counts"] = adata.X.copy()
# After normalization, the original counts are preserved in layers

print("Done.")
```

## Script 2: Convert h5ad to Other Formats

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Convert h5ad to loom, csv, and other formats."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import pandas as pd
import numpy as np
import os

# --- Configuration ---
INPUT_H5AD = "/path/to/data.h5ad"  # Replace with your file
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load ---
print(f"Loading {INPUT_H5AD}...")
adata = sc.read_h5ad(INPUT_H5AD)
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")

# --- Convert to h5ad (compressed) ---
out_h5ad = os.path.join(OUTPUT_DIR, "output.h5ad")
adata.write(out_h5ad, compression="gzip")
print(f"Saved h5ad (compressed): {out_h5ad}")

# --- Convert to loom ---
out_loom = os.path.join(OUTPUT_DIR, "output.loom")
adata.write_loom(out_loom)
print(f"Saved loom: {out_loom}")

# --- Convert to CSV (expression matrix) ---
# WARNING: CSV files are very large for single-cell data. Use only for small datasets.
out_csv = os.path.join(OUTPUT_DIR, "expression_matrix.csv")
if adata.n_obs <= 5000 and adata.n_vars <= 5000:
    df = adata.to_df()  # cells x genes DataFrame
    df.to_csv(out_csv)
    print(f"Saved CSV: {out_csv}")
else:
    print(f"Skipping CSV export: dataset too large ({adata.n_obs} x {adata.n_vars})")
    print("  Consider subsetting first: adata_sub = adata[:1000, :2000]")

# --- Export cell metadata ---
out_obs = os.path.join(OUTPUT_DIR, "cell_metadata.csv")
adata.obs.to_csv(out_obs)
print(f"Saved cell metadata: {out_obs}")

# --- Export gene metadata ---
out_var = os.path.join(OUTPUT_DIR, "gene_metadata.csv")
adata.var.to_csv(out_var)
print(f"Saved gene metadata: {out_var}")

# --- Export embeddings (UMAP, PCA) ---
if "X_umap" in adata.obsm:
    umap_df = pd.DataFrame(
        adata.obsm["X_umap"],
        index=adata.obs_names,
        columns=["UMAP1", "UMAP2"],
    )
    out_umap = os.path.join(OUTPUT_DIR, "umap_coordinates.csv")
    umap_df.to_csv(out_umap)
    print(f"Saved UMAP coordinates: {out_umap}")

print("Done.")
```

## Script 3: Convert for R/Seurat Interoperability

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Prepare AnnData for import into R/Seurat.

Seurat's SeuratDisk package can read h5ad files directly.
This script prepares the h5ad in a Seurat-compatible way.
"""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import numpy as np
import scipy.sparse as sp
import os

# --- Configuration ---
INPUT_H5AD = "/path/to/data.h5ad"
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load ---
print(f"Loading {INPUT_H5AD}...")
adata = sc.read_h5ad(INPUT_H5AD)
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")

# --- Prepare for Seurat compatibility ---
# 1. Ensure X is a sparse matrix (CSR or CSC)
if not sp.issparse(adata.X):
    print("Converting X to sparse CSR format...")
    adata.X = sp.csr_matrix(adata.X)

# 2. Remove None values from obs/var (Seurat can't handle them)
for col in adata.obs.columns:
    if adata.obs[col].dtype == "category":
        adata.obs[col] = adata.obs[col].astype(str)
    adata.obs[col] = adata.obs[col].fillna("")

for col in adata.var.columns:
    if adata.var[col].dtype == "category":
        adata.var[col] = adata.var[col].astype(str)
    adata.var[col] = adata.var[col].fillna("")

# 3. Ensure obs_names and var_names are strings
adata.obs_names = adata.obs_names.astype(str)
adata.var_names = adata.var_names.astype(str)

# 4. Save as h5ad (Seurat can read this via SeuratDisk)
out_path = os.path.join(OUTPUT_DIR, "for_seurat.h5ad")
adata.write(out_path)
print(f"Saved Seurat-compatible h5ad: {out_path}")

# --- Instructions for R/Seurat ---
print("""
To load in R:
  library(Seurat)
  library(SeuratDisk)
  Convert("for_seurat.h5ad", dest="h5seurat", overwrite=TRUE)
  seurat_obj <- LoadH5Seurat("for_seurat.h5seurat")

Alternative using anndata2ri (in R):
  library(anndata)
  adata <- read_h5ad("for_seurat.h5ad")
  # Convert to Seurat
  library(Seurat)
  seurat_obj <- as.Seurat(adata, counts="X", data=NULL)
""")

print("Done.")
```

## Script 4: Create AnnData from Scratch

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Create an AnnData object from raw matrices/DataFrames."""

import matplotlib; matplotlib.use("Agg")
import anndata as ad
import numpy as np
import pandas as pd
import scipy.sparse as sp
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Simulate raw data ---
n_cells = 500
n_genes = 200

print(f"Creating AnnData with {n_cells} cells x {n_genes} genes...")

# Count matrix (sparse)
counts = sp.random(n_cells, n_genes, density=0.3, format="csr", dtype=np.float32)
counts.data = np.round(np.abs(counts.data) * 100)  # Simulate count data

# Cell metadata
obs = pd.DataFrame({
    "cell_type": np.random.choice(["T cell", "B cell", "Monocyte"], n_cells),
    "sample": np.random.choice(["sample_1", "sample_2"], n_cells),
    "n_genes": np.array((counts > 0).sum(axis=1)).flatten(),
}, index=[f"cell_{i:04d}" for i in range(n_cells)])

# Gene metadata
var = pd.DataFrame({
    "gene_id": [f"ENSG{i:08d}" for i in range(n_genes)],
    "highly_variable": np.random.choice([True, False], n_genes),
}, index=[f"Gene_{i}" for i in range(n_genes)])

# --- Construct AnnData ---
adata = ad.AnnData(
    X=counts,
    obs=obs,
    var=var,
)

# Add embeddings
adata.obsm["X_pca"] = np.random.randn(n_cells, 50).astype(np.float32)
adata.obsm["X_umap"] = np.random.randn(n_cells, 2).astype(np.float32)

# Add a layer
adata.layers["raw_counts"] = counts.copy()

# Add unstructured metadata
adata.uns["project"] = "my_experiment"
adata.uns["date"] = "2026-03-25"

print(adata)
print(f"\n  obs: {list(adata.obs.columns)}")
print(f"  var: {list(adata.var.columns)}")
print(f"  obsm: {list(adata.obsm.keys())}")
print(f"  layers: {list(adata.layers.keys())}")

# Save
out_path = os.path.join(OUTPUT_DIR, "from_scratch.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Key Parameters

| Operation | Function | Key Parameters |
|-----------|----------|---------------|
| Save h5ad | `adata.write()` | `compression="gzip"` for smaller files |
| Save loom | `adata.write_loom()` | Default works for most cases |
| To DataFrame | `adata.to_df()` | Returns dense cells x genes DataFrame |
| Concatenate | `ad.concat()` | `join="inner"/"outer"`, `label=`, `keys=` |
| Copy | `adata.copy()` | Always copy before modifying subsets |
| Subset | `adata[mask, genes]` | Returns a view; use `.copy()` to detach |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `adata.X` is `None` after subsetting | View not materialized | Use `adata[mask].copy()` to get a concrete copy |
| CSV export crashes | Dataset too large | Only export CSVs for small datasets (<5k cells) |
| Loom missing layers | AnnData has unsupported dtypes | Convert boolean columns to int before `write_loom()` |
| Seurat can't read h5ad | Categorical columns have None | Fill NA values and convert categories to strings |
| `anndata` version mismatch | h5ad written with newer anndata | Update anndata: `pip install --upgrade anndata` |
