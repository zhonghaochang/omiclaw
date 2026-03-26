# Doublet Detection

## When to Use

Use this skill after basic QC filtering to identify and remove doublets (droplets containing two or more cells). Doublets appear as artificial intermediate cell states and can mislead clustering and differential expression.

**Rule of thumb:** ~0.8% doublet rate per 1,000 cells captured. For 10,000 cells, expect ~8% doublets.

## Prerequisites

All packages are pre-installed:
- `scrublet` -- Standard simulation-based doublet detection
- `scvi-tools` -- SOLO deep learning doublet detection
- `scanpy`, `anndata`, `numpy`, `matplotlib`

## Script 1: Scrublet (Standard Method)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Detect doublets using Scrublet (Wolock et al., 2019).

Scrublet simulates doublets by combining random pairs of observed cells,
then scores each real cell based on its similarity to simulated doublets.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import scrublet as scr
import numpy as np
import os

# --- Configuration ---
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load data ---
print("Loading PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")

# Basic QC first (Scrublet needs filtered data)
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
print(f"  After basic filter: {adata.n_obs} cells x {adata.n_vars} genes")

# --- Run Scrublet ---
print("\nRunning Scrublet...")
scrub = scr.Scrublet(
    adata.X,
    expected_doublet_rate=0.06,   # Adjust based on your 10x loading
    sim_doublet_ratio=2.0,        # Ratio of simulated to observed cells
    n_neighbors=None,             # Auto-determined from data
    random_state=0,
)

doublet_scores, predicted_doublets = scrub.scrub_doublets(
    min_counts=2,
    min_cells=3,
    min_gene_variability_pctl=85,
    n_prin_comps=30,
    log_transform=True,           # Log-transform counts internally
    mean_center=True,
    normalize_variance=True,
)

print(f"  Doublet score range: [{doublet_scores.min():.3f}, {doublet_scores.max():.3f}]")
print(f"  Auto threshold: {scrub.threshold_:.3f}")
print(f"  Predicted doublets: {predicted_doublets.sum()} ({predicted_doublets.sum()/len(predicted_doublets)*100:.1f}%)")

# Store results in AnnData
adata.obs["doublet_score"] = doublet_scores
adata.obs["predicted_doublet"] = predicted_doublets

# --- Visualization ---
# Histogram of doublet scores
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

# Score distribution
axes[0].hist(doublet_scores[~predicted_doublets], bins=50, alpha=0.7, label="Singlets", color="steelblue")
axes[0].hist(doublet_scores[predicted_doublets], bins=50, alpha=0.7, label="Doublets", color="red")
axes[0].axvline(x=scrub.threshold_, color="black", linestyle="--", label=f"Threshold={scrub.threshold_:.3f}")
axes[0].set_xlabel("Doublet Score")
axes[0].set_ylabel("Count")
axes[0].set_title("Scrublet Doublet Scores")
axes[0].legend()

# Simulated doublet scores
axes[1].hist(scrub.doublet_scores_sim_, bins=50, alpha=0.7, color="orange", label="Simulated doublets")
axes[1].hist(doublet_scores, bins=50, alpha=0.7, color="steelblue", label="Observed cells")
axes[1].set_xlabel("Doublet Score")
axes[1].set_ylabel("Count")
axes[1].set_title("Observed vs Simulated")
axes[1].legend()

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "scrublet_scores.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved scrublet score histogram")

# UMAP colored by doublet score (need to preprocess first)
adata_pp = adata.copy()
sc.pp.normalize_total(adata_pp, target_sum=1e4)
sc.pp.log1p(adata_pp)
sc.pp.highly_variable_genes(adata_pp, n_top_genes=2000)
sc.tl.pca(adata_pp, n_comps=30, use_highly_variable=True)
sc.pp.neighbors(adata_pp, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata_pp)

# Transfer UMAP to original adata
adata.obsm["X_umap"] = adata_pp.obsm["X_umap"]

sc.pl.umap(adata, color=["doublet_score", "predicted_doublet"],
           save="_scrublet.png", show=False)
print("  Saved UMAP plot")

# --- Remove doublets ---
n_before = adata.n_obs
adata = adata[~adata.obs["predicted_doublet"]].copy()
print(f"\n  Before: {n_before} cells")
print(f"  After removing doublets: {adata.n_obs} cells")
print(f"  Removed: {n_before - adata.n_obs} doublets")

