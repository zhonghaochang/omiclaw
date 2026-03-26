---
name: cellrank
description: "CellRank 2 for fate probability analysis. Velocity kernel, pseudotime kernel. Terminal/initial state identification, fate probabilities, driver genes."
---

# CellRank 2

## When to Use

- Identify initial and terminal cell states from data
- Compute fate probabilities (probability of each cell reaching each terminal state)
- Find driver genes for lineage commitment
- Combine multiple signals: RNA velocity, pseudotime, gene expression similarity
- More robust than velocity alone (handles noisy velocity estimates)

## Prerequisites

- Annotated AnnData with PCA, neighbors, UMAP
- For velocity kernel: RNA velocity computed (scVelo)
- For pseudotime kernel: pseudotime computed (DPT or scVelo latent time)
- Package: `cellrank`

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""CellRank 2: fate probability analysis with velocity and pseudotime kernels."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import scvelo as scv
import cellrank as cr
import numpy as np
import pandas as pd
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/velocity.h5ad"  # AnnData with velocity computed
OUTPUT_H5AD = "/workspace/group/cellrank.h5ad"
OUTPUT_DIR = "/workspace/group/cellrank_results"
CELLTYPE_KEY = "cell_type"
CLUSTER_KEY = "leiden"
N_TERMINAL_STATES = None  # Auto-detect if None, or set to integer
N_INITIAL_STATES = None   # Auto-detect if None
USE_VELOCITY = True       # Use velocity kernel
USE_PSEUDOTIME = True     # Use pseudotime kernel
PSEUDOTIME_KEY = "latent_time"  # Or "dpt_pseudotime" or "velocity_pseudotime"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")

# --- Build Kernel ---
kernels = []

# 1. Velocity Kernel
if USE_VELOCITY and "velocity" in adata.layers:
    print("Building VelocityKernel...")
    vk = cr.kernels.VelocityKernel(adata)
    vk.compute_transition_matrix()
    kernels.append(vk)
    print("  VelocityKernel computed")
else:
    print("Skipping VelocityKernel (no velocity in layers)")

# 2. Pseudotime Kernel
if USE_PSEUDOTIME and PSEUDOTIME_KEY in adata.obs:
    print(f"Building PseudotimeKernel from '{PSEUDOTIME_KEY}'...")
    pk = cr.kernels.PseudotimeKernel(adata, time_key=PSEUDOTIME_KEY)
    pk.compute_transition_matrix(threshold_scheme="soft")
    kernels.append(pk)
    print("  PseudotimeKernel computed")
else:
    print(f"Skipping PseudotimeKernel ('{PSEUDOTIME_KEY}' not found)")

# 3. Connectivity Kernel (always useful as regularization)
print("Building ConnectivityKernel...")
ck = cr.kernels.ConnectivityKernel(adata)
ck.compute_transition_matrix()
kernels.append(ck)

# Combine kernels
if len(kernels) == 1:
    combined_kernel = kernels[0]
elif len(kernels) == 2:
    combined_kernel = 0.8 * kernels[0] + 0.2 * kernels[1]
else:
    # velocity + pseudotime + connectivity
    combined_kernel = 0.4 * kernels[0] + 0.4 * kernels[1] + 0.2 * kernels[2]

print(f"Combined kernel: {combined_kernel}")

# --- Estimator: GPCCA ---
print("\nFitting GPCCA estimator...")
estimator = cr.estimators.GPCCA(combined_kernel)

# Compute Schur decomposition
estimator.compute_schur(n_components=20)

# --- Identify Terminal States ---
print("Identifying terminal states...")
estimator.compute_macrostates(n_states=10, cluster_key=CLUSTER_KEY)

# Plot macrostates
fig, ax = plt.subplots(figsize=(10, 8))
estimator.plot_macrostates(which="all", basis="umap", ax=ax, show=False,
                           title="Macrostates")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "macrostates.png"), dpi=150, bbox_inches="tight")
plt.close()

# Set terminal states
if N_TERMINAL_STATES is not None:
    estimator.set_terminal_states(n_cells=30)
else:
    estimator.predict_terminal_states()

terminal_states = estimator.terminal_states.cat.categories.tolist()
print(f"Terminal states: {terminal_states}")

# --- Identify Initial States ---
if N_INITIAL_STATES is not None:
    estimator.predict_initial_states(n_states=N_INITIAL_STATES)
else:
    estimator.predict_initial_states()

initial_states = estimator.initial_states.cat.categories.tolist()
print(f"Initial states: {initial_states}")

# Plot terminal and initial states
fig, axes = plt.subplots(1, 2, figsize=(18, 8))
estimator.plot_macrostates(which="terminal", basis="umap", ax=axes[0], show=False,
                           title="Terminal States")
estimator.plot_macrostates(which="initial", basis="umap", ax=axes[1], show=False,
                           title="Initial States")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "terminal_initial_states.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Compute Fate Probabilities ---
print("Computing fate probabilities...")
estimator.compute_fate_probabilities()

# Plot fate probabilities
fig, axes = plt.subplots(1, len(terminal_states), figsize=(6 * len(terminal_states), 6))
if len(terminal_states) == 1:
    axes = [axes]
