---
name: compositional-analysis
description: "Differential abundance testing with pertpy (Milo and scCODA). Test whether cell type proportions change between conditions."
---

# Compositional Analysis (Differential Abundance)

## When to Use

- When asking "which cell types/states change in proportion between conditions?"
- Comparing cell type abundances between treatment vs control, disease vs healthy
- When compositional changes matter (e.g., immune cell infiltration in tumors)
- Two methods: **Milo** (neighborhood-based, more granular) and **scCODA** (cell type-level, Bayesian compositional)

## Prerequisites

- Annotated AnnData with cell type labels, condition labels, and sample IDs
- PCA and neighbor graph computed
- Package: `pertpy`

## Complete Runnable Script: Milo

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Differential abundance testing with Milo (via pertpy). Neighborhood-level analysis."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import pertpy as pt
import numpy as np
import pandas as pd
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/annotated.h5ad"
OUTPUT_DIR = "/workspace/group/milo_results"
CELLTYPE_KEY = "cell_type"
CONDITION_KEY = "condition"
SAMPLE_KEY = "sample"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")

# --- Ensure neighbors computed ---
if "neighbors" not in adata.uns:
    sc.pp.neighbors(adata, n_pcs=30)
if "X_umap" not in adata.obsm:
    sc.tl.umap(adata)

# --- Run Milo ---
milo = pt.tl.Milo()
mdata = milo.load(adata)

# Build KNN graph and neighborhoods
milo.make_nhoods(mdata, prop=0.1)
print(f"Number of neighborhoods: {mdata['milo'].n_obs}")

# Count cells per neighborhood per sample
milo.count_nhoods(mdata, sample_col=SAMPLE_KEY)

# Annotate neighborhoods with cell type (majority vote)
milo.annotate_nhoods(mdata, anno_col=CELLTYPE_KEY)

# Differential abundance test
milo.da_nhoods(
    mdata,
    design=f"~{CONDITION_KEY}",
    model_contrasts=None,
)

# Get results
da_results = mdata["milo"].var.copy()
print(f"\nSignificant neighborhoods (FDR < 0.1): {(da_results['SpatialFDR'] < 0.1).sum()}")

# --- Beeswarm Plot ---
fig, ax = plt.subplots(figsize=(12, 6))
try:
    milo.plot_nhood_graph(
        mdata,
        alpha=0.1,
        min_size=20,
        ax=ax,
    )
except Exception:
    # Fallback: simple beeswarm-like plot
    da_results_sig = da_results[da_results["SpatialFDR"] < 0.1]
    if "nhood_annotation" in da_results.columns:
        for i, ct in enumerate(da_results["nhood_annotation"].unique()):
            ct_data = da_results[da_results["nhood_annotation"] == ct]["logFC"]
            jitter = np.random.normal(0, 0.1, len(ct_data))
            colors = ["red" if x > 0 else "blue" for x in ct_data]
            ax.scatter([i] * len(ct_data) + jitter, ct_data, c=colors, alpha=0.3, s=10)
        ax.set_xticks(range(len(da_results["nhood_annotation"].unique())))
        ax.set_xticklabels(da_results["nhood_annotation"].unique(), rotation=45, ha="right")
        ax.axhline(0, ls="--", c="grey")
        ax.set_ylabel("log Fold Change")
        ax.set_title("Milo Differential Abundance by Cell Type")

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "milo_da_beeswarm.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Summary Per Cell Type ---
if "nhood_annotation" in da_results.columns:
    summary = da_results.groupby("nhood_annotation").agg(
        n_nhoods=("logFC", "count"),
        mean_logFC=("logFC", "mean"),
        n_sig=("SpatialFDR", lambda x: (x < 0.1).sum()),
    ).round(3)
    summary.to_csv(os.path.join(OUTPUT_DIR, "milo_summary_by_celltype.csv"))
    print("\nSummary by cell type:")
    print(summary.to_string())

