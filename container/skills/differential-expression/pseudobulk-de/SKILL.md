---
name: pseudobulk-de
description: "Pseudobulk differential expression with PyDESeq2. The RECOMMENDED method for condition comparisons in scRNA-seq."
---

# Pseudobulk Differential Expression (PyDESeq2)

## When to Use

- Comparing gene expression between conditions (treatment vs control, disease vs healthy)
- When you have biological replicates (multiple samples per condition)
- This is the **RECOMMENDED** method over per-cell tests (Wilcoxon, t-test) because it avoids pseudoreplication
- Produces volcano plots, MA plots, and ranked gene lists for downstream pathway analysis

## Prerequisites

- AnnData with raw counts (integer counts in `adata.X` or `adata.layers["counts"]`)
- Cell type annotations in `adata.obs`
- Sample/donor column in `adata.obs`
- Condition column in `adata.obs`
- At least 2 samples per condition (ideally 3+)
- Package: `pydeseq2`

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Pseudobulk DE analysis with PyDESeq2. Aggregates cells per sample+cluster, then runs DESeq2."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import pandas as pd
from scipy import sparse
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats
import os
import warnings
warnings.filterwarnings("ignore")

# --- Configuration ---
INPUT_H5AD = "/workspace/group/annotated.h5ad"
OUTPUT_DIR = "/workspace/group/pseudobulk_de"
CELLTYPE_KEY = "cell_type"    # Cell type annotation column
SAMPLE_KEY = "sample"         # Sample/donor ID column
CONDITION_KEY = "condition"   # Condition column (e.g., "treatment", "control")
REFERENCE = "control"         # Reference level for DE (denominator)
TREATMENT = "treatment"       # Treatment level (numerator)
MIN_CELLS = 10               # Min cells per sample-celltype group
MIN_COUNTS = 10              # Min total counts per gene across all pseudobulk samples
PADJ_THRESHOLD = 0.05
LOG2FC_THRESHOLD = 1.0

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")
print(f"Cell types: {adata.obs[CELLTYPE_KEY].unique().tolist()}")
print(f"Conditions: {adata.obs[CONDITION_KEY].value_counts().to_dict()}")
print(f"Samples: {adata.obs[SAMPLE_KEY].nunique()}")

# --- Ensure raw counts ---
if "counts" in adata.layers:
    count_matrix = adata.layers["counts"]
elif adata.raw is not None:
    count_matrix = adata.raw.X
    adata_genes = adata.raw.var_names
else:
    count_matrix = adata.X
    print("WARNING: Using adata.X as counts. Ensure these are raw integer counts!")

if sparse.issparse(count_matrix):
    count_matrix = count_matrix.toarray()

# --- Pseudobulk Aggregation ---
def aggregate_pseudobulk(adata, count_matrix, celltype, sample_key, condition_key, celltype_key, min_cells):
    """Aggregate cells into pseudobulk samples for a given cell type."""
    mask = adata.obs[celltype_key] == celltype
    ct_obs = adata.obs[mask]
    ct_counts = count_matrix[mask.values]

    # Group by sample
    groups = ct_obs.groupby(sample_key)
    pseudobulk_counts = []
    sample_info = []

    for sample_id, group in groups:
        if len(group) < min_cells:
            print(f"    Skipping {sample_id}: only {len(group)} cells (min={min_cells})")
            continue

        idx = group.index
        positions = [adata.obs.index.get_loc(i) for i in idx]
        mask_positions = np.array([i for i, m in enumerate(mask.values) if m])
        local_positions = []
        for p in positions:
            local_pos = np.where(mask_positions == p)[0]
            if len(local_pos) > 0:
                local_positions.append(local_pos[0])

        summed = ct_counts[local_positions].sum(axis=0)
        if isinstance(summed, np.matrix):
            summed = np.asarray(summed).flatten()
        pseudobulk_counts.append(summed)

        condition = ct_obs.loc[idx[0], condition_key]
        sample_info.append({"sample": sample_id, "condition": condition})

    if len(pseudobulk_counts) == 0:
        return None, None

    count_df = pd.DataFrame(
        np.array(pseudobulk_counts),
        index=[s["sample"] for s in sample_info],
        columns=adata.var_names if hasattr(adata, "var_names") else adata.raw.var_names,
    )
    meta_df = pd.DataFrame(sample_info).set_index("sample")

    return count_df, meta_df


# --- Run DE for Each Cell Type ---
all_results = {}

