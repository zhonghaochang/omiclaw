# Manual Cell Type Annotation

## When to Use

Use this skill after Leiden clustering to:
- Identify marker genes that define each cluster
- Visualize marker expression patterns (dotplot, stacked violin, matrixplot)
- Manually assign cell type labels based on domain knowledge

## Prerequisites

All packages are pre-installed:
- `scanpy`, `anndata`
- `matplotlib`, `pandas`, `numpy`

## Script 1: Complete Marker Gene Analysis and Manual Annotation

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Find marker genes, visualize, and manually annotate cell types.

Complete workflow using PBMC3k as example.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import pandas as pd
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR
sc.settings.verbosity = 2

# --- Load and preprocess ---
print("Loading and preprocessing PBMC3k...")
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()

# Store raw counts
adata.layers["counts"] = adata.X.copy()

# Normalize and cluster
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, n_top_genes=2000, flavor="seurat_v3", layer="counts")
sc.pp.scale(adata, max_value=10)
sc.tl.pca(adata, n_comps=50, use_highly_variable=True)
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)
sc.tl.leiden(adata, resolution=0.5, random_state=0)
print(f"  {adata.n_obs} cells, {adata.obs['leiden'].nunique()} clusters")

# ==========================================
# Step 1: Find differentially expressed marker genes
# ==========================================
print("\n" + "=" * 60)
print("Step 1: Finding marker genes (Wilcoxon rank-sum test)")
print("=" * 60)

# Use log-normalized data (not scaled) for DE analysis
adata_de = adata.copy()
adata_de.X = adata_de.layers["counts"].copy()
sc.pp.normalize_total(adata_de, target_sum=1e4)
sc.pp.log1p(adata_de)

sc.tl.rank_genes_groups(
    adata_de,
    groupby="leiden",
    method="wilcoxon",         # Recommended for scRNA-seq
    n_genes=200,               # Store top 200 genes per cluster
    pts=True,                  # Calculate fraction of cells expressing gene
)

# Print top 5 markers per cluster
print("\nTop 5 markers per cluster:")
result = adata_de.uns["rank_genes_groups"]
groups = result["names"].dtype.names
for group in sorted(groups, key=int):
    genes = [result["names"][i][group] for i in range(5)]
    scores = [result["scores"][i][group] for i in range(5)]
    pvals = [result["pvals_adj"][i][group] for i in range(5)]
    print(f"\n  Cluster {group}:")
    for g, s, p in zip(genes, scores, pvals):
        print(f"    {g:12s}  score={s:7.1f}  padj={p:.2e}")

# Transfer DE results back to main adata
adata.uns["rank_genes_groups"] = adata_de.uns["rank_genes_groups"]

# Export full marker table
markers_df = sc.get.rank_genes_groups_df(adata_de, group=None)
markers_csv = os.path.join(OUTPUT_DIR, "marker_genes_all.csv")
markers_df.to_csv(markers_csv, index=False)
print(f"\n  Saved full marker table: {markers_csv}")
print(f"  Total marker entries: {len(markers_df)}")

# ==========================================
# Step 2: Visualize discovered markers
# ==========================================
print("\n" + "=" * 60)
print("Step 2: Visualizing discovered markers")
print("=" * 60)

# Rank genes groups plot (top 5 per cluster)
sc.pl.rank_genes_groups(adata, n_genes=5, sharey=False,
                        save="_top5.png", show=False)
print("  Saved rank_genes_groups plot")

# Rank genes groups as dotplot
sc.pl.rank_genes_groups_dotplot(adata, n_genes=4,
                                 save="_markers.png", show=False)
print("  Saved marker dotplot")

# ==========================================
# Step 3: Visualize known marker genes
# ==========================================
print("\n" + "=" * 60)
print("Step 3: Visualizing known PBMC markers")
print("=" * 60)

# Define known PBMC marker genes
known_markers = {
    "CD4 T cells": ["IL7R", "CD4", "CCR7", "LEF1"],
    "CD8 T cells": ["CD8A", "CD8B", "GZMK", "GZMA"],
    "B cells": ["MS4A1", "CD79A", "CD79B", "CD19"],
    "NK cells": ["GNLY", "NKG7", "KLRD1", "PRF1"],
    "CD14 Monocytes": ["CD14", "LYZ", "S100A8", "S100A9"],
    "CD16 Monocytes": ["FCGR3A", "MS4A7", "LST1"],
    "Dendritic cells": ["FCER1A", "CST3", "CLEC10A"],
    "Platelets": ["PPBP", "PF4", "GP1BB"],
}

# Filter to genes present in the dataset
marker_genes_flat = []
marker_gene_groups = {}
for ct, genes in known_markers.items():
    available = [g for g in genes if g in adata.var_names]
    if available:
        marker_gene_groups[ct] = available
        marker_genes_flat.extend(available)