da_results.to_csv(os.path.join(OUTPUT_DIR, "milo_da_results.csv"))
print(f"\nResults saved to: {OUTPUT_DIR}")
```

## Complete Runnable Script: scCODA

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Differential abundance with scCODA (via pertpy). Bayesian compositional analysis at cell type level."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import pertpy as pt
import numpy as np
import pandas as pd
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/annotated.h5ad"
OUTPUT_DIR = "/workspace/group/sccoda_results"
CELLTYPE_KEY = "cell_type"
CONDITION_KEY = "condition"
SAMPLE_KEY = "sample"
REFERENCE_CELLTYPE = "automatic"  # Set to a specific cell type or "automatic"
FDR_THRESHOLD = 0.05

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")

# --- Build Composition Table ---
sccoda = pt.tl.Sccoda()
sccoda_data = sccoda.load(
    adata,
    type="cell_level",
    generate_sample_level=True,
    cell_type_identifier=CELLTYPE_KEY,
    sample_identifier=SAMPLE_KEY,
    covariate_obs=[CONDITION_KEY],
)

print(f"Composition table shape: {sccoda_data['coda'].shape}")
print(sccoda_data["coda"].to_df().head())

# --- Composition Bar Plot ---
fig, ax = plt.subplots(figsize=(12, 6))
comp_df = sccoda_data["coda"].to_df()
comp_frac = comp_df.div(comp_df.sum(axis=1), axis=0)
comp_frac.plot(kind="bar", stacked=True, ax=ax, colormap="Set3")
ax.set_ylabel("Fraction")
ax.set_title("Cell Type Composition per Sample")
ax.legend(bbox_to_anchor=(1.05, 1), loc="upper left", fontsize=8)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "composition_barplot.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Run scCODA ---
sccoda.prepare(
    sccoda_data,
    formula=f"C({CONDITION_KEY})",
    reference_cell_type=REFERENCE_CELLTYPE,
)

sccoda.run_nuts(sccoda_data, num_warmup=500, num_samples=1000)

# --- Get Results ---
results_df = sccoda.credible_effects(sccoda_data, est_fdr=FDR_THRESHOLD)
print(f"\nscCODA Results (FDR < {FDR_THRESHOLD}):")
print(results_df)

# Save
results_df.to_csv(os.path.join(OUTPUT_DIR, "sccoda_results.csv"))
print(f"\nResults saved to: {OUTPUT_DIR}")
```

## Key Parameters

### Milo

| Parameter | Default | Description |
|-----------|---------|-------------|
| `prop` | 0.1 | Proportion of cells to sample as neighborhood centers. Higher = more neighborhoods. |
| `design` | - | R-style formula for the test (e.g., `~condition`). |
| `SpatialFDR` threshold | 0.1 | FDR threshold for significance. |

### scCODA

| Parameter | Default | Description |
|-----------|---------|-------------|
| `reference_cell_type` | `"automatic"` | Cell type assumed stable. Auto-selects the least variable type. |
| `num_warmup` | 500 | MCMC warmup iterations. |
| `num_samples` | 1000 | MCMC sampling iterations. |
| `est_fdr` | 0.05 | FDR threshold for credible effects. |

## Common Issues

- **Milo: "Not enough cells in neighborhoods"**: Increase `prop` (try 0.2, 0.3) or ensure neighbor graph has enough neighbors.
- **scCODA: Reference cell type matters**: Results depend on the reference. Try different references and check stability. Use `"automatic"` as default.
- **Few samples**: Both methods work better with more replicates (3+ per condition). With 2 per condition, power is very limited.
- **Confounders**: Add to the design formula: `design="~condition + sex"` (Milo) or `formula="C(condition) + C(sex)"` (scCODA).
- **Milo slow**: Reduce `prop` (0.05) for large datasets. The bottleneck is neighborhood counting.
- **Interpretation**: Positive logFC in Milo means more abundant in the test condition relative to reference. In scCODA, credible effects indicate significant changes.
