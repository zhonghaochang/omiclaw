# Leiden Clustering

## When to Use

Use this skill after computing a neighbor graph (PCA -> neighbors) to partition cells into discrete clusters. Leiden clustering is the standard community detection algorithm for single-cell data, superseding Louvain.

## Prerequisites

All packages are pre-installed:
- `scanpy`, `anndata`
- `leidenalg` (Leiden algorithm implementation)
- `matplotlib`, `numpy`, `sklearn`

## Script 1: Basic Leiden Clustering

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Basic Leiden clustering with PBMC3k."""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and preprocess ---
print("Loading and preprocessing PBMC3k...")
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
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)
print(f"  Preprocessed: {adata.n_obs} cells")

# --- Leiden clustering ---
print("\nRunning Leiden clustering (resolution=0.5)...")
sc.tl.leiden(
    adata,
    resolution=0.5,       # Controls granularity (0.1-2.0)
    random_state=0,       # For reproducibility
    key_added="leiden",   # Column name in adata.obs
)

n_clusters = adata.obs["leiden"].nunique()
print(f"  Found {n_clusters} clusters")
print(f"  Cluster sizes:")
for cluster in sorted(adata.obs["leiden"].unique(), key=int):
    n = (adata.obs["leiden"] == cluster).sum()
    print(f"    Cluster {cluster}: {n} cells ({n/adata.n_obs*100:.1f}%)")

# --- Visualize ---
sc.pl.umap(adata, color="leiden", save="_leiden.png", show=False)
print("\n  Saved UMAP with Leiden clusters")

out_path = os.path.join(OUTPUT_DIR, "leiden_clustered.h5ad")
adata.write(out_path)
print(f"  Saved to {out_path}")
print("Done.")
```

## Script 2: Resolution Tuning -- Compare Multiple Resolutions

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Compare Leiden clustering at multiple resolutions.

Resolution controls the granularity of clustering:
  - Low (0.1-0.3): Fewer, larger clusters (major cell types)
  - Medium (0.5-0.8): Balanced (most common)
  - High (1.0-2.0): Many, smaller clusters (sub-types, states)
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load preprocessed data (or preprocess from scratch) ---
print("Loading and preprocessing PBMC3k...")
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
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)
print(f"  Preprocessed: {adata.n_obs} cells")

# --- Test multiple resolutions ---
resolutions = [0.1, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0]
print(f"\nTesting {len(resolutions)} resolutions...")

fig, axes = plt.subplots(2, 4, figsize=(20, 10))
axes = axes.flatten()

for i, res in enumerate(resolutions):
    key = f"leiden_res{res}"
    sc.tl.leiden(adata, resolution=res, key_added=key, random_state=0)
    n_clusters = adata.obs[key].nunique()
    print(f"  Resolution {res}: {n_clusters} clusters")

    if i < len(axes):
        sc.pl.umap(adata, color=key, ax=axes[i], show=False,
                   title=f"res={res} ({n_clusters} clusters)", legend_loc="on data")

if len(resolutions) < len(axes):
    for j in range(len(resolutions), len(axes)):
        axes[j].set_visible(False)

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "leiden_resolution_comparison.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved resolution comparison plot")

# --- Summary table ---
print("\n  Resolution | Clusters | Min size | Max size | Median size")
print("  " + "-" * 60)
for res in resolutions:
    key = f"leiden_res{res}"
    sizes = adata.obs[key].value_counts()
    print(f"  {res:10.1f} | {len(sizes):>8} | {sizes.min():>8} | {sizes.max():>8} | {sizes.median():>11.0f}")

print("\n  Recommendation:")
print("  - For broad cell types (T, B, mono, NK): resolution 0.3-0.5")
print("  - For detailed sub-types (CD4, CD8, naive, memory): resolution 0.8-1.5")
print("  - Check that clusters correspond to biological populations, not artifacts")

# Save with chosen resolution
adata.obs["leiden"] = adata.obs["leiden_res0.5"]
out_path = os.path.join(OUTPUT_DIR, "resolution_tuned.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 3: Overclustering Strategy and Cluster Merging

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Overclustering + merging strategy.

Strategy:
  1. Overcluster at high resolution (more clusters than expected)
  2. Examine marker genes per cluster
  3. Merge clusters that share the same biology

This avoids missing rare cell types while keeping annotation tractable.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os
from scipy.cluster.hierarchy import linkage, fcluster

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and preprocess ---
print("Loading and preprocessing PBMC3k...")
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
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)

# --- Step 1: Overcluster ---
print("\nStep 1: Overclustering (resolution=1.5)...")
sc.tl.leiden(adata, resolution=1.5, key_added="leiden_over", random_state=0)
n_over = adata.obs["leiden_over"].nunique()
print(f"  Found {n_over} overclusters")

# --- Step 2: Find markers per overcluster ---
print("\nStep 2: Finding markers for each overcluster...")
adata_unscaled = adata.copy()
adata_unscaled.X = adata_unscaled.layers["counts"].copy()
sc.pp.normalize_total(adata_unscaled, target_sum=1e4)
sc.pp.log1p(adata_unscaled)
adata_unscaled.obs["leiden_over"] = adata.obs["leiden_over"]

sc.tl.rank_genes_groups(adata_unscaled, groupby="leiden_over", method="wilcoxon")

print("\n  Top 3 markers per overcluster:")
result = adata_unscaled.uns["rank_genes_groups"]
for cluster in sorted(adata.obs["leiden_over"].unique(), key=int)[:15]:
    idx = list(result["names"].dtype.names).index(cluster)
    genes = [result["names"][i][idx] for i in range(3)]
    print(f"    Cluster {cluster}: {', '.join(genes)}")

# --- Step 3: Merge similar clusters via hierarchical clustering ---
print("\nStep 3: Merging similar clusters...")
clusters = sorted(adata.obs["leiden_over"].unique(), key=int)
centroids = np.array([
    adata.obsm["X_pca"][adata.obs["leiden_over"] == c].mean(axis=0)
    for c in clusters
])

Z = linkage(centroids, method="ward")
n_merged_target = 8
merged_labels = fcluster(Z, t=n_merged_target, criterion="maxclust")

overcluster_to_merged = {clusters[i]: str(merged_labels[i] - 1) for i in range(len(clusters))}
adata.obs["leiden_merged"] = adata.obs["leiden_over"].map(overcluster_to_merged).astype("category")
n_merged = adata.obs["leiden_merged"].nunique()
print(f"  Overclusters: {n_over} -> Merged: {n_merged}")

# --- Visualize ---
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
sc.pl.umap(adata, color="leiden_over", ax=axes[0], show=False,
           title=f"Overclustered ({n_over} clusters)", legend_loc="on data",
           legend_fontsize=6)
sc.pl.umap(adata, color="leiden_merged", ax=axes[1], show=False,
           title=f"Merged ({n_merged} clusters)", legend_loc="on data")
plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "overcluster_merge.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved overclustering vs merged plot")

out_path = os.path.join(OUTPUT_DIR, "overclustered_merged.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 4: Cluster Quality Evaluation with Silhouette Scores

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Evaluate clustering quality using silhouette scores across resolutions."""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
from sklearn.metrics import silhouette_score, silhouette_samples
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load and preprocess ---
print("Loading and preprocessing PBMC3k...")
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
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)

