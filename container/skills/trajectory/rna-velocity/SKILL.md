---
name: rna-velocity
description: "RNA velocity analysis with scVelo. Stochastic and dynamical models. Requires spliced/unspliced counts."
---

# RNA Velocity (scVelo)

## When to Use

- Infer directionality of cell state transitions from spliced/unspliced RNA ratios
- Predict future cell states
- Visualize velocity vector fields on UMAP
- Dynamical model provides latent time (data-driven pseudotime without root cell selection)

## Prerequisites

- AnnData with spliced and unspliced count layers (`adata.layers["spliced"]`, `adata.layers["unspliced"]`)
- These come from alignment tools: `STARsolo --soloFeatures Gene Velocyto`, `alevin-fry`, `velocyto run`, or `kb count` (kallisto|bustools)
- Packages: `scvelo`

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""RNA velocity analysis with scVelo: stochastic and dynamical models."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import scvelo as scv
import numpy as np
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/annotated.h5ad"  # Must have spliced/unspliced layers
OUTPUT_H5AD = "/workspace/group/velocity.h5ad"
OUTPUT_DIR = "/workspace/group/velocity_results"
CELLTYPE_KEY = "cell_type"
CLUSTER_KEY = "leiden"
MODE = "dynamical"  # "stochastic" (fast) or "dynamical" (more accurate, slower)
N_TOP_GENES = 2000

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- scVelo Settings ---
scv.settings.verbosity = 3
scv.settings.set_figure_params(dpi=100, fontsize=12, frameon=False)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")
print(f"Layers: {list(adata.layers.keys())}")

# Verify spliced/unspliced exist
assert "spliced" in adata.layers, "Missing 'spliced' layer. Run velocyto or use STARsolo Velocyto mode."
assert "unspliced" in adata.layers, "Missing 'unspliced' layer."

spliced_sum = np.array(adata.layers["spliced"].sum(axis=1)).flatten()
unspliced_sum = np.array(adata.layers["unspliced"].sum(axis=1)).flatten()
print(f"Spliced counts per cell: {spliced_sum.mean():.0f} (mean)")
print(f"Unspliced counts per cell: {unspliced_sum.mean():.0f} (mean)")
print(f"Unspliced/Spliced ratio: {(unspliced_sum.sum() / spliced_sum.sum()):.3f}")

# --- Preprocessing ---
# Filter and normalize (scVelo-specific pipeline)
scv.pp.filter_and_normalize(adata, min_shared_counts=20, n_top_genes=N_TOP_GENES)
print(f"After filtering: {adata.shape}")

# Compute moments (first and second order) for velocity estimation
scv.pp.moments(adata, n_pcs=30, n_neighbors=30)

# --- Ensure UMAP ---
if "X_umap" not in adata.obsm:
    sc.pp.neighbors(adata, n_pcs=30)
    sc.tl.umap(adata)

# --- Run Velocity ---
if MODE == "stochastic":
    print("Running stochastic velocity model...")
    scv.tl.velocity(adata, mode="stochastic")
elif MODE == "dynamical":
    print("Recovering dynamics (this may take a few minutes)...")
    scv.tl.recover_dynamics(adata, n_jobs=8)
    print("Running dynamical velocity model...")
    scv.tl.velocity(adata, mode="dynamical")

# Velocity graph (transition probabilities)
scv.tl.velocity_graph(adata)

# --- Velocity Embedding Plot ---
fig, axes = plt.subplots(1, 2, figsize=(18, 8))

scv.pl.velocity_embedding_stream(
    adata, basis="umap", color=CELLTYPE_KEY,
    ax=axes[0], show=False, title="Velocity Stream (cell type)",
    legend_loc="right margin",
)
scv.pl.velocity_embedding_stream(
    adata, basis="umap", color=CLUSTER_KEY,
    ax=axes[1], show=False, title="Velocity Stream (clusters)",
    legend_loc="right margin",
)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "velocity_stream.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Velocity Arrows ---
fig, ax = plt.subplots(figsize=(10, 8))
scv.pl.velocity_embedding(
    adata, basis="umap", color=CELLTYPE_KEY,
    ax=ax, show=False, title="Velocity Arrows",
    arrow_length=3, arrow_size=2, dpi=150,
)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "velocity_arrows.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Velocity Confidence ---
scv.tl.velocity_confidence(adata)
fig, axes = plt.subplots(1, 2, figsize=(16, 7))
sc.pl.umap(adata, color="velocity_confidence", ax=axes[0], show=False,
           title="Velocity Confidence", cmap="coolwarm")
