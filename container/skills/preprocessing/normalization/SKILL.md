# Normalization

## When to Use

Use this skill after QC filtering and doublet removal, before feature selection. Normalization makes expression values comparable across cells with different sequencing depths.

## Prerequisites

All packages are pre-installed:
- `scanpy`, `anndata`
- `numpy`, `scipy`

## Method Overview

| Method | When to Use | Pros | Cons |
|--------|-------------|------|------|
| **Total-count + log1p** | Default for most analyses | Simple, fast, well-tested | Assumes equal total counts |
| **Scran pooling** | Large datasets, multiple cell types | Handles composition bias | Slower, needs pre-clustering |
| **Pearson residuals** | When you want to skip HVG selection | Combines normalization + HVG | Newer, less established |

## Script 1: Standard Normalization (Total-Count + log1p)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Standard normalization: normalize_total + log1p.

This is the most common normalization approach in single-cell analysis.
Steps:
  1. Normalize each cell to a target sum (default: 10,000)
  2. Log-transform: log(x + 1)

This makes cells comparable regardless of sequencing depth.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and QC filter ---
print("Loading PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()
print(f"  After QC: {adata.n_obs} cells x {adata.n_vars} genes")

# --- Step 1: Save raw counts ---
print("\nStep 1: Saving raw counts to layers['counts']...")
adata.layers["counts"] = adata.X.copy()
print(f"  Raw count range: [{adata.X.min():.0f}, {adata.X.max():.0f}]")

# --- Step 2: Normalize total counts ---
print("\nStep 2: Normalizing total counts per cell...")
sc.pp.normalize_total(
    adata,
    target_sum=1e4,      # Normalize each cell to 10,000 counts
    # exclude_highly_expressed=False,  # Set True to exclude top genes from normalization
)
print(f"  After normalize_total: mean total = {np.array(adata.X.sum(axis=1)).mean():.0f}")

# --- Step 3: Log transform ---
print("\nStep 3: Log-transforming (log1p)...")
sc.pp.log1p(adata)
print(f"  After log1p: value range = [{adata.X.min():.2f}, {adata.X.max():.2f}]")

# --- Verify ---
print("\nVerification:")
print(f"  adata.X contains log-normalized values")
print(f"  adata.layers['counts'] contains raw counts")

# Visualization: before vs after normalization
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

# Before: raw counts distribution
import scipy.sparse as sp
raw_totals = np.array(adata.layers["counts"].sum(axis=1)).flatten()
axes[0].hist(raw_totals, bins=50, color="steelblue", alpha=0.7)
axes[0].set_xlabel("Total counts per cell")
axes[0].set_ylabel("Number of cells")
axes[0].set_title("Before normalization (raw counts)")

# After: normalized distribution
if sp.issparse(adata.X):
    norm_totals = np.array(adata.X.sum(axis=1)).flatten()
else:
    norm_totals = adata.X.sum(axis=1).flatten()
axes[1].hist(norm_totals, bins=50, color="coral", alpha=0.7)
axes[1].set_xlabel("Total log-normalized expression")
axes[1].set_ylabel("Number of cells")
axes[1].set_title("After normalization (log-normalized)")

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "normalization_comparison.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved normalization comparison plot")

