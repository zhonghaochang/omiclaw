# Quality Control (QC) for Single-Cell RNA-seq

## When to Use

Use this skill immediately after loading raw count data. QC removes:
- Low-quality cells (damaged, empty droplets)
- Cells with too few or too many genes (empty droplets or doublets)
- Cells with high mitochondrial gene percentage (dying cells)
- Genes expressed in too few cells

## Prerequisites

All packages are pre-installed:
- `scanpy`, `anndata`
- `matplotlib`, `numpy`, `pandas`

## Script 1: Complete QC Pipeline with PBMC3k

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Complete quality control pipeline for single-cell RNA-seq data.

Uses PBMC3k as the demo dataset. Adapt thresholds for your data.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

# --- Configuration ---
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR
sc.settings.verbosity = 2  # Show hints

# --- Step 1: Load data ---
print("=" * 60)
print("Step 1: Loading data")
print("=" * 60)
adata = sc.datasets.pbmc3k()
print(f"  Raw data: {adata.n_obs} cells x {adata.n_vars} genes")

# Make gene names unique
adata.var_names_make_unique()

# --- Step 2: Calculate QC metrics ---
print("\n" + "=" * 60)
print("Step 2: Calculating QC metrics")
print("=" * 60)

# Annotate mitochondrial genes
adata.var["mt"] = adata.var_names.str.startswith("MT-")
print(f"  Mitochondrial genes found: {adata.var['mt'].sum()}")

# Annotate ribosomal genes
adata.var["ribo"] = adata.var_names.str.startswith(("RPS", "RPL"))
print(f"  Ribosomal genes found: {adata.var['ribo'].sum()}")

# Annotate hemoglobin genes
adata.var["hb"] = adata.var_names.str.contains("^HB[^(P)]", case=False)
print(f"  Hemoglobin genes found: {adata.var['hb'].sum()}")

# Calculate QC metrics
sc.pp.calculate_qc_metrics(
    adata,
    qc_vars=["mt", "ribo", "hb"],
    percent_top=None,
    log1p=True,   # Also calculate log1p-transformed metrics
    inplace=True,
)

# Print QC metric summaries
print(f"\n  QC metrics added to adata.obs:")
print(f"    n_genes_by_counts:  median={adata.obs['n_genes_by_counts'].median():.0f}, "
      f"range=[{adata.obs['n_genes_by_counts'].min()}, {adata.obs['n_genes_by_counts'].max()}]")
print(f"    total_counts:       median={adata.obs['total_counts'].median():.0f}, "
      f"range=[{adata.obs['total_counts'].min():.0f}, {adata.obs['total_counts'].max():.0f}]")
print(f"    pct_counts_mt:      median={adata.obs['pct_counts_mt'].median():.1f}%, "
      f"range=[{adata.obs['pct_counts_mt'].min():.1f}%, {adata.obs['pct_counts_mt'].max():.1f}%]")
print(f"    pct_counts_ribo:    median={adata.obs['pct_counts_ribo'].median():.1f}%")
print(f"    pct_counts_hb:      median={adata.obs['pct_counts_hb'].median():.1f}%")

# --- Step 3: QC Visualization ---
print("\n" + "=" * 60)
print("Step 3: Generating QC plots")
print("=" * 60)

# Violin plots of QC metrics
sc.pl.violin(
    adata,
    ["n_genes_by_counts", "total_counts", "pct_counts_mt"],
    jitter=0.4,
    multi_panel=True,
    save="_qc_violin.png",
    show=False,
)
print("  Saved QC violin plots")

# Scatter plots: total_counts vs n_genes, colored by pct_counts_mt
fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].scatter(adata.obs["total_counts"], adata.obs["n_genes_by_counts"],
                c=adata.obs["pct_counts_mt"], cmap="viridis", s=1, alpha=0.5)
axes[0].set_xlabel("Total counts")
axes[0].set_ylabel("Number of genes")
axes[0].set_title("Counts vs Genes (colored by %MT)")

axes[1].scatter(adata.obs["total_counts"], adata.obs["pct_counts_mt"],
                s=1, alpha=0.5, color="steelblue")
