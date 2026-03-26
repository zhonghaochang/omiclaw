---
name: diffusion-pseudotime
description: "Diffusion pseudotime (DPT) with scanpy. Root cell selection, pseudotime ordering, PAGA graph, gene expression along pseudotime."
---

# Diffusion Pseudotime (DPT)

## When to Use

- Order cells along a developmental or differentiation trajectory
- Identify branching points in trajectories
- Visualize connectivity between clusters (PAGA graph)
- No spliced/unspliced counts required (works on standard scRNA-seq)
- Simple, fast, well-established method

## Prerequisites

- Preprocessed, clustered AnnData with PCA and neighbor graph
- Knowledge of which cell type/cluster is the "root" (starting point of the trajectory)
- Packages: `scanpy` (built-in)

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Diffusion pseudotime analysis with PAGA graph and gene expression along pseudotime."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import pandas as pd
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/annotated.h5ad"
OUTPUT_H5AD = "/workspace/group/trajectory_dpt.h5ad"
OUTPUT_DIR = "/workspace/group/dpt_results"
CELLTYPE_KEY = "cell_type"
CLUSTER_KEY = "leiden"        # Cluster key for PAGA
ROOT_CELLTYPE = "HSC"         # Cell type to use as root (e.g., stem cells)
# Or set ROOT_CLUSTER = "0" to use a specific cluster as root
ROOT_CLUSTER = None
TRAJECTORY_GENES = ["CD34", "CD38", "MPO", "GATA1", "SPI1"]  # Genes to plot along pseudotime
N_DCS = 15                    # Number of diffusion components

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")

# --- Ensure prerequisites ---
if "X_pca" not in adata.obsm:
    sc.pp.highly_variable_genes(adata, n_top_genes=2000)
    sc.tl.pca(adata, n_comps=50)
if "neighbors" not in adata.uns:
    sc.pp.neighbors(adata, n_pcs=30)
if "X_umap" not in adata.obsm:
    sc.tl.umap(adata)
if CLUSTER_KEY not in adata.obs.columns:
    sc.tl.leiden(adata, resolution=0.8, key_added=CLUSTER_KEY)

# --- Compute Diffusion Map ---
print("Computing diffusion map...")
sc.tl.diffusion_map(adata, n_comps=N_DCS)

# --- PAGA (Partition-based Graph Abstraction) ---
print("Computing PAGA graph...")
sc.tl.paga(adata, groups=CLUSTER_KEY)

# Plot PAGA
fig, axes = plt.subplots(1, 2, figsize=(16, 7))
sc.pl.paga(adata, ax=axes[0], show=False, title="PAGA Graph (clusters)")
sc.pl.paga(adata, color=CELLTYPE_KEY, ax=axes[1], show=False, title="PAGA Graph (cell types)")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "paga_graph.png"), dpi=150, bbox_inches="tight")
plt.close()

# Use PAGA-initialized UMAP for better trajectory visualization
sc.tl.umap(adata, init_pos="paga")

# --- Select Root Cell ---
if ROOT_CLUSTER is not None:
    root_mask = adata.obs[CLUSTER_KEY] == ROOT_CLUSTER
else:
    root_mask = adata.obs[CELLTYPE_KEY] == ROOT_CELLTYPE

if root_mask.sum() == 0:
    print(f"WARNING: No cells found for root. Available cell types: {adata.obs[CELLTYPE_KEY].unique().tolist()}")
    print(f"Available clusters: {adata.obs[CLUSTER_KEY].unique().tolist()}")
    raise ValueError("Root cell type/cluster not found")

# Pick the root cell as the one closest to the centroid of root cells in diffusion space
root_cells = adata[root_mask]
root_centroid = root_cells.obsm["X_diffmap"].mean(axis=0)
dists = np.linalg.norm(root_cells.obsm["X_diffmap"] - root_centroid, axis=1)
root_cell_idx = root_cells.obs.index[np.argmin(dists)]
adata.uns["iroot"] = np.where(adata.obs.index == root_cell_idx)[0][0]
print(f"Root cell: {root_cell_idx} (from {ROOT_CELLTYPE or ROOT_CLUSTER})")

# --- Compute Diffusion Pseudotime ---
print("Computing diffusion pseudotime...")
sc.tl.dpt(adata, n_dcs=N_DCS)
print(f"Pseudotime range: {adata.obs['dpt_pseudotime'].min():.3f} - {adata.obs['dpt_pseudotime'].max():.3f}")