for i, state in enumerate(terminal_states):
    estimator.plot_fate_probabilities(
        states=[state], basis="umap", ax=axes[i], show=False,
        title=f"Fate: {state}",
    )
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "fate_probabilities.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Fate Probability Pie Chart per Cluster ---
fig, ax = plt.subplots(figsize=(12, 8))
try:
    estimator.plot_fate_probabilities(
        same_plot=True, basis="umap", ax=ax, show=False,
        title="Combined Fate Probabilities",
    )
except Exception:
    # Fallback: bar plot of mean fate probability per cell type
    fate_probs = adata.obsm["lineages_fwd"] if "lineages_fwd" in adata.obsm else estimator.fate_probabilities
    if hasattr(fate_probs, "to_df"):
        fate_df = fate_probs.to_df()
    else:
        fate_df = pd.DataFrame(fate_probs, index=adata.obs.index, columns=terminal_states)
    fate_df[CELLTYPE_KEY] = adata.obs[CELLTYPE_KEY].values
    mean_fates = fate_df.groupby(CELLTYPE_KEY).mean()
    mean_fates.plot(kind="bar", stacked=True, ax=ax, colormap="Set2")
    ax.set_ylabel("Mean Fate Probability")
    ax.set_title("Fate Probabilities by Cell Type")
    ax.legend(bbox_to_anchor=(1.05, 1))

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "fate_by_celltype.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Driver Genes for Each Lineage ---
print("\nFinding driver genes for each terminal state...")
driver_results = {}
for state in terminal_states:
    print(f"\n  Terminal state: {state}")
    try:
        drivers = estimator.compute_lineage_drivers(
            lineages=[state],
            return_drivers=True,
        )
        drivers = drivers.sort_values(f"{state}_corr", ascending=False)
        top_drivers = drivers.head(20)
        driver_results[state] = top_drivers
        print(f"  Top 5 drivers: {top_drivers.index[:5].tolist()}")
        top_drivers.to_csv(os.path.join(OUTPUT_DIR, f"drivers_{state.replace(' ', '_')}.csv"))
    except Exception as e:
        print(f"  Driver analysis failed: {e}")

# Plot top driver genes
if driver_results:
    for state, drivers in driver_results.items():
        top_genes = drivers.index[:4].tolist()
        available = [g for g in top_genes if g in adata.var_names]
        if available:
            fig, axes = plt.subplots(1, len(available), figsize=(5 * len(available), 5))
            if len(available) == 1:
                axes = [axes]
            for i, gene in enumerate(available):
                sc.pl.umap(adata, color=gene, ax=axes[i], show=False, title=f"{gene}\n(driver for {state})")
            plt.tight_layout()
            state_safe = state.replace(" ", "_").replace("/", "_")
            plt.savefig(os.path.join(OUTPUT_DIR, f"driver_genes_{state_safe}.png"),
                        dpi=150, bbox_inches="tight")
            plt.close()

# --- Save ---
adata.write_h5ad(OUTPUT_H5AD)
print(f"\nSaved: {OUTPUT_H5AD}")
print(f"Plots saved to: {OUTPUT_DIR}")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `n_states` (macrostates) | 10 | Number of macrostates for GPCCA decomposition. Start with 10, adjust based on eigenvalue gap. |
| `n_cells` (terminal) | 30 | Cells per terminal state for setting terminal states manually. |
| `threshold_scheme` | `"soft"` | For PseudotimeKernel. `"soft"` allows backward transitions; `"hard"` strictly enforces pseudotime direction. |
| Kernel weights | varies | Relative weight of each kernel. Velocity typically 0.4-0.8, pseudotime 0.2-0.4, connectivity 0.1-0.2. |

## Kernel Options

| Kernel | Signal | When to Use |
|--------|--------|-------------|
| `VelocityKernel` | RNA velocity | When velocity is available and reliable |
| `PseudotimeKernel` | Pseudotime ordering | When velocity is noisy or unavailable |
| `ConnectivityKernel` | kNN graph similarity | Regularization, smooth noisy transitions |
| `CytoTRACEKernel` | CytoTRACE score | When no velocity/pseudotime; uses gene count as proxy for stemness |
| `RealTimeKernel` | Experimental time points | Time-course experiments with known collection times |

## Common Issues

- **"No velocity found"**: Compute velocity first with scVelo. Or use PseudotimeKernel + ConnectivityKernel instead.
- **Too many/few macrostates**: Check the eigenvalue gap plot (`estimator.plot_spectrum()`). The number of macrostates should match the gap.
- **Terminal states don't match biology**: Manually set terminal states: `estimator.set_terminal_states(states=["state1", "state2"])`.
- **Fate probabilities are uniform**: The kernel may not have enough signal. Try adjusting kernel weights or using a different kernel combination.
- **Driver gene analysis fails**: Ensure fate probabilities are computed first. Need sufficient cells in each lineage.
- **Memory/speed**: CellRank operates on the full transition matrix. For >200k cells, consider subsampling for the GPCCA step.
- **CellRank 1 vs 2 API**: CellRank 2 uses `cr.kernels` and `cr.estimators.GPCCA`. The old `cr.tl.terminal_states()` API is deprecated.
