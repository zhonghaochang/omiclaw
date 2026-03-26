# Dimensionality Reduction

## When to Use

Use this skill after normalization and HVG selection. Dimensionality reduction compresses the data from thousands of genes into a lower-dimensional space for clustering and visualization.

**Pipeline:** HVGs -> PCA -> Neighbor Graph -> UMAP/t-SNE

## Prerequisites

All packages are pre-installed:
- `scanpy`, `anndata`
- `numpy`, `matplotlib`

## Script 1: Complete Dimensionality Reduction Pipeline

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Complete dimensionality reduction pipeline: PCA -> neighbors -> UMAP/t-SNE."""

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
sc.pp.highly_variable_genes(adata, n_top_genes=2000, flavor="seurat_v3", layer="counts")
print(f"  Preprocessed: {adata.n_obs} cells x {adata.n_vars} genes")
print(f"  HVGs: {adata.var['highly_variable'].sum()}")

# ==========================================
# Step 1: PCA
# ==========================================
print("\n" + "=" * 50)
print("Step 1: Principal Component Analysis (PCA)")
print("=" * 50)

# Optional: scale data before PCA (centers each gene to zero mean, unit variance)
# This is recommended when using seurat flavor; optional for seurat_v3
sc.pp.scale(adata, max_value=10)  # Clip values to reduce effect of outliers

sc.tl.pca(
    adata,
    n_comps=50,                    # Number of PCs to compute
    use_highly_variable=True,       # Only use HVGs
    svd_solver="arpack",           # "arpack" for large sparse data, "auto" otherwise
)

print(f"  PCA computed: {adata.obsm['X_pca'].shape}")
print(f"  Variance explained by PC1: {adata.uns['pca']['variance_ratio'][0]*100:.1f}%")
print(f"  Variance explained by top 10 PCs: {adata.uns['pca']['variance_ratio'][:10].sum()*100:.1f}%")
print(f"  Variance explained by top 30 PCs: {adata.uns['pca']['variance_ratio'][:30].sum()*100:.1f}%")

# --- Variance ratio (elbow) plot ---
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

# Scree plot
axes[0].plot(range(1, 51), adata.uns["pca"]["variance_ratio"], "o-", markersize=3)
axes[0].set_xlabel("PC")
axes[0].set_ylabel("Variance ratio")
axes[0].set_title("Scree plot (variance explained)")
axes[0].axvline(x=30, color="red", linestyle="--", alpha=0.5, label="n_pcs=30")
axes[0].legend()

# Cumulative variance
cumvar = np.cumsum(adata.uns["pca"]["variance_ratio"])
axes[1].plot(range(1, 51), cumvar, "o-", markersize=3)
axes[1].set_xlabel("PC")
axes[1].set_ylabel("Cumulative variance ratio")
axes[1].set_title("Cumulative variance explained")
axes[1].axhline(y=0.9, color="gray", linestyle="--", alpha=0.5, label="90%")
axes[1].axvline(x=30, color="red", linestyle="--", alpha=0.5, label="n_pcs=30")
axes[1].legend()

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "pca_variance.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved variance ratio plot")

# PCA scatter (first 2 PCs)
sc.pl.pca(adata, color="n_genes_by_counts", save="_scatter.png", show=False)
print("  Saved PCA scatter plot")

# ==========================================
# Step 2: Neighbor Graph
# ==========================================
print("\n" + "=" * 50)
print("Step 2: Computing neighbor graph")
print("=" * 50)

sc.pp.neighbors(
    adata,
    n_neighbors=15,    # Number of nearest neighbors (10-30 typical)
    n_pcs=30,          # Number of PCs to use (choose from elbow plot)
    metric="euclidean", # Distance metric (cosine, euclidean, correlation)
)

print(f"  Neighbor graph: {adata.obsp['connectivities'].shape}")
print(f"  Parameters: n_neighbors={adata.uns['neighbors']['params']['n_neighbors']}, "
      f"n_pcs={adata.uns['neighbors']['params']['n_pcs']}")

# ==========================================
# Step 3: UMAP
# ==========================================
print("\n" + "=" * 50)
print("Step 3: UMAP embedding")
print("=" * 50)

sc.tl.umap(
    adata,
    min_dist=0.5,      # Minimum distance between points (0.1-1.0)
    spread=1.0,         # Scale of embedded points
    # n_components=2,    # 2D by default
)

print(f"  UMAP embedding: {adata.obsm['X_umap'].shape}")

sc.pl.umap(adata, color=["n_genes_by_counts", "total_counts", "pct_counts_mt"],
           save="_qc_metrics.png", show=False)
print("  Saved UMAP colored by QC metrics")

# ==========================================
# Step 4: t-SNE (alternative to UMAP)
# ==========================================
print("\n" + "=" * 50)
print("Step 4: t-SNE embedding")
print("=" * 50)

sc.tl.tsne(
    adata,
    n_pcs=30,            # Number of PCs to use
    perplexity=30,       # Balance local vs global structure (5-50)
    # learning_rate=200, # Default: n_obs / 12
)

print(f"  t-SNE embedding: {adata.obsm['X_tsne'].shape}")

sc.pl.tsne(adata, color="n_genes_by_counts", save="_qc.png", show=False)
print("  Saved t-SNE plot")

# --- Side-by-side comparison ---
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
sc.pl.umap(adata, color="n_genes_by_counts", ax=axes[0], show=False, title="UMAP")
sc.pl.tsne(adata, color="n_genes_by_counts", ax=axes[1], show=False, title="t-SNE")
plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "umap_vs_tsne.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved UMAP vs t-SNE comparison")

# Save
out_path = os.path.join(OUTPUT_DIR, "dimred_complete.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 2: Parameter Tuning for UMAP

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Explore UMAP parameter effects: n_neighbors, min_dist, n_pcs."""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

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
sc.pp.highly_variable_genes(adata, n_top_genes=2000, flavor="seurat_v3", layer="counts")
sc.pp.scale(adata, max_value=10)
sc.tl.pca(adata, n_comps=50, use_highly_variable=True)
print(f"  Preprocessed: {adata.n_obs} cells")

