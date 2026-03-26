---
name: harmony
description: "Fast batch integration using Harmony algorithm on PCA embeddings. Corrects batch effects while preserving biological variation."
---

# Harmony Integration

## When to Use

- Fast batch correction on PCA space (seconds, not minutes)
- Good first-pass integration method
- Works well for moderate batch effects
- No GPU required

## Prerequisites

- Preprocessed AnnData with PCA computed
- A batch key column in `adata.obs`
- Package: `harmonypy`

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Harmony batch integration with before/after comparison plots."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import harmonypy as hm
import numpy as np
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/preprocessed.h5ad"  # Input: preprocessed AnnData
OUTPUT_H5AD = "/workspace/group/integrated_harmony.h5ad"
OUTPUT_PLOT = "/workspace/group/harmony_integration.png"
BATCH_KEY = "batch"        # Column in adata.obs with batch labels
CELLTYPE_KEY = "cell_type" # Column in adata.obs with cell type labels (optional, for coloring)
N_PCS = 30                 # Number of PCs to use
THETA = 2.0               # Diversity clustering penalty (higher = more mixing)
MAX_ITER = 20              # Maximum harmony iterations

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")
print(f"Batches: {adata.obs[BATCH_KEY].value_counts().to_dict()}")

# --- Ensure PCA is computed ---
if "X_pca" not in adata.obsm:
    print("Computing PCA...")
    sc.pp.highly_variable_genes(adata, n_top_genes=2000, batch_key=BATCH_KEY)
    adata_hvg = adata[:, adata.var["highly_variable"]].copy()
    sc.pp.scale(adata_hvg, max_value=10)
    sc.tl.pca(adata_hvg, n_comps=N_PCS)
    adata.obsm["X_pca"] = adata_hvg.obsm["X_pca"].copy()
    adata.varm["PCs"] = np.zeros((adata.shape[1], N_PCS))
    adata.varm["PCs"][adata.var["highly_variable"].values] = adata_hvg.varm["PCs"]

# --- UMAP Before Integration ---
print("Computing UMAP before integration...")
sc.pp.neighbors(adata, n_pcs=N_PCS, key_added="pre_harmony")
sc.tl.umap(adata, neighbors_key="pre_harmony")
adata.obsm["X_umap_pre_harmony"] = adata.obsm["X_umap"].copy()

# --- Run Harmony ---
print("Running Harmony integration...")
ho = hm.run_harmony(
    adata.obsm["X_pca"][:, :N_PCS],
    adata.obs,
    BATCH_KEY,
    theta=THETA,
    max_iter_harmony=MAX_ITER,
)
adata.obsm["X_pca_harmony"] = ho.Z_corr.T  # Corrected PCA embeddings

# --- UMAP After Integration ---
print("Computing UMAP after integration...")
sc.pp.neighbors(adata, use_rep="X_pca_harmony", key_added="post_harmony")
sc.tl.umap(adata, neighbors_key="post_harmony")
adata.obsm["X_umap_post_harmony"] = adata.obsm["X_umap"].copy()

# --- Before/After Comparison Plot ---
fig, axes = plt.subplots(2, 2, figsize=(16, 14))

# Before - colored by batch
adata.obsm["X_umap"] = adata.obsm["X_umap_pre_harmony"]
sc.pl.umap(adata, color=BATCH_KEY, ax=axes[0, 0], show=False, title="Before Harmony (batch)")
# Before - colored by cell type
if CELLTYPE_KEY in adata.obs.columns:
    sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[0, 1], show=False, title="Before Harmony (cell type)")
else:
    axes[0, 1].set_title("No cell type annotation available")

# After - colored by batch
adata.obsm["X_umap"] = adata.obsm["X_umap_post_harmony"]
sc.pl.umap(adata, color=BATCH_KEY, ax=axes[1, 0], show=False, title="After Harmony (batch)")
# After - colored by cell type
if CELLTYPE_KEY in adata.obs.columns:
    sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[1, 1], show=False, title="After Harmony (cell type)")
else:
    axes[1, 1].set_title("No cell type annotation available")

plt.tight_layout()
plt.savefig(OUTPUT_PLOT, dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved plot: {OUTPUT_PLOT}")

# --- Re-cluster on corrected embedding ---
sc.tl.leiden(adata, neighbors_key="post_harmony", resolution=0.8, key_added="leiden_harmony")
print(f"Found {adata.obs['leiden_harmony'].nunique()} clusters after Harmony integration")

# --- Save ---
adata.obsm["X_umap"] = adata.obsm["X_umap_post_harmony"]
adata.write_h5ad(OUTPUT_H5AD)
print(f"Saved: {OUTPUT_H5AD}")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `theta` | 2.0 | Diversity penalty. Higher values force more batch mixing. Start with 2, increase if batches still separate. |
| `max_iter_harmony` | 20 | Max iterations. Usually converges in 5-10. |
| `n_pcs` | 30 | Number of PCs to correct. 20-50 typical. |
| `sigma` | 0.1 | Width of soft k-means kernel. Smaller = harder assignments. |
| `nclust` | None | Number of clusters for k-means. Default auto-sets. |

## Common Issues

- **Batches still separate after Harmony**: Increase `theta` (try 4, 6, 8). If extreme, consider scVI instead.
- **Over-correction (cell types merge)**: Decrease `theta` (try 1.0 or 0.5). Check that cell types are annotated correctly.
- **MemoryError**: Reduce `n_pcs` or subsample cells. Harmony is memory-efficient but very large datasets (>1M cells) may need chunking.
- **Convergence warning**: Increase `max_iter_harmony` to 50.
- **Multiple batch keys** (e.g., donor + technology): Run harmony once with a list: `run_harmony(..., ["donor", "technology"])`.
