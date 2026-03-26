# Feature Selection (Highly Variable Genes)

## When to Use

Use this skill after normalization and before dimensionality reduction. Selecting highly variable genes (HVGs) focuses the analysis on genes that vary across cells (biological signal) rather than genes with uniform expression (noise).

## Prerequisites

All packages are pre-installed:
- `scanpy`, `anndata`
- `numpy`, `matplotlib`

## Script 1: Standard HVG Selection with Different Flavors

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Select highly variable genes using different methods.

Scanpy offers several HVG selection flavors:
  - "seurat": default, uses normalized dispersion (log-normalized data)
  - "seurat_v3": uses raw counts, variance-stabilizing transformation
  - "cell_ranger": Cell Ranger's HVG method

Recommendation: Use "seurat_v3" for most cases (works on raw counts).
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and preprocess ---
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

# Normalize for seurat/cell_ranger flavors (they need log-normalized data)
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# ==========================================
# Method A: "seurat" flavor (default)
# ==========================================
print("\n" + "=" * 50)
print("Method A: seurat flavor")
print("=" * 50)
adata_a = adata.copy()
sc.pp.highly_variable_genes(
    adata_a,
    n_top_genes=2000,
    flavor="seurat",
    # min_mean=0.0125, max_mean=3, min_disp=0.5,  # Alternative: use mean/dispersion cutoffs
)
n_hvg_a = adata_a.var["highly_variable"].sum()
print(f"  HVGs selected: {n_hvg_a}")
print(f"  Columns added to var: {[c for c in adata_a.var.columns if 'highly' in c or 'mean' in c or 'disp' in c]}")

# Plot
sc.pl.highly_variable_genes(adata_a, save="_seurat.png", show=False)
print("  Saved HVG plot (seurat flavor)")

# ==========================================
# Method B: "seurat_v3" flavor (recommended)
# ==========================================
print("\n" + "=" * 50)
print("Method B: seurat_v3 flavor (recommended)")
print("=" * 50)
adata_b = adata.copy()
# seurat_v3 works on RAW COUNTS, not log-normalized data
sc.pp.highly_variable_genes(
    adata_b,
    n_top_genes=2000,
    flavor="seurat_v3",
    layer="counts",       # Use raw counts layer
)
n_hvg_b = adata_b.var["highly_variable"].sum()
print(f"  HVGs selected: {n_hvg_b}")

sc.pl.highly_variable_genes(adata_b, save="_seurat_v3.png", show=False)
print("  Saved HVG plot (seurat_v3 flavor)")

# ==========================================
# Method C: "cell_ranger" flavor
# ==========================================
print("\n" + "=" * 50)
print("Method C: cell_ranger flavor")
print("=" * 50)
adata_c = adata.copy()
sc.pp.highly_variable_genes(
    adata_c,
    n_top_genes=2000,
    flavor="cell_ranger",
)
n_hvg_c = adata_c.var["highly_variable"].sum()
print(f"  HVGs selected: {n_hvg_c}")

sc.pl.highly_variable_genes(adata_c, save="_cell_ranger.png", show=False)
print("  Saved HVG plot (cell_ranger flavor)")

# ==========================================
# Compare methods
# ==========================================
print("\n" + "=" * 50)
print("Comparison")
print("=" * 50)
hvg_a = set(adata_a.var_names[adata_a.var["highly_variable"]])
hvg_b = set(adata_b.var_names[adata_b.var["highly_variable"]])
hvg_c = set(adata_c.var_names[adata_c.var["highly_variable"]])

print(f"  seurat:      {len(hvg_a)} HVGs")
print(f"  seurat_v3:   {len(hvg_b)} HVGs")
print(f"  cell_ranger: {len(hvg_c)} HVGs")
print(f"  A & B overlap: {len(hvg_a & hvg_b)}")
print(f"  A & C overlap: {len(hvg_a & hvg_c)}")
print(f"  B & C overlap: {len(hvg_b & hvg_c)}")
print(f"  All three:     {len(hvg_a & hvg_b & hvg_c)}")

# Use seurat_v3 result for downstream
adata.var["highly_variable"] = adata_b.var["highly_variable"]
print(f"\n  Using seurat_v3 HVGs for downstream analysis: {adata.var['highly_variable'].sum()}")