# --- Compute silhouette scores for multiple resolutions ---
resolutions = [0.1, 0.3, 0.5, 0.8, 1.0, 1.5]
pca_data = adata.obsm["X_pca"][:, :30]

print("\nComputing silhouette scores...")
sil_scores = []

for res in resolutions:
    sc.tl.leiden(adata, resolution=res, key_added=f"leiden_{res}", random_state=0)
    labels = adata.obs[f"leiden_{res}"].values.astype(int)
    n_clusters = len(np.unique(labels))

    if n_clusters > 1:
        score = silhouette_score(pca_data, labels, sample_size=min(5000, adata.n_obs))
        sil_scores.append(score)
        print(f"  Resolution {res}: {n_clusters} clusters, silhouette={score:.3f}")
    else:
        sil_scores.append(0)
        print(f"  Resolution {res}: {n_clusters} cluster (cannot compute silhouette)")

# --- Plot silhouette scores vs resolution ---
fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(resolutions, sil_scores, "o-", color="steelblue", linewidth=2, markersize=8)
ax.set_xlabel("Resolution")
ax.set_ylabel("Silhouette Score")
ax.set_title("Clustering Quality: Silhouette Score vs Resolution")
best_res = resolutions[np.argmax(sil_scores)]
ax.axvline(x=best_res, color="red", linestyle="--", alpha=0.5,
           label=f"Best: res={best_res} (score={max(sil_scores):.3f})")
ax.legend()
fig.savefig(os.path.join(OUTPUT_DIR, "silhouette_vs_resolution.png"), dpi=150, bbox_inches="tight")
plt.close()

print(f"\n  Best resolution by silhouette: {best_res}")

# --- Per-cluster silhouette for best resolution ---
print(f"\nPer-cluster silhouette (resolution={best_res}):")
labels = adata.obs[f"leiden_{best_res}"].values.astype(int)
sample_scores = silhouette_samples(pca_data, labels)
adata.obs["silhouette"] = sample_scores

for cluster in sorted(np.unique(labels)):
    cluster_scores = sample_scores[labels == cluster]
    print(f"  Cluster {cluster}: mean silhouette = {cluster_scores.mean():.3f} "
          f"(n={len(cluster_scores)})")

print("\n  Silhouette interpretation: >0.5 good, >0.3 decent, <0 misassigned")

out_path = os.path.join(OUTPUT_DIR, "cluster_evaluated.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Key Parameters

| Function | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `sc.tl.leiden` | `resolution` | 1.0 | Granularity: higher = more clusters |
| `sc.tl.leiden` | `random_state` | 0 | Seed for reproducibility |
| `sc.tl.leiden` | `key_added` | `"leiden"` | Column name in `adata.obs` |
| `sc.tl.leiden` | `restrict_to` | `None` | Sub-cluster within existing clusters |
| `sc.tl.leiden` | `n_iterations` | -1 | -1 = iterate until convergence |
| `sc.tl.leiden` | `flavor` | `"igraph"` | `"igraph"` or `"leidenalg"` |

## Resolution Guide

| Resolution | Expected Clusters | Use Case |
|-----------|-------------------|----------|
| 0.1-0.3 | 3-5 | Major cell lineages |
| 0.4-0.6 | 5-10 | Standard cell types (default starting point) |
| 0.7-1.0 | 8-15 | Detailed cell types |
| 1.0-2.0 | 15-30+ | Sub-types and cell states |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Too few clusters | Resolution too low | Increase resolution |
| Too many small clusters | Resolution too high or noise | Lower resolution or use overclustering + merge |
| Clusters don't match UMAP | UMAP distorts distances | Trust graph-based clusters over visual layout |
| Different runs give different clusters | No random_state set | Set `random_state=0` |
| `leidenalg` not found | Package not installed | `pip install leidenalg` in the active Conda environment |
| Want to sub-cluster one group | Need finer resolution locally | Use `restrict_to=("leiden", ["3"])` to sub-cluster cluster 3 |