# --- Test 1: Effect of n_neighbors ---
print("\nTesting n_neighbors values...")
n_neighbors_vals = [5, 15, 30, 50]
fig, axes = plt.subplots(1, len(n_neighbors_vals), figsize=(5 * len(n_neighbors_vals), 4))

for i, nn in enumerate(n_neighbors_vals):
    adata_test = adata.copy()
    sc.pp.neighbors(adata_test, n_neighbors=nn, n_pcs=30)
    sc.tl.umap(adata_test)
    sc.tl.leiden(adata_test, resolution=0.5)
    sc.pl.umap(adata_test, color="leiden", ax=axes[i], show=False,
               title=f"n_neighbors={nn}")
    print(f"  n_neighbors={nn}: {adata_test.obs['leiden'].nunique()} clusters")

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "umap_n_neighbors.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved n_neighbors comparison")

# --- Test 2: Effect of min_dist ---
print("\nTesting min_dist values...")
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
min_dist_vals = [0.0, 0.1, 0.5, 1.0]
fig, axes = plt.subplots(1, len(min_dist_vals), figsize=(5 * len(min_dist_vals), 4))

for i, md in enumerate(min_dist_vals):
    adata_test = adata.copy()
    sc.tl.umap(adata_test, min_dist=md)
    sc.tl.leiden(adata_test, resolution=0.5)
    sc.pl.umap(adata_test, color="leiden", ax=axes[i], show=False,
               title=f"min_dist={md}")
    print(f"  min_dist={md}")

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "umap_min_dist.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved min_dist comparison")

# --- Test 3: Effect of n_pcs ---
print("\nTesting n_pcs values...")
n_pcs_vals = [10, 20, 30, 50]
fig, axes = plt.subplots(1, len(n_pcs_vals), figsize=(5 * len(n_pcs_vals), 4))

for i, npcs in enumerate(n_pcs_vals):
    adata_test = adata.copy()
    sc.pp.neighbors(adata_test, n_neighbors=15, n_pcs=npcs)
    sc.tl.umap(adata_test)
    sc.tl.leiden(adata_test, resolution=0.5)
    sc.pl.umap(adata_test, color="leiden", ax=axes[i], show=False,
               title=f"n_pcs={npcs}\n{adata_test.obs['leiden'].nunique()} clusters")
    print(f"  n_pcs={npcs}: {adata_test.obs['leiden'].nunique()} clusters")

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "umap_n_pcs.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved n_pcs comparison")

print("\n--- Parameter Tuning Guide ---")
print("  n_neighbors: Higher = more global structure, lower = more local detail")
print("    5-10:  Fine local structure, may fragment clusters")
print("    15-30: Good balance (default: 15)")
print("    50+:   Smooth global structure, may merge small clusters")
print("  min_dist: Higher = more spread out, lower = tighter clusters")
print("    0.0-0.1: Tight clusters, good for visualization")
print("    0.5:     Default, balanced")
print("    1.0:     Spread out, shows continuous transitions")
print("  n_pcs: Choose from elbow plot")
print("    10-20: For simple datasets")
print("    30:    Good default")
print("    50:    For complex datasets with many cell types")

