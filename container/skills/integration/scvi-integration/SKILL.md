---
name: scvi-integration
description: "Deep generative model (scVI) for batch integration. GPU-accelerated, probabilistic, handles complex batch effects."
---

# scVI Integration

## When to Use

- Complex batch effects that linear methods (Harmony) cannot resolve
- Large datasets (100k+ cells) where probabilistic modeling helps
- When you need a latent representation for multiple downstream tasks
- When you want uncertainty estimates
- GPU-accelerated (A100 available)

## Prerequisites

- AnnData with raw counts (not normalized) or a layer containing raw counts
- A batch key column in `adata.obs`
- Packages: `scvi-tools`, `torch` (CUDA)

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""scVI batch integration with GPU acceleration."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import scvi
import numpy as np
import torch
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/preprocessed.h5ad"
OUTPUT_H5AD = "/workspace/group/integrated_scvi.h5ad"
OUTPUT_PLOT = "/workspace/group/scvi_integration.png"
MODEL_DIR = "/workspace/group/scvi_model"
BATCH_KEY = "batch"
CELLTYPE_KEY = "cell_type"
N_LATENT = 30              # Latent space dimensions
N_LAYERS = 2               # Neural network layers
N_HIDDEN = 128             # Hidden layer size
MAX_EPOCHS = 200           # Training epochs (early stopping applies)
GENE_LIKELIHOOD = "zinb"   # "zinb" (default), "nb", or "poisson"

# --- GPU Check ---
print(f"GPU available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")
print(f"Batches: {adata.obs[BATCH_KEY].value_counts().to_dict()}")

# --- Prepare AnnData for scVI ---
# scVI needs raw integer counts. Check if they exist.
if "counts" in adata.layers:
    print("Using 'counts' layer as raw counts")
    adata.X = adata.layers["counts"].copy()
elif adata.raw is not None:
    print("Using adata.raw as raw counts")
    adata = adata.raw.to_adata()
else:
    print("WARNING: No raw counts found. If adata.X is normalized, results will be wrong.")
    print("Proceeding with adata.X as-is...")

# --- Select Highly Variable Genes ---
sc.pp.highly_variable_genes(
    adata,
    n_top_genes=3000,
    flavor="seurat_v3",
    batch_key=BATCH_KEY,
    subset=False,
)
print(f"Selected {adata.var['highly_variable'].sum()} highly variable genes")

# --- UMAP Before Integration (on raw PCA) ---
adata_norm = adata.copy()
sc.pp.normalize_total(adata_norm, target_sum=1e4)
sc.pp.log1p(adata_norm)
sc.pp.scale(adata_norm, max_value=10)
sc.tl.pca(adata_norm, n_comps=30)
sc.pp.neighbors(adata_norm, n_pcs=30)
sc.tl.umap(adata_norm)
adata.obsm["X_umap_pre_scvi"] = adata_norm.obsm["X_umap"].copy()
del adata_norm

# --- Setup and Train scVI ---
scvi.model.SCVI.setup_anndata(
    adata,
    layer=None,  # Uses adata.X
    batch_key=BATCH_KEY,
)

model = scvi.model.SCVI(
    adata,
    n_latent=N_LATENT,
    n_layers=N_LAYERS,
    n_hidden=N_HIDDEN,
    gene_likelihood=GENE_LIKELIHOOD,
)

print("Training scVI model...")
model.train(
    max_epochs=MAX_EPOCHS,
    early_stopping=True,
    early_stopping_patience=10,
    early_stopping_monitor="elbo_validation",
    train_size=0.9,
    batch_size=256,
)
print(f"Training completed in {model.history['elbo_train'].shape[0]} epochs")

# --- Extract Latent Representation ---
adata.obsm["X_scVI"] = model.get_latent_representation()
print(f"Latent representation shape: {adata.obsm['X_scVI'].shape}")