axes[1].set_xlabel("Total counts")
axes[1].set_ylabel("% Mitochondrial")
axes[1].set_title("Counts vs %MT")
axes[1].axhline(y=20, color="red", linestyle="--", label="Threshold=20%")
axes[1].legend()

axes[2].scatter(adata.obs["n_genes_by_counts"], adata.obs["pct_counts_mt"],
                s=1, alpha=0.5, color="steelblue")
axes[2].set_xlabel("Number of genes")
axes[2].set_ylabel("% Mitochondrial")
axes[2].set_title("Genes vs %MT")
axes[2].axhline(y=20, color="red", linestyle="--", label="Threshold=20%")
axes[2].legend()

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "qc_scatter.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved QC scatter plots")

# --- Step 4: Apply Fixed-Threshold Filtering ---
print("\n" + "=" * 60)
print("Step 4: Filtering cells and genes (fixed thresholds)")
print("=" * 60)

n_before = adata.n_obs
print(f"  Before filtering: {adata.n_obs} cells x {adata.n_vars} genes")

# Filter genes: keep genes expressed in at least 3 cells
sc.pp.filter_genes(adata, min_cells=3)
print(f"  After gene filter (min_cells=3): {adata.n_vars} genes")

# Filter cells: minimum number of genes
sc.pp.filter_cells(adata, min_genes=200)
print(f"  After min_genes=200 filter: {adata.n_obs} cells")

# Filter cells: maximum number of genes (potential doublets)
adata = adata[adata.obs.n_genes_by_counts < 2500].copy()
print(f"  After max_genes=2500 filter: {adata.n_obs} cells")

# Filter cells: mitochondrial percentage
adata = adata[adata.obs.pct_counts_mt < 20].copy()
print(f"  After pct_mt<20% filter: {adata.n_obs} cells")

n_after = adata.n_obs
print(f"\n  Total cells removed: {n_before - n_after} ({(n_before - n_after)/n_before*100:.1f}%)")
print(f"  Final: {adata.n_obs} cells x {adata.n_vars} genes")