print("\nDone.")
```

## Script 3: Choosing the Number of PCs

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Methods to determine the optimal number of PCs.

Choosing n_pcs is important: too few loses signal, too many adds noise.
Methods:
  1. Elbow/scree plot (visual)
  2. Cumulative variance threshold (e.g., 90%)
  3. Marchenko-Pastur limit (statistical)
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

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
sc.pp.highly_variable_genes(adata, n_top_genes=2000, flavor="seurat_v3", layer="counts")
sc.pp.scale(adata, max_value=10)
sc.tl.pca(adata, n_comps=50, use_highly_variable=True)

variance_ratio = adata.uns["pca"]["variance_ratio"]

# --- Method 1: Elbow detection (automatic) ---
print("Method 1: Automatic elbow detection...")
# Find the point where adding another PC gives diminishing returns
diffs = np.diff(variance_ratio)
# Elbow is where the second derivative is maximized
second_diffs = np.diff(diffs)
elbow_pc = np.argmax(second_diffs) + 2  # +2 for zero-indexing and diff offset
print(f"  Estimated elbow at PC {elbow_pc}")

# --- Method 2: Cumulative variance threshold ---
print("\nMethod 2: Cumulative variance threshold...")
cumvar = np.cumsum(variance_ratio)
thresholds = [0.80, 0.85, 0.90, 0.95]
for thresh in thresholds:
    n_pcs = np.searchsorted(cumvar, thresh) + 1
    print(f"  {thresh*100:.0f}% variance explained by {n_pcs} PCs")

# --- Method 3: Marchenko-Pastur limit ---
print("\nMethod 3: Marchenko-Pastur limit (random matrix theory)...")
# PCs above the MP limit contain signal; below is noise
n_cells = adata.n_obs
n_genes = adata.var["highly_variable"].sum()
gamma = n_genes / n_cells
mp_upper = (1 + np.sqrt(gamma))**2 / n_genes  # Approximate upper limit

# Count PCs with variance above random expectation
significant_pcs = np.sum(variance_ratio > mp_upper)
print(f"  MP upper limit: {mp_upper:.6f}")
print(f"  Significant PCs (above MP limit): {significant_pcs}")

# --- Summary plot ---
fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(range(1, 51), variance_ratio, "o-", markersize=4, label="Variance ratio")
ax.axvline(x=elbow_pc, color="red", linestyle="--", alpha=0.7, label=f"Elbow: PC {elbow_pc}")
ax.axhline(y=mp_upper, color="green", linestyle="--", alpha=0.7, label=f"MP limit")

# Mark suggested n_pcs
suggested = max(elbow_pc, 15)  # At least 15 PCs
suggested = min(suggested, 50)
ax.axvline(x=suggested, color="blue", linestyle="-.", alpha=0.7, label=f"Suggested: {suggested}")

ax.set_xlabel("PC")
ax.set_ylabel("Variance ratio")
ax.set_title("Choosing number of PCs")
ax.legend()
fig.savefig(os.path.join(OUTPUT_DIR, "choose_n_pcs.png"), dpi=150, bbox_inches="tight")
plt.close()

print(f"\n--- Recommendation ---")
print(f"  Elbow method: {elbow_pc} PCs")
print(f"  90% variance: {np.searchsorted(cumvar, 0.90) + 1} PCs")
print(f"  MP limit: {significant_pcs} PCs")
print(f"  Suggested: Use {suggested} PCs (safe default: 30)")

print("\nDone.")
```

## Key Parameters

| Function | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `sc.tl.pca` | `n_comps` | 50 | Number of PCs to compute |
| `sc.tl.pca` | `use_highly_variable` | `False` | Restrict to HVGs (set `True`) |
| `sc.tl.pca` | `svd_solver` | `"arpack"` | `"arpack"` for sparse, `"auto"` for dense |
| `sc.pp.neighbors` | `n_neighbors` | 15 | k nearest neighbors (10-30) |
| `sc.pp.neighbors` | `n_pcs` | `None` (all) | Number of PCs for neighbor search |
| `sc.pp.neighbors` | `metric` | `"euclidean"` | Distance metric |
| `sc.tl.umap` | `min_dist` | 0.5 | Minimum distance between points (0.0-1.0) |
| `sc.tl.umap` | `spread` | 1.0 | Scale of embedded points |
| `sc.tl.umap` | `n_components` | 2 | Embedding dimensions (2 or 3) |
| `sc.tl.tsne` | `perplexity` | 30 | Balance local/global (5-50) |
| `sc.pp.scale` | `max_value` | `None` | Clip scaled values (10 recommended) |

## UMAP vs t-SNE

| Feature | UMAP | t-SNE |
|---------|------|-------|
| Speed | Faster | Slower |
| Global structure | Preserves | Does not preserve |
| Distances meaningful | Somewhat | Not at all |
| Reproducible | With random_state | With random_state |
| Recommended | Yes (default) | For publication figures |
| Parameter sensitivity | Moderate | High (perplexity) |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| UMAP looks like a blob | Too few HVGs or PCs | Increase n_top_genes or n_pcs |
| UMAP looks fragmented | n_neighbors too low or too many PCs | Increase n_neighbors, decrease n_pcs |
| t-SNE looks different each run | No random_state set | Set `random_state=0` |
| PCA very slow | Dense matrix, many genes | Use `svd_solver="arpack"`, filter to HVGs |
| Clusters overlap in UMAP | Biology (not artifact) or insufficient HVGs | Try different resolution; check HVG selection |
| `X_pca` not in obsm | PCA not computed | Run `sc.tl.pca()` first |