for celltype in adata.obs[CELLTYPE_KEY].unique():
    print(f"\n{'='*60}")
    print(f"Cell type: {celltype}")
    print(f"{'='*60}")

    count_df, meta_df = aggregate_pseudobulk(
        adata, count_matrix, celltype, SAMPLE_KEY, CONDITION_KEY, CELLTYPE_KEY, MIN_CELLS
    )

    if count_df is None:
        print(f"  Skipped: not enough samples")
        continue

    # Check conditions
    conditions_present = meta_df["condition"].unique()
    if REFERENCE not in conditions_present or TREATMENT not in conditions_present:
        print(f"  Skipped: need both '{REFERENCE}' and '{TREATMENT}' conditions, got {conditions_present.tolist()}")
        continue

    n_ref = (meta_df["condition"] == REFERENCE).sum()
    n_treat = (meta_df["condition"] == TREATMENT).sum()
    print(f"  Samples: {n_ref} {REFERENCE}, {n_treat} {TREATMENT}")

    if n_ref < 2 or n_treat < 2:
        print(f"  Skipped: need at least 2 samples per condition")
        continue

    # Filter lowly expressed genes
    count_df = count_df.astype(int)
    gene_mask = count_df.sum(axis=0) >= MIN_COUNTS
    count_df = count_df.loc[:, gene_mask]
    print(f"  Genes after filtering: {count_df.shape[1]}")

    # Run PyDESeq2
    try:
        dds = DeseqDataSet(
            counts=count_df,
            metadata=meta_df,
            design_factors="condition",
            refit_cooks=True,
            ref_level=["condition", REFERENCE],
        )
        dds.deseq2()

        stat_res = DeseqStats(dds, contrast=["condition", TREATMENT, REFERENCE])
        stat_res.summary()

        results_df = stat_res.results_df.copy()
        results_df = results_df.dropna(subset=["padj"])
        results_df = results_df.sort_values("padj")

        n_sig = ((results_df["padj"] < PADJ_THRESHOLD) & (results_df["log2FoldChange"].abs() > LOG2FC_THRESHOLD)).sum()
        print(f"  Significant genes (padj<{PADJ_THRESHOLD}, |log2FC|>{LOG2FC_THRESHOLD}): {n_sig}")

        # Save results
        ct_safe = celltype.replace("/", "_").replace(" ", "_")
        results_df.to_csv(os.path.join(OUTPUT_DIR, f"de_{ct_safe}.csv"))
        all_results[celltype] = results_df

        # --- Volcano Plot ---
        fig, ax = plt.subplots(figsize=(10, 8))
        sig_mask = (results_df["padj"] < PADJ_THRESHOLD) & (results_df["log2FoldChange"].abs() > LOG2FC_THRESHOLD)
        up_mask = sig_mask & (results_df["log2FoldChange"] > 0)
        down_mask = sig_mask & (results_df["log2FoldChange"] < 0)
        ns_mask = ~sig_mask

        ax.scatter(results_df.loc[ns_mask, "log2FoldChange"], -np.log10(results_df.loc[ns_mask, "padj"]),
                   c="grey", alpha=0.3, s=5, label=f"NS ({ns_mask.sum()})")
        ax.scatter(results_df.loc[up_mask, "log2FoldChange"], -np.log10(results_df.loc[up_mask, "padj"]),
                   c="red", alpha=0.6, s=10, label=f"Up ({up_mask.sum()})")
        ax.scatter(results_df.loc[down_mask, "log2FoldChange"], -np.log10(results_df.loc[down_mask, "padj"]),
                   c="blue", alpha=0.6, s=10, label=f"Down ({down_mask.sum()})")

        # Label top genes
        top_genes = results_df[sig_mask].head(15)
        for gene, row in top_genes.iterrows():
            ax.annotate(gene, (row["log2FoldChange"], -np.log10(row["padj"])),
                       fontsize=7, alpha=0.8)

        ax.axhline(-np.log10(PADJ_THRESHOLD), ls="--", c="grey", lw=0.5)
        ax.axvline(-LOG2FC_THRESHOLD, ls="--", c="grey", lw=0.5)
        ax.axvline(LOG2FC_THRESHOLD, ls="--", c="grey", lw=0.5)
        ax.set_xlabel("log2 Fold Change")
        ax.set_ylabel("-log10(adjusted p-value)")
        ax.set_title(f"Pseudobulk DE: {celltype}\n{TREATMENT} vs {REFERENCE}")
        ax.legend()
        plt.tight_layout()
        plt.savefig(os.path.join(OUTPUT_DIR, f"volcano_{ct_safe}.png"), dpi=150, bbox_inches="tight")
        plt.close()

    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()

# --- Summary Table ---
if all_results:
    summary_rows = []
    for ct, df in all_results.items():
        sig = (df["padj"] < PADJ_THRESHOLD) & (df["log2FoldChange"].abs() > LOG2FC_THRESHOLD)
        summary_rows.append({
            "cell_type": ct,
            "genes_tested": len(df),
            "significant": sig.sum(),
            "up": (sig & (df["log2FoldChange"] > 0)).sum(),
            "down": (sig & (df["log2FoldChange"] < 0)).sum(),
        })
    summary_df = pd.DataFrame(summary_rows)
    summary_df.to_csv(os.path.join(OUTPUT_DIR, "de_summary.csv"), index=False)
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(summary_df.to_string(index=False))
    print(f"\nAll results saved to: {OUTPUT_DIR}")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MIN_CELLS` | 10 | Minimum cells per sample-celltype group. Below this, the sample is excluded. |
| `MIN_COUNTS` | 10 | Minimum total counts per gene across pseudobulk samples. Filters lowly expressed genes. |
| `PADJ_THRESHOLD` | 0.05 | Adjusted p-value cutoff for significance. |
| `LOG2FC_THRESHOLD` | 1.0 | Minimum absolute log2 fold change for significance. |
| `refit_cooks` | True | Refit outliers detected by Cook's distance. Recommended for small sample sizes. |

## Common Issues

- **"Not enough samples per condition"**: Pseudobulk requires biological replicates. You need at least 2 (ideally 3+) samples per condition per cell type. If you only have 1 sample per condition, pseudobulk DE cannot be used; fall back to `sc.tl.rank_genes_groups()` with appropriate caveats.
- **Few/no significant genes**: Try relaxing thresholds (padj<0.1, |log2FC|>0.5). Check if biological signal is weak or sample size is too small.
- **"Counts contain non-integer values"**: PyDESeq2 requires raw integer counts. Ensure you are using raw, un-normalized counts.
- **ConvergenceWarning from DESeq2**: Usually fine for most genes. Increase `n_cpus` for faster fitting.
- **Cell type with very few cells per sample**: Increase `MIN_CELLS` or merge related subtypes.
- **Confounders**: Add covariates to the design formula: `design_factors=["condition", "sex"]`.