out_path = os.path.join(OUTPUT_DIR, "hvg_selected.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 2: Tuning n_top_genes

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Explore the effect of different n_top_genes values.

The number of HVGs affects downstream clustering resolution:
  - Too few (500): miss rare cell types
  - Too many (5000+): include noise, blur clusters
  - Sweet spot: 1000-3000 for most datasets
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and preprocess ---
print("Loading PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()
adata.layers["counts"] = adata.X.copy()
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# --- Test different n_top_genes values ---
n_values = [500, 1000, 2000, 3000, 5000]
results = {}

print("\nTesting different n_top_genes values...")
fig, axes = plt.subplots(1, len(n_values), figsize=(5 * len(n_values), 4))

for i, n_top in enumerate(n_values):
    adata_test = adata.copy()
    sc.pp.highly_variable_genes(adata_test, n_top_genes=min(n_top, adata_test.n_vars),
                                 flavor="seurat_v3", layer="counts")

    actual_hvg = adata_test.var["highly_variable"].sum()

    # Run PCA + UMAP
    sc.tl.pca(adata_test, n_comps=30, use_highly_variable=True)
    sc.pp.neighbors(adata_test, n_neighbors=15, n_pcs=30)
    sc.tl.umap(adata_test)
    sc.tl.leiden(adata_test, resolution=0.5)

    n_clusters = adata_test.obs["leiden"].nunique()
    results[n_top] = {"hvg": actual_hvg, "clusters": n_clusters}

    # Plot UMAP
    sc.pl.umap(adata_test, color="leiden", ax=axes[i], show=False,
               title=f"n_top={n_top}\n{n_clusters} clusters")

    print(f"  n_top_genes={n_top}: {actual_hvg} HVGs, {n_clusters} clusters")

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "hvg_tuning.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved HVG tuning comparison plot")

# Summary table
print("\n  Summary:")
print(f"  {'n_top_genes':>12} {'Actual HVGs':>12} {'Clusters':>10}")
print(f"  {'-'*36}")
for n_top, r in results.items():
    print(f"  {n_top:>12} {r['hvg']:>12} {r['clusters']:>10}")

print("\n  Recommendation: Use 2000-3000 for most datasets.")
print("  Use 1000-1500 for very homogeneous populations.")
print("  Use 3000-5000 for highly heterogeneous datasets with rare types.")

print("\nDone.")
```

## Script 3: Batch-Aware HVG Selection

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Batch-aware HVG selection for multi-sample experiments.

When samples have batch effects, selecting HVGs globally may pick
batch-specific genes instead of biologically variable genes.
The batch_key parameter selects genes that are variable WITHIN batches.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and simulate batches ---
print("Loading PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()

# Simulate two batches
np.random.seed(42)
adata.obs["batch"] = np.random.choice(["batch_1", "batch_2"], adata.n_obs)
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")
print(f"  Batches: {adata.obs['batch'].value_counts().to_dict()}")

# Save counts and normalize
adata.layers["counts"] = adata.X.copy()
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# --- Method A: Global HVG (no batch awareness) ---
print("\nMethod A: Global HVG selection (no batch awareness)...")
adata_global = adata.copy()
sc.pp.highly_variable_genes(
    adata_global,
    n_top_genes=2000,
    flavor="seurat_v3",
    layer="counts",
)
hvg_global = set(adata_global.var_names[adata_global.var["highly_variable"]])
print(f"  Global HVGs: {len(hvg_global)}")

# --- Method B: Batch-aware HVG selection ---
print("\nMethod B: Batch-aware HVG selection...")
adata_batch = adata.copy()
sc.pp.highly_variable_genes(
    adata_batch,
    n_top_genes=2000,
    flavor="seurat_v3",
    layer="counts",
    batch_key="batch",  # KEY PARAMETER: select HVGs per batch, then combine
)
hvg_batch = set(adata_batch.var_names[adata_batch.var["highly_variable"]])
print(f"  Batch-aware HVGs: {len(hvg_batch)}")

# The var DataFrame now contains per-batch information
print(f"\n  Additional var columns: {[c for c in adata_batch.var.columns if 'highly' in c]}")
# highly_variable_nbatches: number of batches where gene is HVG
if "highly_variable_nbatches" in adata_batch.var.columns:
    print(f"  HVGs in both batches: {(adata_batch.var['highly_variable_nbatches'] == 2).sum()}")
    print(f"  HVGs in one batch:    {(adata_batch.var['highly_variable_nbatches'] == 1).sum()}")

# --- Compare ---
print("\nComparison:")
overlap = hvg_global & hvg_batch
only_global = hvg_global - hvg_batch
only_batch = hvg_batch - hvg_global
print(f"  Overlap:         {len(overlap)}")
print(f"  Only in global:  {len(only_global)}")
print(f"  Only in batch:   {len(only_batch)}")

# Use batch-aware HVGs
adata.var["highly_variable"] = adata_batch.var["highly_variable"]

# --- Downstream with batch-aware HVGs ---
print("\nRunning PCA + UMAP with batch-aware HVGs...")
sc.tl.pca(adata, n_comps=30, use_highly_variable=True)
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)

sc.pl.umap(adata, color=["batch"], save="_batch_hvg.png", show=False)
print("  Saved UMAP plot")

out_path = os.path.join(OUTPUT_DIR, "batch_hvg_selected.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `n_top_genes` | `None` | Number of HVGs to select. Typical: 2000-3000 |
| `flavor` | `"seurat"` | Method: `"seurat"`, `"seurat_v3"`, `"cell_ranger"` |
| `layer` | `None` (uses .X) | Layer with raw counts (needed for `seurat_v3`) |
| `batch_key` | `None` | Column in obs for batch-aware selection |
| `min_mean` | 0.0125 | (seurat flavor) Min mean expression cutoff |
| `max_mean` | 3 | (seurat flavor) Max mean expression cutoff |
| `min_disp` | 0.5 | (seurat flavor) Min normalized dispersion cutoff |
| `subset` | `False` | If True, subset adata to only HVGs (not recommended) |

## Flavor Comparison

| Flavor | Input Data | Method | Best For |
|--------|-----------|--------|----------|
| `seurat` | Log-normalized | Mean-variance, normalized dispersion | General use, small datasets |
| `seurat_v3` | Raw counts | Variance-stabilizing transformation | Most datasets (recommended) |
| `cell_ranger` | Log-normalized | Mean-variance, Cell Ranger method | Reproducing Cell Ranger results |
| `pearson_residuals` | Raw counts | Pearson residual variance | Combined normalization + HVG |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `n_top_genes` > total genes | Too many genes requested | Set `n_top_genes` to min of desired and `adata.n_vars` |
| `seurat_v3` error with log data | Needs raw counts | Use `layer="counts"` with raw count layer |
| Batch HVGs differ wildly | Strong batch effects | This is expected; batch-aware selection handles it |
| No HVGs selected | All genes have similar variance | Lower thresholds or increase `n_top_genes` |
| Plot shows no clear HVG separation | Data is very homogeneous | Consider using more genes or different method |