# --- Visualize Pseudotime ---
fig, axes = plt.subplots(2, 2, figsize=(16, 14))

# UMAP colored by pseudotime
sc.pl.umap(adata, color="dpt_pseudotime", ax=axes[0, 0], show=False,
           title="Diffusion Pseudotime", cmap="viridis")

# UMAP colored by cell type
sc.pl.umap(adata, color=CELLTYPE_KEY, ax=axes[0, 1], show=False, title="Cell Types")

# UMAP colored by cluster
sc.pl.umap(adata, color=CLUSTER_KEY, ax=axes[1, 0], show=False, title="Clusters")

# Diffusion components
sc.pl.diffmap(adata, color="dpt_pseudotime", components=["1,2"], ax=axes[1, 1],
              show=False, title="Diffusion Components 1 vs 2")

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "dpt_overview.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Gene Expression Along Pseudotime ---
available_genes = [g for g in TRAJECTORY_GENES if g in adata.var_names]
if available_genes:
    fig, axes = plt.subplots(len(available_genes), 1, figsize=(10, 3 * len(available_genes)))
    if len(available_genes) == 1:
        axes = [axes]

    pt = adata.obs["dpt_pseudotime"].values
    sort_idx = np.argsort(pt)

    for i, gene in enumerate(available_genes):
        if hasattr(adata.X, "toarray"):
            expr = adata[:, gene].X.toarray().flatten()
        else:
            expr = adata[:, gene].X.flatten()

        axes[i].scatter(pt, expr, c=pt, cmap="viridis", s=1, alpha=0.3)

        # Smoothed trend line (rolling average)
        window = max(len(pt) // 100, 50)
        sorted_pt = pt[sort_idx]
        sorted_expr = expr[sort_idx]
        smoothed = pd.Series(sorted_expr).rolling(window=window, center=True).mean()
        axes[i].plot(sorted_pt, smoothed, c="red", lw=2)

        axes[i].set_xlabel("Pseudotime")
        axes[i].set_ylabel("Expression")
        axes[i].set_title(gene)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "genes_along_pseudotime.png"), dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Plotted {len(available_genes)} genes along pseudotime")

# --- Pseudotime Distribution per Cell Type ---
fig, ax = plt.subplots(figsize=(10, 6))
celltypes = adata.obs[CELLTYPE_KEY].unique()
for ct in sorted(celltypes):
    pt_vals = adata.obs.loc[adata.obs[CELLTYPE_KEY] == ct, "dpt_pseudotime"]
    ax.hist(pt_vals, bins=50, alpha=0.5, label=ct, density=True)
ax.set_xlabel("Pseudotime")
ax.set_ylabel("Density")
ax.set_title("Pseudotime Distribution by Cell Type")
ax.legend(bbox_to_anchor=(1.05, 1), loc="upper left", fontsize=8)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "pseudotime_distribution.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Save ---
adata.write_h5ad(OUTPUT_H5AD)
print(f"Saved: {OUTPUT_H5AD}")
print(f"Plots saved to: {OUTPUT_DIR}")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `n_dcs` | 15 | Number of diffusion components. 10-20 typical. |
| `iroot` | - | Index of root cell. Must be set in `adata.uns["iroot"]`. |
| `n_branchings` | 0 | Number of branchings to detect. Set >0 for branching trajectories. |
| PAGA `threshold` | 0.01 | Edges below this connectivity weight are removed from the PAGA graph. |

## Common Issues

- **"iroot not set"**: You must set `adata.uns["iroot"]` before calling `sc.tl.dpt()`. See the root cell selection code above.
- **Wrong root cell**: Pseudotime is relative to the root. If the trajectory looks reversed, choose a different root cell type.
- **Pseudotime is inf for some cells**: Disconnected components in the diffusion map. Increase `n_neighbors` in `sc.pp.neighbors()` or check for batch effects.
- **PAGA graph has too many/few edges**: Adjust the `threshold` parameter in `sc.pl.paga()`.
- **Branching trajectories**: Set `n_branchings=1` (or more) in `sc.tl.dpt()` for branching analysis. Access branch info via `adata.obs["dpt_groups"]`.
- **Noisy gene trends**: Increase the rolling window size or use `sc.pl.paga_path()` for smoother trends along PAGA paths.