# Save
out_path = os.path.join(OUTPUT_DIR, "doublet_filtered.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 2: Scrublet Per-Sample (Multi-Sample)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Run Scrublet per sample in a multi-sample experiment.

IMPORTANT: Always run doublet detection per sample, not on merged data.
Merging before doublet detection causes cross-sample cell type differences
to be misidentified as doublets.
"""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import scrublet as scr
import numpy as np
import pandas as pd
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load data (simulating multi-sample) ---
print("Loading data...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)

# Simulate two samples
np.random.seed(42)
adata.obs["sample"] = np.random.choice(["sample_A", "sample_B"], adata.n_obs)
print(f"  Total: {adata.n_obs} cells")
print(f"  Per sample: {adata.obs['sample'].value_counts().to_dict()}")

# --- Run Scrublet per sample ---
print("\nRunning Scrublet per sample...")
doublet_scores = np.zeros(adata.n_obs)
predicted_doublets = np.zeros(adata.n_obs, dtype=bool)

for sample in adata.obs["sample"].unique():
    mask = adata.obs["sample"] == sample
    idx = np.where(mask)[0]
    adata_sub = adata[mask].copy()

    print(f"\n  Processing {sample} ({adata_sub.n_obs} cells)...")
    scrub = scr.Scrublet(adata_sub.X, expected_doublet_rate=0.06)
    scores, preds = scrub.scrub_doublets(
        min_counts=2, min_cells=3, n_prin_comps=30, log_transform=True,
    )
    doublet_scores[idx] = scores
    predicted_doublets[idx] = preds
    print(f"    Threshold: {scrub.threshold_:.3f}")
    print(f"    Doublets: {preds.sum()} ({preds.sum()/len(preds)*100:.1f}%)")

adata.obs["doublet_score"] = doublet_scores
adata.obs["predicted_doublet"] = predicted_doublets

# Summary
print(f"\n  Total doublets: {predicted_doublets.sum()} ({predicted_doublets.sum()/len(predicted_doublets)*100:.1f}%)")

# Remove doublets
adata = adata[~adata.obs["predicted_doublet"]].copy()
print(f"  After removal: {adata.n_obs} cells")

out_path = os.path.join(OUTPUT_DIR, "per_sample_doublet_filtered.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 3: SOLO (scvi-tools Deep Learning Method)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Detect doublets using SOLO from scvi-tools (Bernstein et al., 2020).

SOLO uses a variational autoencoder to learn a latent space,
then trains a classifier to distinguish singlets from simulated doublets.
Generally more accurate than Scrublet for complex datasets.
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
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")

# Store raw counts (SOLO needs raw counts)
adata.layers["counts"] = adata.X.copy()

# Preprocess for HVG selection
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

print("\nSetting up scVI model...")
try:
    import scvi

    # Setup AnnData for scVI (uses raw counts from layer)
    scvi.model.SCVI.setup_anndata(
        adata,
        layer="counts",
    )

    # Train scVI model first
    print("Training scVI model...")
    vae = scvi.model.SCVI(adata, n_latent=30, n_layers=2)
    vae.train(max_epochs=100, early_stopping=True)
    print("  scVI training complete.")

    # Run SOLO
    print("Running SOLO doublet detection...")
    solo = scvi.external.SOLO.from_scvi_model(vae)
    solo.train(max_epochs=100, early_stopping=True)
    print("  SOLO training complete.")

    # Get predictions
    predictions = solo.predict()
    adata.obs["solo_doublet_score"] = predictions["doublet"].values
    adata.obs["solo_prediction"] = predictions.idxmax(axis=1).values
    adata.obs["solo_is_doublet"] = adata.obs["solo_prediction"] == "doublet"

    n_doublets = adata.obs["solo_is_doublet"].sum()
    print(f"\n  SOLO predicted doublets: {n_doublets} ({n_doublets/adata.n_obs*100:.1f}%)")

    # Visualization
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.hist(adata.obs.loc[~adata.obs["solo_is_doublet"], "solo_doublet_score"],
            bins=50, alpha=0.7, label="Singlets", color="steelblue")
    ax.hist(adata.obs.loc[adata.obs["solo_is_doublet"], "solo_doublet_score"],
            bins=50, alpha=0.7, label="Doublets", color="red")
    ax.set_xlabel("SOLO Doublet Probability")
    ax.set_ylabel("Count")
    ax.set_title("SOLO Doublet Detection")
    ax.legend()
    fig.savefig(os.path.join(OUTPUT_DIR, "solo_scores.png"), dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved SOLO score histogram")

    # Remove doublets
    n_before = adata.n_obs
    adata = adata[~adata.obs["solo_is_doublet"]].copy()
    print(f"\n  Before: {n_before} cells")
    print(f"  After SOLO filtering: {adata.n_obs} cells")

except ImportError:
    print("scvi-tools not available. Using Scrublet as fallback.")
    print("Install with: pip install scvi-tools")

except Exception as e:
    print(f"SOLO failed: {e}")
    print("Falling back to Scrublet (see Script 1)")

# Save
out_path = os.path.join(OUTPUT_DIR, "solo_filtered.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Key Parameters

| Method | Parameter | Default | Description |
|--------|-----------|---------|-------------|
| Scrublet | `expected_doublet_rate` | 0.06 | Expected fraction of doublets (~0.8% per 1k cells) |
| Scrublet | `sim_doublet_ratio` | 2.0 | Ratio of simulated doublets to observed cells |
| Scrublet | `n_prin_comps` | 30 | Number of PCs for neighbor search |
| Scrublet | `min_gene_variability_pctl` | 85 | Percentile cutoff for variable genes |
| SOLO | `n_latent` (scVI) | 10 | Latent space dimensions |
| SOLO | `n_layers` (scVI) | 1 | Number of hidden layers |
| SOLO | `max_epochs` | 400 | Maximum training epochs |

## Method Comparison

| Feature | Scrublet | SOLO |
|---------|----------|------|
| Speed | Fast (~seconds) | Slow (~minutes, GPU helps) |
| Accuracy | Good | Better for complex data |
| GPU needed | No | Recommended |
| Multi-sample | Run per sample | Run per sample |
| Dependencies | `scrublet` only | `scvi-tools` (PyTorch) |
| Recommended for | Standard analysis | Complex tissues, ambiguous doublets |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Scrublet bimodal score not found | Homogeneous data, too few cells | Manually set threshold: `scrub.call_doublets(threshold=0.25)` |
| Too many/few doublets | Wrong `expected_doublet_rate` | Calculate: 0.008 * (n_cells_loaded / 1000) |
| SOLO GPU out of memory | Dataset too large | Reduce `n_latent`, use `batch_size` param, or use Scrublet |
| Cross-sample false positives | Ran on merged data | Always run doublet detection per sample independently |
| Scrublet score is uniform | Data not variable enough | Increase `min_gene_variability_pctl` or check preprocessing |
