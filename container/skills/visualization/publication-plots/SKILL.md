---
name: publication-plots
description: Publication-quality single-cell plots using scanpy. UMAP, dotplot, stacked violin, matrix plot, rank genes dotplot, spatial plots, and multi-panel figure layouts with journal-ready settings.
---

# Publication-Quality Plots

## When to Use

Use this skill when you need to:
- Create high-resolution UMAP/embedding plots
- Generate dotplots, violin plots, heatmaps for marker genes
- Build multi-panel figure layouts for publications
- Apply consistent journal-quality formatting (fonts, DPI, colors)
- Combine multiple plot types into composite figures

## Prerequisites

- An AnnData object with embeddings (UMAP/tSNE) and cell type annotations
- Differential expression results (for rank_genes_groups plots)

## Complete Pipeline

### Publication Settings and UMAP Plots

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""
Publication-quality plots for single-cell data.
Comprehensive examples of all major plot types.
"""
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
import os
import numpy as np
import scanpy as sc
import warnings
warnings.filterwarnings("ignore")

OUTDIR = "/workspace/group"
os.makedirs(OUTDIR, exist_ok=True)
sc.settings.figdir = OUTDIR

# ══════════════════════════════════════════════
# Publication Figure Settings
# ══════════════════════════════════════════════

sc.set_figure_params(
    dpi=300,
    dpi_save=300,
    frameon=False,
    fontsize=12,
    figsize=(4, 4),
    facecolor="white",
)
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "axes.linewidth": 1.0,
    "xtick.major.width": 1.0,
    "ytick.major.width": 1.0,
    "pdf.fonttype": 42,       # editable text in PDF
    "ps.fonttype": 42,
    "svg.fonttype": "none",   # editable text in SVG
})

# ── Load data ──
adata = sc.read_h5ad(f"{OUTDIR}/annotated.h5ad")
cell_type_col = "cell_type"

# ══════════════════════════════════════════════
# 1. UMAP Plots
# ══════════════════════════════════════════════

# Basic UMAP with cell types
fig, ax = plt.subplots(figsize=(6, 5))
sc.pl.umap(
    adata,
    color=cell_type_col,
    ax=ax,
    show=False,
    frameon=False,
    title="",
    legend_loc="on data",
    legend_fontsize=8,
    legend_fontoutline=2,
    size=10,
)
fig.savefig(f"{OUTDIR}/umap_celltypes.png", dpi=300, bbox_inches="tight")
fig.savefig(f"{OUTDIR}/umap_celltypes.pdf", bbox_inches="tight")
plt.close()
print(f"Saved: {OUTDIR}/umap_celltypes.png/.pdf")

# UMAP with gene expression
marker_genes = ["CD3D", "CD14", "MS4A1", "NKG7", "CD8A", "PPBP"]
available = [g for g in marker_genes if g in adata.var_names]

if available:
    fig, axes = plt.subplots(2, 3, figsize=(12, 8))
    for ax, gene in zip(axes.flat, available):
        sc.pl.umap(
            adata, color=gene, ax=ax, show=False,
            frameon=False, title=gene, cmap="viridis",
            size=5, vmin=0,
        )
    for j in range(len(available), 6):
        axes.flat[j].set_visible(False)
    plt.tight_layout()
    fig.savefig(f"{OUTDIR}/umap_markers.png", dpi=300, bbox_inches="tight")
    plt.close()
    print(f"Saved: {OUTDIR}/umap_markers.png")

# Split UMAP by condition
if "condition" in adata.obs.columns:
    conditions = adata.obs["condition"].unique()
    fig, axes = plt.subplots(1, len(conditions), figsize=(5 * len(conditions), 4))
    if len(conditions) == 1:
        axes = [axes]
    for ax, cond in zip(axes, conditions):
        sc.pl.umap(
            adata[adata.obs["condition"] == cond],
            color=cell_type_col, ax=ax, show=False,
            frameon=False, title=cond, size=15,
        )
    plt.tight_layout()
    fig.savefig(f"{OUTDIR}/umap_split_condition.png", dpi=300, bbox_inches="tight")
    plt.close()

# ══════════════════════════════════════════════
# 2. Dotplot
# ══════════════════════════════════════════════

# Marker gene dotplot
marker_dict = {
    "T cells": ["CD3D", "CD3E", "IL7R"],
    "CD8 T": ["CD8A", "CD8B", "GZMB"],
    "NK": ["NKG7", "GNLY", "KLRD1"],
    "B cells": ["MS4A1", "CD79A", "CD19"],
    "Monocytes": ["CD14", "LYZ", "S100A8"],
}
# Filter to available genes
marker_dict_filtered = {}
for ct, genes in marker_dict.items():
    avail = [g for g in genes if g in adata.var_names]
    if avail:
        marker_dict_filtered[ct] = avail

if marker_dict_filtered:
    sc.pl.dotplot(
        adata,
        var_names=marker_dict_filtered,
        groupby=cell_type_col,
        standard_scale="var",
        show=False,
        save="_markers.png",
    )
    print("Saved dotplot")

# ══════════════════════════════════════════════
# 3. Stacked Violin Plot
# ══════════════════════════════════════════════

flat_markers = [g for genes in marker_dict_filtered.values() for g in genes]
if flat_markers:
    sc.pl.stacked_violin(
        adata,
        var_names=flat_markers[:12],
        groupby=cell_type_col,
        rotation=90,
        show=False,
        save="_markers.png",
    )
    print("Saved stacked violin")

# ══════════════════════════════════════════════
# 4. Matrix Plot (Heatmap)
# ══════════════════════════════════════════════

if marker_dict_filtered:
    sc.pl.matrixplot(
        adata,
        var_names=marker_dict_filtered,
        groupby=cell_type_col,
        standard_scale="var",
        cmap="Blues",
        show=False,
        save="_markers.png",
    )
    print("Saved matrix plot")

# ══════════════════════════════════════════════
# 5. Rank Genes Groups Dotplot
# ══════════════════════════════════════════════

# Run DE if not already done
if "rank_genes_groups" not in adata.uns:
    sc.tl.rank_genes_groups(adata, groupby=cell_type_col, method="wilcoxon")

sc.pl.rank_genes_groups_dotplot(
    adata,
    n_genes=4,
    show=False,
    save="_de_markers.png",
)
print("Saved DE dotplot")

# Also as heatmap
sc.pl.rank_genes_groups_heatmap(
    adata,
    n_genes=5,
    show_gene_labels=True,
    show=False,
    save="_de_heatmap.png",
)
print("Saved DE heatmap")

# ══════════════════════════════════════════════
# 6. Spatial Plots (if spatial data)
# ══════════════════════════════════════════════

if "spatial" in adata.obsm:
    import squidpy as sq

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    sq.pl.spatial_scatter(
        adata, color=cell_type_col, size=1.3,
        ax=axes[0], title="Cell Types", show=False,
    )
    if available:
        sq.pl.spatial_scatter(
            adata, color=available[0], size=1.3,
            cmap="Spectral_r", ax=axes[1],
            title=available[0], show=False,
        )
    plt.tight_layout()
    fig.savefig(f"{OUTDIR}/spatial_plots.png", dpi=300, bbox_inches="tight")
    plt.close()
    print(f"Saved: {OUTDIR}/spatial_plots.png")

# ══════════════════════════════════════════════
# 7. Multi-Panel Composite Figure
# ══════════════════════════════════════════════

fig = plt.figure(figsize=(16, 12))
gs = GridSpec(2, 3, figure=fig, hspace=0.3, wspace=0.3)

# Panel A: UMAP with cell types
ax_a = fig.add_subplot(gs[0, 0])
sc.pl.umap(adata, color=cell_type_col, ax=ax_a, show=False,
           frameon=False, title="", size=5, legend_loc="right margin", legend_fontsize=6)
ax_a.text(-0.1, 1.05, "A", transform=ax_a.transAxes, fontsize=16, fontweight="bold", va="top")

# Panel B: UMAP with marker gene
if available:
    ax_b = fig.add_subplot(gs[0, 1])
    sc.pl.umap(adata, color=available[0], ax=ax_b, show=False,
               frameon=False, title=available[0], size=5, cmap="viridis")
    ax_b.text(-0.1, 1.05, "B", transform=ax_b.transAxes, fontsize=16, fontweight="bold", va="top")

# Panel C: Cell type proportions
ax_c = fig.add_subplot(gs[0, 2])
ct_counts = adata.obs[cell_type_col].value_counts()
ax_c.barh(range(len(ct_counts)), ct_counts.values, color="steelblue")
ax_c.set_yticks(range(len(ct_counts)))
ax_c.set_yticklabels(ct_counts.index, fontsize=8)
ax_c.set_xlabel("Number of Cells")
ax_c.invert_yaxis()
ax_c.text(-0.1, 1.05, "C", transform=ax_c.transAxes, fontsize=16, fontweight="bold", va="top")

# Panels D-F: Marker gene violins
if len(available) >= 3:
    for i, gene in enumerate(available[:3]):
        ax = fig.add_subplot(gs[1, i])
        sc.pl.violin(adata, gene, groupby=cell_type_col, ax=ax, show=False, rotation=90)
        ax.set_title(gene)
        label = chr(68 + i)  # D, E, F
        ax.text(-0.1, 1.05, label, transform=ax.transAxes, fontsize=16, fontweight="bold", va="top")

fig.savefig(f"{OUTDIR}/composite_figure.png", dpi=300, bbox_inches="tight")
fig.savefig(f"{OUTDIR}/composite_figure.pdf", bbox_inches="tight")
plt.close()
print(f"Saved: {OUTDIR}/composite_figure.png/.pdf")

print("\nAll publication plots generated successfully.")
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dpi` / `dpi_save` | 300 | Resolution for display/save. Use 300+ for publications |
| `frameon` | `False` | Remove axis frame for cleaner UMAPs |
| `size` | 120000/n_obs | Point size in UMAP. Smaller for large datasets |
| `legend_loc` | `"right margin"` | Legend position: `"right margin"`, `"on data"`, `"best"` |
| `standard_scale` | `"var"` | Scale dotplot/matrixplot: `"var"` (per gene), `"group"` (per cell type) |
| `cmap` | varies | Colormap: `"viridis"`, `"Spectral_r"`, `"Blues"`, `"YlOrRd"` |

## Common Issues

- **Text not editable in PDF/SVG**: Set `plt.rcParams["pdf.fonttype"] = 42` and `plt.rcParams["svg.fonttype"] = "none"` to embed fonts as paths.
- **UMAP points too large/small**: Adjust `size` parameter. For >50k cells use size=5-15, for <5k cells use size=50-100.
- **Legend overlaps plot**: Use `legend_loc="right margin"` or `legend_loc="none"` and create legend separately. For on-data labels, use `legend_fontoutline=2`.
- **Colors look different in PDF vs PNG**: Use `facecolor="white"` in `set_figure_params`. Some PDF viewers have dark backgrounds.
- **Dotplot gene names truncated**: Increase figure width or reduce font size with `sc.pl.dotplot(..., gene_symbols_fontsize=8)`.
- **Arial font not found**: Install via `apt-get install fonts-liberation` or use `"DejaVu Sans"` as fallback.