# Remove duplicates while preserving order
seen = set()
marker_genes_unique = []
for g in marker_genes_flat:
    if g not in seen:
        seen.add(g)
        marker_genes_unique.append(g)

print(f"  Known markers found: {len(marker_genes_unique)} / {len(marker_genes_flat)}")

# --- Dotplot ---
sc.pl.dotplot(
    adata,
    var_names=marker_gene_groups,  # Dict groups markers by cell type
    groupby="leiden",
    standard_scale="var",           # Scale per gene for better color contrast
    save="_known_markers.png",
    show=False,
)
print("  Saved dotplot of known markers")

# --- Stacked violin ---
sc.pl.stacked_violin(
    adata,
    var_names=marker_genes_unique[:12],  # Limit for readability
    groupby="leiden",
    swap_axes=True,
    save="_stacked_violin.png",
    show=False,
)
print("  Saved stacked violin plot")

# --- Matrix plot ---
sc.pl.matrixplot(
    adata,
    var_names=marker_gene_groups,
    groupby="leiden",
    standard_scale="var",
    save="_matrixplot.png",
    show=False,
)
print("  Saved matrix plot")

# --- UMAP colored by individual markers ---
key_markers = ["CD3D", "MS4A1", "NKG7", "LYZ", "PPBP", "CST3"]
available_key = [g for g in key_markers if g in adata.var_names]
sc.pl.umap(adata, color=available_key, save="_marker_umap.png", show=False)
print("  Saved UMAP colored by individual markers")

# ==========================================
# Step 4: Manual annotation
# ==========================================
print("\n" + "=" * 60)
print("Step 4: Manual cell type annotation")
print("=" * 60)

# Based on marker inspection, assign cell types to clusters
# MODIFY THIS MAPPING based on your dotplot/violin results
cluster_to_celltype = {
    "0": "CD4 T cells",
    "1": "CD14 Monocytes",
    "2": "B cells",
    "3": "CD8 T cells",
    "4": "NK cells",
    "5": "CD16 Monocytes",
    "6": "Dendritic cells",
    "7": "Platelets",
}

# Apply mapping (unmapped clusters get "Unknown")
adata.obs["cell_type"] = adata.obs["leiden"].map(cluster_to_celltype).fillna("Unknown")
adata.obs["cell_type"] = adata.obs["cell_type"].astype("category")

print("  Annotation mapping:")
for cluster, celltype in sorted(cluster_to_celltype.items(), key=lambda x: int(x[0])):
    n = (adata.obs["leiden"] == cluster).sum()
    print(f"    Cluster {cluster} -> {celltype} ({n} cells)")

# Check for unmapped clusters
unmapped = adata.obs["cell_type"] == "Unknown"
if unmapped.sum() > 0:
    print(f"  WARNING: {unmapped.sum()} cells unmapped!")

# --- Visualize annotations ---
fig, axes = plt.subplots(1, 2, figsize=(16, 6))
sc.pl.umap(adata, color="leiden", ax=axes[0], show=False, title="Leiden clusters")
sc.pl.umap(adata, color="cell_type", ax=axes[1], show=False, title="Cell types")
plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "annotation_comparison.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved annotation comparison plot")

# Cell type composition
print("\nCell type composition:")
for ct in adata.obs["cell_type"].cat.categories:
    n = (adata.obs["cell_type"] == ct).sum()
    print(f"  {ct}: {n} cells ({n/adata.n_obs*100:.1f}%)")

