---
name: scanorama
description: "Fast batch correction using Scanorama. Panoramic stitching approach, good for moderate batch effects and dataset sizes."
---

# Scanorama Integration

## When to Use

- Lightweight, fast batch correction (seconds to minutes)
- Moderate batch effects across 2-10 batches
- No GPU required
- Good at preserving local neighborhood structure
- When you want both corrected embeddings and corrected gene expression

## Prerequisites

- Preprocessed AnnData with log-normalized data and HVGs selected
- A batch key column in `adata.obs`
- Package: `scanorama`

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Scanorama batch correction with before/after comparison."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import scanorama
import numpy as np
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/preprocessed.h5ad"
OUTPUT_H5AD = "/workspace/group/integrated_scanorama.h5ad"
OUTPUT_PLOT = "/workspace/group/scanorama_integration.png"
BATCH_KEY = "batch"
CELLTYPE_KEY = "cell_type"
DIMRED = 100         # Dimensionality of embedding
KNN = 20             # Number of nearest neighbors for matching
SIGMA = 15           # Correction smoothing parameter
APPROX = True        # Use approximate nearest neighbors (faster)
ALPHA = 0.10         # Alignment strength (0 = no correction, 1 = full)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")
print(f"Batches: {adata.obs[BATCH_KEY].value_counts().to_dict()}")

# --- Ensure log-normalized and HVGs selected ---
if "highly_variable" not in adata.var.columns:
    sc.pp.highly_variable_genes(adata, n_top_genes=2000, batch_key=BATCH_KEY)

adata_hvg = adata[:, adata.var["highly_variable"]].copy()

# --- UMAP Before Integration ---
sc.tl.pca(adata_hvg, n_comps=50)
sc.pp.neighbors(adata_hvg, n_pcs=30)
sc.tl.umap(adata_hvg)
adata.obsm["X_umap_pre_scanorama"] = adata_hvg.obsm["X_umap"].copy()

# --- Split by Batch for Scanorama ---
batches = adata_hvg.obs[BATCH_KEY].unique().tolist()
adatas_by_batch = [adata_hvg[adata_hvg.obs[BATCH_KEY] == b].copy() for b in batches]
print(f"Split into {len(batches)} batches: {[a.shape[0] for a in adatas_by_batch]}")

# --- Run Scanorama ---
print("Running Scanorama integration...")
corrected, genes = scanorama.correct(
    [a.X for a in adatas_by_batch],
    [a.var_names.tolist() for a in adatas_by_batch],
    dimred=DIMRED,
    knn=KNN,
    sigma=SIGMA,
    approx=APPROX,
    alpha=ALPHA,
    return_dimred=True,
    return_dense=True,
)

# --- Also get the embedding ---
embeddings, genes_embed = scanorama.integrate(
    [a.X for a in adatas_by_batch],
    [a.var_names.tolist() for a in adatas_by_batch],
    dimred=DIMRED,
    knn=KNN,
    sigma=SIGMA,
    approx=APPROX,
    alpha=ALPHA,
)

# --- Reassemble corrected embeddings into full AnnData ---
corrected_embedding = np.vstack(embeddings)
adata.obsm["X_scanorama"] = corrected_embedding
print(f"Scanorama embedding shape: {corrected_embedding.shape}")

# --- UMAP After Integration ---
sc.pp.neighbors(adata, use_rep="X_scanorama")
sc.tl.umap(adata)
adata.obsm["X_umap_post_scanorama"] = adata.obsm["X_umap"].copy()

# --- Before/After Comparison Plot ---
fig, axes = plt.subplots(2, 2, figsize=(16, 14))

adata.obsm["X_umap"] = adata.obsm["X_umap_pre_scanorama"]
sc.pl.umap(adata, color=BATCH_KEY, ax=axes[0, 0], show=False, title="Before Scanorama (batch)")
if CELLTYPE_KEY in adata.obs.columns:
    sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[0, 1], show=False, title="Before Scanorama (cell type)")
else:
    axes[0, 1].set_title("No cell type annotation")

adata.obsm["X_umap"] = adata.obsm["X_umap_post_scanorama"]
sc.pl.umap(adata, color=BATCH_KEY, ax=axes[1, 0], show=False, title="After Scanorama (batch)")
if CELLTYPE_KEY in adata.obs.columns:
    sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[1, 1], show=False, title="After Scanorama (cell type)")
else:
    axes[1, 1].set_title("No cell type annotation")

plt.tight_layout()
plt.savefig(OUTPUT_PLOT, dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved plot: {OUTPUT_PLOT}")

# --- Cluster ---
sc.tl.leiden(adata, resolution=0.8, key_added="leiden_scanorama")
print(f"Found {adata.obs['leiden_scanorama'].nunique()} clusters after Scanorama integration")

# --- Save ---
adata.obsm["X_umap"] = adata.obsm["X_umap_post_scanorama"]
adata.write_h5ad(OUTPUT_H5AD)
print(f"Saved: {OUTPUT_H5AD}")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dimred` | 100 | Dimensionality of SVD embedding. Lower = faster but less detail. |
| `knn` | 20 | Number of nearest neighbors for mutual nearest neighbor matching. |
| `sigma` | 15 | Correction smoothing. Higher = smoother correction. |
| `alpha` | 0.10 | Alignment strength. 0 = no correction, 1 = full. Increase for stubborn batch effects. |
| `approx` | True | Use approximate nearest neighbors (annoy). Much faster for large datasets. |

## Common Issues

- **Batches still separate**: Increase `alpha` (try 0.3, 0.5) or increase `knn` (try 50, 100).
- **Over-correction**: Decrease `alpha` (try 0.05) or decrease `sigma`.
- **Slow runtime**: Ensure `approx=True`. Reduce `dimred` (try 50). Subsample if >500k cells.
- **Gene mismatch between batches**: Scanorama automatically finds shared genes. Ensure all batches have the same gene naming convention.
- **Memory issues**: Use sparse matrices. `scanorama.correct()` with `return_dense=False` returns sparse output.
- **Scanorama vs `correct_scanpy`**: The `scanorama.correct_scanpy()` function works directly on a list of AnnData objects for convenience, but splitting manually gives more control.