# --- Compute Neighbors and UMAP on scVI Latent Space ---
sc.pp.neighbors(adata, use_rep="X_scVI")
sc.tl.umap(adata)
adata.obsm["X_umap_post_scvi"] = adata.obsm["X_umap"].copy()

# --- Before/After Comparison Plot ---
fig, axes = plt.subplots(2, 2, figsize=(16, 14))

adata.obsm["X_umap"] = adata.obsm["X_umap_pre_scvi"]
sc.pl.umap(adata, color=BATCH_KEY, ax=axes[0, 0], show=False, title="Before scVI (batch)")
if CELLTYPE_KEY in adata.obs.columns:
    sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[0, 1], show=False, title="Before scVI (cell type)")
else:
    axes[0, 1].set_title("No cell type annotation")

adata.obsm["X_umap"] = adata.obsm["X_umap_post_scvi"]
sc.pl.umap(adata, color=BATCH_KEY, ax=axes[1, 0], show=False, title="After scVI (batch)")
if CELLTYPE_KEY in adata.obs.columns:
    sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[1, 1], show=False, title="After scVI (cell type)")
else:
    axes[1, 1].set_title("No cell type annotation")

plt.tight_layout()
plt.savefig(OUTPUT_PLOT, dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved plot: {OUTPUT_PLOT}")

# --- Training History Plot ---
fig, ax = plt.subplots(1, 1, figsize=(8, 5))
train_elbo = model.history["elbo_train"]["elbo_train"].values
val_elbo = model.history["elbo_validation"]["elbo_validation"].values
ax.plot(train_elbo, label="Train ELBO")
ax.plot(
    np.linspace(0, len(train_elbo) - 1, len(val_elbo)),
    val_elbo,
    label="Validation ELBO",
)
ax.set_xlabel("Epoch")
ax.set_ylabel("ELBO")
ax.set_title("scVI Training History")
ax.legend()
plt.tight_layout()
plt.savefig("/workspace/group/scvi_training_history.png", dpi=150, bbox_inches="tight")
plt.close()

# --- Cluster on scVI Latent Space ---
sc.tl.leiden(adata, resolution=0.8, key_added="leiden_scvi")
print(f"Found {adata.obs['leiden_scvi'].nunique()} clusters after scVI integration")

# --- Save Model and AnnData ---
model.save(MODEL_DIR, overwrite=True)
print(f"Saved model: {MODEL_DIR}")

adata.obsm["X_umap"] = adata.obsm["X_umap_post_scvi"]
adata.write_h5ad(OUTPUT_H5AD)
print(f"Saved: {OUTPUT_H5AD}")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `n_latent` | 30 | Latent space dimensions. 10-50 typical. Lower = more compression. |
| `n_layers` | 2 | Number of neural network layers. 1-3 typical. |
| `n_hidden` | 128 | Hidden layer width. 64-256 typical. |
| `gene_likelihood` | `"zinb"` | Count distribution. `"zinb"` for zero-inflated, `"nb"` for negative binomial, `"poisson"` for Poisson. |
| `max_epochs` | 200 | Max training epochs. Early stopping usually triggers at 50-100. |
| `batch_size` | 256 | Training batch size. Increase for large datasets (512, 1024). |
| `train_size` | 0.9 | Fraction of data for training (rest for validation/early stopping). |

## Common Issues

- **"Expected integer counts"**: scVI requires raw counts (not normalized/log-transformed). Use `adata.layers["counts"]` or `adata.raw`.
- **GPU out of memory**: Reduce `batch_size` (128 or 64), reduce `n_hidden`, or subsample genes.
- **Training loss not decreasing**: Check that counts are truly raw integers. Try `gene_likelihood="nb"` instead of `"zinb"`.
- **Over-integration**: Reduce `n_latent` (try 10-15) or increase training data diversity.
- **Model loading**: `scvi.model.SCVI.load(MODEL_DIR, adata=adata)` to reload a trained model.
- **Differential expression with scVI**: Use `model.differential_expression()` for probabilistic DE that accounts for batch effects.