# Save filtered data
out_path = os.path.join(OUTPUT_DIR, "qc_filtered.h5ad")
adata.write(out_path)
print(f"\nSaved filtered data to {out_path}")
print("Done.")
```

## Script 2: MAD-Based Adaptive Outlier Detection

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""MAD-based (Median Absolute Deviation) outlier detection for QC.

Instead of fixed thresholds, this approach adapts to your data distribution.
A cell is an outlier if its QC metric deviates more than N MADs from the median.
This is the recommended approach for most datasets.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import pandas as pd
import os

# --- Configuration ---
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR
N_MADS = 5  # Number of MADs for outlier detection (commonly 3-5)

# --- Load data ---
print("Loading PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
print(f"  Raw: {adata.n_obs} cells x {adata.n_vars} genes")

# --- Calculate QC metrics ---
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)

# --- Define MAD-based outlier detection function ---
def is_outlier(adata, metric, n_mads=5):
    """Identify outliers using MAD (Median Absolute Deviation).

    A cell is an outlier if:
        |value - median| > n_mads * MAD
    where MAD = median(|values - median(values)|)
    """
    M = adata.obs[metric]
    median_val = np.median(M)
    mad = np.median(np.abs(M - median_val))
    # Avoid zero MAD
    if mad == 0:
        mad = np.std(M) * 0.6745  # Approximate MAD from std
    outlier = (np.abs(M - median_val) > n_mads * mad)
    print(f"  {metric}: median={median_val:.1f}, MAD={mad:.1f}, "
          f"range=[{median_val - n_mads * mad:.1f}, {median_val + n_mads * mad:.1f}], "
          f"outliers={outlier.sum()}")
    return outlier

# --- Apply MAD-based filtering ---
print(f"\nMAD-based outlier detection (n_mads={N_MADS}):")

# Log-transform metrics for more symmetric distribution
adata.obs["log1p_total_counts"] = np.log1p(adata.obs["total_counts"])
adata.obs["log1p_n_genes_by_counts"] = np.log1p(adata.obs["n_genes_by_counts"])

# Detect outliers for each metric
outlier_total = is_outlier(adata, "log1p_total_counts", N_MADS)
outlier_genes = is_outlier(adata, "log1p_n_genes_by_counts", N_MADS)
outlier_mt = is_outlier(adata, "pct_counts_mt", N_MADS)

# Combine: a cell is removed if it is an outlier in ANY metric
# For MT%, we only flag cells with HIGH values (not low)
median_mt = np.median(adata.obs["pct_counts_mt"])
mad_mt = np.median(np.abs(adata.obs["pct_counts_mt"] - median_mt))
if mad_mt == 0:
    mad_mt = np.std(adata.obs["pct_counts_mt"]) * 0.6745
outlier_mt_high = adata.obs["pct_counts_mt"] > (median_mt + N_MADS * mad_mt)

adata.obs["outlier"] = outlier_total | outlier_genes | outlier_mt_high

print(f"\n  Combined outliers: {adata.obs['outlier'].sum()} cells "
      f"({adata.obs['outlier'].sum()/adata.n_obs*100:.1f}%)")

# Also apply basic gene filter
sc.pp.filter_genes(adata, min_cells=3)

# --- Visualization: Before vs After ---
fig, axes = plt.subplots(1, 3, figsize=(15, 4))
for ax, metric, title in zip(
    axes,
    ["n_genes_by_counts", "total_counts", "pct_counts_mt"],
    ["Genes per cell", "Total counts", "% Mitochondrial"],
):
    outlier_mask = adata.obs["outlier"]
    ax.scatter(range(adata.n_obs), adata.obs[metric],
               c=outlier_mask.map({True: "red", False: "steelblue"}),
               s=1, alpha=0.5)
    ax.set_xlabel("Cell index")
    ax.set_ylabel(metric)
    ax.set_title(title)

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "mad_outliers.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved MAD outlier plot")

# --- Apply filter ---
n_before = adata.n_obs
adata = adata[~adata.obs["outlier"]].copy()
print(f"\n  Before: {n_before} cells")
print(f"  After MAD filtering: {adata.n_obs} cells")
print(f"  Removed: {n_before - adata.n_obs} cells")

# Save
out_path = os.path.join(OUTPUT_DIR, "qc_mad_filtered.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 3: Per-Sample QC (Multi-Sample Experiments)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Per-sample QC for multi-sample experiments.

When samples have different quality, apply QC thresholds per sample
rather than globally to avoid biased cell removal.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load and prepare (simulating multi-sample with PBMC3k) ---
print("Loading data...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()

# Simulate two samples for demonstration
np.random.seed(42)
adata.obs["sample"] = np.random.choice(["sample_A", "sample_B"], adata.n_obs)
print(f"  Cells per sample: {adata.obs['sample'].value_counts().to_dict()}")

# Calculate QC metrics
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)

# --- Per-sample QC violin plots ---
print("\nGenerating per-sample QC plots...")
fig, axes = plt.subplots(1, 3, figsize=(15, 4))
for ax, metric, title in zip(
    axes,
    ["n_genes_by_counts", "total_counts", "pct_counts_mt"],
    ["Genes per cell", "Total counts", "% Mitochondrial"],
):
    for sample in adata.obs["sample"].unique():
        mask = adata.obs["sample"] == sample
        data = adata.obs.loc[mask, metric]
        ax.violinplot(data, positions=[list(adata.obs["sample"].unique()).index(sample)],
                      showmedians=True)
    ax.set_xticks(range(len(adata.obs["sample"].unique())))
    ax.set_xticklabels(adata.obs["sample"].unique())
    ax.set_title(title)

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "per_sample_qc.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved per-sample QC plots")

# --- Per-sample MAD filtering ---
print("\nApplying per-sample MAD-based filtering (n_mads=5)...")
N_MADS = 5

def mad_outlier(values, n_mads=5):
    median_val = np.median(values)
    mad = np.median(np.abs(values - median_val))
    if mad == 0:
        mad = np.std(values) * 0.6745
    return np.abs(values - median_val) > n_mads * mad

outlier_mask = np.zeros(adata.n_obs, dtype=bool)

for sample in adata.obs["sample"].unique():
    sample_mask = adata.obs["sample"] == sample
    sample_idx = np.where(sample_mask)[0]

    log_counts = np.log1p(adata.obs.loc[sample_mask, "total_counts"])
    log_genes = np.log1p(adata.obs.loc[sample_mask, "n_genes_by_counts"])
    mt_pct = adata.obs.loc[sample_mask, "pct_counts_mt"]

    out_counts = mad_outlier(log_counts, N_MADS)
    out_genes = mad_outlier(log_genes, N_MADS)

    # For MT: only flag high values
    median_mt = np.median(mt_pct)
    mad_mt = np.median(np.abs(mt_pct - median_mt))
    if mad_mt == 0:
        mad_mt = np.std(mt_pct) * 0.6745
    out_mt = mt_pct > (median_mt + N_MADS * mad_mt)

    sample_outliers = out_counts | out_genes | out_mt
    outlier_mask[sample_idx] = sample_outliers
    print(f"  {sample}: {sample_outliers.sum()}/{sample_mask.sum()} outliers "
          f"({sample_outliers.sum()/sample_mask.sum()*100:.1f}%)")

# Apply basic filters first
sc.pp.filter_genes(adata, min_cells=3)
sc.pp.filter_cells(adata, min_genes=200)

# Apply MAD filter
n_before = adata.n_obs
# Reindex outlier_mask to match current adata after basic filtering
outlier_mask_series = adata.obs.index.isin(
    adata.obs.index[outlier_mask[:len(adata.obs)]]
)
adata.obs["outlier"] = outlier_mask[:adata.n_obs]
adata = adata[~adata.obs["outlier"]].copy()

print(f"\n  Before: {n_before} cells")
print(f"  After per-sample QC: {adata.n_obs} cells")

out_path = os.path.join(OUTPUT_DIR, "per_sample_qc_filtered.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Key Parameters

| Function | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `sc.pp.calculate_qc_metrics` | `qc_vars` | `None` | List of gene group keys in `adata.var` (e.g., `["mt"]`) |
| `sc.pp.calculate_qc_metrics` | `percent_top` | `(50, 100, 200, 500)` | Calculate % counts in top N genes |
| `sc.pp.calculate_qc_metrics` | `log1p` | `False` | Also compute log1p-transformed metrics |
| `sc.pp.filter_cells` | `min_genes` | `None` | Minimum number of genes per cell |
| `sc.pp.filter_cells` | `min_counts` | `None` | Minimum total counts per cell |
| `sc.pp.filter_genes` | `min_cells` | `None` | Minimum number of cells expressing the gene |
| MAD threshold | `n_mads` | 5 | Number of MADs for outlier detection (3-5 typical) |

## Typical QC Thresholds (Starting Points)

| Metric | Typical Range | Notes |
|--------|--------------|-------|
| `min_genes` | 200-500 | Lower for plate-based, higher for droplet |
| `max_genes` | 2500-5000 | High values suggest doublets |
| `min_cells` | 3-10 | Genes in fewer cells are noise |
| `pct_counts_mt` | <5-20% | Tissue-dependent; brain ~5%, tumors ~20% |
| `min_counts` | 500-1000 | Total UMI counts per cell |
| MAD `n_mads` | 3-5 | Stricter (3) vs lenient (5) |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No MT genes found | Wrong species prefix | Mouse: `mt-` (lowercase), Human: `MT-`. Check with `adata.var_names.str.startswith("MT-").sum()` |
| Too many cells removed | Thresholds too strict | Use MAD-based approach or loosen thresholds |
| QC plots look bimodal | Mixed quality or cell types | Consider per-sample QC or check for batch effects |
| `pct_counts_mt` all zeros | MT genes not in dataset | Check if MT genes were filtered upstream or use different prefix |
| `n_genes_by_counts` missing | Forgot `calculate_qc_metrics` | Run `sc.pp.calculate_qc_metrics()` before filtering |