# Save
out_path = os.path.join(OUTPUT_DIR, "manually_annotated.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 2: Filtered Marker Genes (Publication Quality)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Find high-confidence markers with filtering criteria.

Apply stricter filters for publication-quality marker gene lists.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import pandas as pd
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load processed PBMC3k ---
print("Loading PBMC3k processed...")
adata = sc.datasets.pbmc3k_processed()
print(f"  {adata.n_obs} cells, {adata.obs['louvain'].nunique()} clusters")

# --- Run DE with filtering ---
print("\nFinding filtered markers...")
sc.tl.rank_genes_groups(
    adata,
    groupby="louvain",
    method="wilcoxon",
    n_genes=200,
    pts=True,
)

# Get full table and apply filters
markers = sc.get.rank_genes_groups_df(adata, group=None)
print(f"  Total DE results: {len(markers)}")

# Apply quality filters
filtered = markers[
    (markers["pvals_adj"] < 0.01) &         # Significant
    (markers["logfoldchanges"] > 1.0) &       # At least 2-fold change
    (markers["pct_nz_group"] > 0.25) &        # Expressed in >25% of cluster
    (markers["pct_nz_reference"] < 0.75)      # Not expressed in >75% of other cells
].copy()

print(f"  After filtering: {len(filtered)} markers")

# Top 10 per group
top10 = filtered.groupby("group").head(10)
print(f"  Top 10 per cluster: {len(top10)} markers")

# Save filtered markers
top10.to_csv(os.path.join(OUTPUT_DIR, "filtered_markers_top10.csv"), index=False)
print("  Saved filtered_markers_top10.csv")

# Print summary
for group in sorted(top10["group"].unique()):
    group_markers = top10[top10["group"] == group]
    genes = group_markers["names"].tolist()[:5]
    print(f"\n  {group}:")
    print(f"    Top 5: {', '.join(genes)}")

# --- Create publication-quality dotplot with filtered markers ---
# Select top 3 per cluster for clean visualization
top3 = filtered.groupby("group").head(3)
genes_for_plot = top3["names"].unique().tolist()

sc.pl.dotplot(
    adata,
    var_names=genes_for_plot,
    groupby="louvain",
    standard_scale="var",
    save="_filtered_markers.png",
    show=False,
)
print("\n  Saved filtered marker dotplot")

# --- Heatmap of top markers ---
sc.pl.rank_genes_groups_heatmap(
    adata,
    n_genes=5,
    groupby="louvain",
    show_gene_labels=True,
    save="_marker_heatmap.png",
    show=False,
)
print("  Saved marker heatmap")

print("\nDone.")
```

## Script 3: Compare DE Methods

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Compare different DE methods for marker gene detection."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import pandas as pd
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load ---
print("Loading PBMC3k processed...")
adata = sc.datasets.pbmc3k_processed()

# --- Compare methods ---
methods = ["wilcoxon", "t-test", "t-test_overestim_var", "logreg"]

for method in methods:
    print(f"\nMethod: {method}")
    sc.tl.rank_genes_groups(
        adata, groupby="louvain", method=method, key_added=f"rank_{method}",
    )

    # Show top 3 markers for first 3 clusters
    result = adata.uns[f"rank_{method}"]
    groups = list(result["names"].dtype.names)[:3]
    for group in groups:
        genes = [result["names"][i][group] for i in range(3)]
        print(f"  {group}: {', '.join(genes)}")

# --- Compare overlap ---
print("\n\nMarker overlap (top 20 per cluster):")
for group in list(adata.uns["rank_wilcoxon"]["names"].dtype.names)[:3]:
    wilcox_genes = set([adata.uns["rank_wilcoxon"]["names"][i][group] for i in range(20)])
    ttest_genes = set([adata.uns["rank_t-test"]["names"][i][group] for i in range(20)])
    overlap = wilcox_genes & ttest_genes
    print(f"  {group}: Wilcoxon/t-test overlap = {len(overlap)}/20")

print("\nRecommendation: Wilcoxon is most robust for scRNA-seq data.")
print("  Use t-test for speed; logreg for multi-class classification features.")
print("Done.")
```

## Key Parameters

| Function | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `sc.tl.rank_genes_groups` | `method` | `"wilcoxon"` | `"wilcoxon"`, `"t-test"`, `"t-test_overestim_var"`, `"logreg"` |
| `sc.tl.rank_genes_groups` | `n_genes` | 100 | Number of top genes to store per cluster |
| `sc.tl.rank_genes_groups` | `pts` | `False` | Calculate fraction of cells expressing gene |
| `sc.tl.rank_genes_groups` | `reference` | `"rest"` | Compare against `"rest"` (all others) or specific group |
| `sc.tl.rank_genes_groups` | `min_fold_change` | 0.25 | Minimum log fold change |
| `sc.pl.dotplot` | `standard_scale` | `None` | `"var"` (per gene) or `"group"` (per cluster) |
| `sc.pl.dotplot` | `var_names` | required | List of genes or dict of {category: [genes]} |

## Common PBMC Markers Reference

| Cell Type | Key Markers | Additional Markers |
|-----------|-------------|-------------------|
| CD4 T cells | IL7R, CD4 | CCR7 (naive), S100A4 (memory) |
| CD8 T cells | CD8A, CD8B | GZMK, GZMA, PRF1 |
| B cells | MS4A1 (CD20), CD79A | CD79B, CD19, IGHM |
| NK cells | NKG7, GNLY | KLRD1, PRF1, GZMB |
| CD14 Monocytes | CD14, LYZ | S100A8, S100A9, VCAN |
| CD16 Monocytes | FCGR3A, MS4A7 | LST1, IFITM3 |
| Dendritic cells | FCER1A, CST3 | CLEC10A, CD1C |
| Plasmacytoid DC | LILRA4, IL3RA | CLEC4C, TCF4 |
| Platelets | PPBP, PF4 | GP1BB, TUBB1 |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Marker gene not found | Gene name format differs | Check `adata.var_names`; may need symbol-to-Ensembl conversion |
| All clusters have same top markers | Used scaled data for DE | Use log-normalized (not scaled) data for `rank_genes_groups` |
| Too many markers per cluster | Loose filtering | Apply `logfoldchanges > 1` and `pvals_adj < 0.01` |
| Cluster identity ambiguous | Biology is complex | Check multiple markers; consider overclustering + merging |
| Dotplot colors not informative | Default scaling | Use `standard_scale="var"` for better contrast |