sc.pl.umap(adata, color="velocity_length", ax=axes[1], show=False,
           title="Velocity Length (magnitude)", cmap="coolwarm")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "velocity_confidence.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Dynamical Model: Latent Time ---
if MODE == "dynamical":
    scv.tl.latent_time(adata)
    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    sc.pl.umap(adata, color="latent_time", ax=axes[0], show=False,
               title="Latent Time", cmap="viridis")
    sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[1], show=False, title="Cell Types")
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "latent_time.png"), dpi=150, bbox_inches="tight")
    plt.close()

    # Top likelihood genes (driver genes of dynamics)
    top_genes = adata.var["fit_likelihood"].sort_values(ascending=False).head(30)
    print(f"\nTop 30 dynamical genes:\n{top_genes}")
    top_genes.to_csv(os.path.join(OUTPUT_DIR, "top_dynamical_genes.csv"))

    # Phase portraits of top genes
    top_gene_names = top_genes.index[:6].tolist()
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    for i, gene in enumerate(top_gene_names):
        ax = axes[i // 3, i % 3]
        scv.pl.scatter(adata, basis=gene, color=CELLTYPE_KEY, ax=ax, show=False,
                       title=gene, legend_loc="none")
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "phase_portraits.png"), dpi=150, bbox_inches="tight")
    plt.close()

# --- Velocity Pseudotime ---
scv.tl.velocity_pseudotime(adata)
fig, ax = plt.subplots(figsize=(10, 8))
sc.pl.umap(adata, color="velocity_pseudotime", ax=ax, show=False,
           title="Velocity Pseudotime", cmap="viridis")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "velocity_pseudotime.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- PAGA Velocity ---
scv.tl.paga(adata, groups=CLUSTER_KEY)
fig, ax = plt.subplots(figsize=(10, 8))
scv.pl.paga(adata, basis="umap", ax=ax, show=False,
            title="PAGA with Velocity Directions")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "paga_velocity.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Save ---
adata.write_h5ad(OUTPUT_H5AD)
print(f"\nSaved: {OUTPUT_H5AD}")
print(f"Plots saved to: {OUTPUT_DIR}")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mode` | `"stochastic"` | Velocity model. `"stochastic"` is fast; `"dynamical"` is more accurate and provides latent time. |
| `n_top_genes` | 2000 | Number of highly variable genes for velocity analysis. |
| `min_shared_counts` | 20 | Minimum shared counts (spliced+unspliced) per gene per cell. |
| `n_neighbors` | 30 | Neighbors for moment computation. |
| `n_jobs` | 1 | Parallel jobs for `recover_dynamics`. Set to 8+ for speed. |

## Common Issues

- **No "spliced"/"unspliced" layers**: You need to quantify spliced/unspliced counts. Options:
  - `STARsolo --soloFeatures Gene Velocyto` during alignment
  - `velocyto run` post-alignment on BAM files
  - `kb count` with `--workflow lamanno` (kallisto|bustools)
- **Low unspliced/spliced ratio (<0.05)**: Poor unspliced count recovery. Common with 10x 3' data. Try using `scv.pp.filter_and_normalize(adata, min_shared_counts=10)` with lower thresholds.
- **Velocity arrows point everywhere / no coherent pattern**: May indicate insufficient unspliced counts, or the biological process is not captured. Try dynamical mode.
- **Dynamical model slow**: `recover_dynamics` is CPU-intensive. Use `n_jobs=8` or more. Reduce `n_top_genes`.
- **Negative velocity for expected transitions**: The steady-state assumption may not hold. Switch to `mode="dynamical"`.
- **Memory issues**: Subsample to 50k-100k cells for velocity computation, then project back.