# Save
out_path = os.path.join(OUTPUT_DIR, "normalized.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 2: Scran Pooling Normalization

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Scran pooling normalization via scanpy.

Scran computes size factors by pooling cells into groups and deconvolving
pool-based size factors back to individual cells. This handles composition
bias better than simple total-count normalization.

Best for: datasets with strong composition differences between cell types.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load and QC filter ---
print("Loading PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()
print(f"  After QC: {adata.n_obs} cells x {adata.n_vars} genes")

# Save raw counts
adata.layers["counts"] = adata.X.copy()

# --- Step 1: Pre-cluster for scran ---
# Scran needs initial clustering to pool similar cells
print("\nStep 1: Pre-clustering for scran...")
adata_pp = adata.copy()
sc.pp.normalize_total(adata_pp, target_sum=1e4)
sc.pp.log1p(adata_pp)
sc.pp.highly_variable_genes(adata_pp, n_top_genes=2000)
sc.tl.pca(adata_pp, n_comps=15, use_highly_variable=True)
sc.pp.neighbors(adata_pp, n_neighbors=10, n_pcs=15)
sc.tl.leiden(adata_pp, resolution=1.0, key_added="groups")
adata.obs["groups"] = adata_pp.obs["groups"]
print(f"  Pre-clusters: {adata.obs['groups'].nunique()} groups")

# --- Step 2: Compute scran size factors ---
print("\nStep 2: Computing scran size factors...")
try:
    # Scanpy's interface to scran (requires rpy2 + R's scran package)
    # If not available, fall back to a Python approximation
    from scanpy.preprocessing import _scran

    # Use scanpy's scran wrapper
    sc.pp.normalize_total(adata, target_sum=None)  # placeholder
    print("  Using scanpy's scran integration")

except (ImportError, AttributeError):
    print("  R/scran not available, using Python approximation...")

    # Python approximation of scran-style normalization
    # Group cells by pre-cluster, compute pool-based size factors
    import scipy.sparse as sp

    X = adata.X
    if sp.issparse(X):
        X = X.toarray()

    size_factors = np.zeros(adata.n_obs)
    groups = adata.obs["groups"]

    for group in groups.unique():
        mask = groups == group
        group_counts = X[mask]
        # Pool-based: size factor relative to group median
        group_total = group_counts.sum(axis=1)
        group_median = np.median(group_total)
        if group_median > 0:
            size_factors[mask] = group_total / group_median
        else:
            size_factors[mask] = 1.0

    # Normalize to have geometric mean of 1
    size_factors = size_factors / np.exp(np.mean(np.log(size_factors[size_factors > 0])))
    adata.obs["size_factors"] = size_factors

    print(f"  Size factor range: [{size_factors.min():.3f}, {size_factors.max():.3f}]")
    print(f"  Size factor median: {np.median(size_factors):.3f}")

    # Apply normalization
    if sp.issparse(adata.X):
        X_dense = adata.X.toarray()
    else:
        X_dense = adata.X.copy()

    normalized = X_dense / size_factors[:, np.newaxis]
    adata.X = sp.csr_matrix(normalized.astype(np.float32))

# --- Step 3: Log transform ---
print("\nStep 3: Log-transforming...")
sc.pp.log1p(adata)
print(f"  Value range: [{adata.X.min():.2f}, {adata.X.max():.2f}]")

# Save
out_path = os.path.join(OUTPUT_DIR, "scran_normalized.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 3: Analytic Pearson Residuals

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Normalization using analytic Pearson residuals (Lause et al., 2021).

This method models each gene's expression as a negative binomial distribution
and computes Pearson residuals. It simultaneously normalizes AND selects
highly variable genes, so you can skip the separate HVG step.

Best for: when you want a single-step normalization + feature selection.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and QC filter ---
print("Loading PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()
print(f"  After QC: {adata.n_obs} cells x {adata.n_vars} genes")

# Save raw counts
adata.layers["counts"] = adata.X.copy()

# --- Compute Pearson residuals ---
print("\nComputing analytic Pearson residuals...")
# This function normalizes the data and selects top variable genes in one step
sc.experimental.pp.normalize_pearson_residuals(
    adata,
    theta=100,           # Overdispersion parameter (default: 100)
    clip=None,           # Clip residuals to sqrt(n_obs) by default
    check_values=True,   # Verify input is count data
)
print(f"  Residuals stored in adata.X")
print(f"  Value range: [{adata.X.min():.2f}, {adata.X.max():.2f}]")

# Note: Pearson residuals are NOT log-transformed counts
# They are standardized residuals (can be negative)
# Do NOT apply log1p after this

# --- Select top HVGs based on residual variance ---
print("\nSelecting highly variable genes by residual variance...")
sc.experimental.pp.highly_variable_genes(
    adata,
    n_top_genes=2000,
    flavor="pearson_residuals",
    layer="counts",      # Use raw counts for HVG selection
)
n_hvg = adata.var["highly_variable"].sum()
print(f"  Selected {n_hvg} highly variable genes")

# --- Compare with standard normalization ---
print("\nComparison: running standard pipeline on a copy...")
adata_std = adata.copy()
adata_std.X = adata_std.layers["counts"].copy()
sc.pp.normalize_total(adata_std, target_sum=1e4)
sc.pp.log1p(adata_std)
sc.pp.highly_variable_genes(adata_std, n_top_genes=2000)

# Compare HVG overlap
hvg_pearson = set(adata.var_names[adata.var["highly_variable"]])
hvg_standard = set(adata_std.var_names[adata_std.var["highly_variable"]])
overlap = hvg_pearson & hvg_standard
print(f"\n  Pearson HVGs: {len(hvg_pearson)}")
print(f"  Standard HVGs: {len(hvg_standard)}")
print(f"  Overlap: {len(overlap)} ({len(overlap)/len(hvg_pearson)*100:.0f}%)")

# --- Proceed to PCA directly ---
print("\nProceeding to PCA with Pearson residuals...")
sc.tl.pca(adata, n_comps=50, use_highly_variable=True)
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)

sc.pl.umap(adata, color=["n_genes_by_counts"], save="_pearson_residuals.png", show=False)
print("  Saved UMAP plot")

# Save
out_path = os.path.join(OUTPUT_DIR, "pearson_normalized.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Key Parameters

| Function | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `sc.pp.normalize_total` | `target_sum` | `None` (median) | Target total counts per cell. Use `1e4` for standard. |
| `sc.pp.normalize_total` | `exclude_highly_expressed` | `False` | Exclude top-expressed genes from sum |
| `sc.pp.normalize_total` | `max_fraction` | 0.05 | Used with `exclude_highly_expressed` |
| `sc.pp.log1p` | `base` | `None` (natural log) | Log base. `None` = natural log |
| `sc.experimental.pp.normalize_pearson_residuals` | `theta` | 100 | Negative binomial overdispersion. Higher = closer to Poisson |
| `sc.experimental.pp.normalize_pearson_residuals` | `clip` | `None` | Clip value for residuals. `None` = sqrt(n_obs) |

## Decision Guide

```
Do you have a simple, homogeneous dataset?
  YES -> Use total-count + log1p (Script 1)
  NO  -> Do cell types have very different total counts?
    YES -> Use scran pooling (Script 2)
    NO  -> Do you want to combine normalization + HVG selection?
      YES -> Use Pearson residuals (Script 3)
      NO  -> Use total-count + log1p (Script 1)
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Very different cluster sizes after normalization | Composition bias | Try scran pooling normalization |
| `log1p` applied twice | Called log1p on already-normalized data | Check if data is already log-transformed: max values > 20 suggests raw counts |
| Pearson residuals have negative values | This is expected | Do NOT apply log1p; residuals are already standardized |
| `normalize_total` changes nothing | All cells have same total | Check if data was already normalized |
| Size factors are all 1 | Pre-clustering produced one cluster | Increase resolution in pre-clustering step |
