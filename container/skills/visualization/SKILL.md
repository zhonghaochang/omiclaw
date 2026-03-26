---
name: visualization
description: Publication-quality visualization and interactive data browsers for single-cell RNA-seq data. Includes scanpy plotting functions and cellxgene/cirrocumulus interactive explorers.
---

# Visualization

## When to Use

Use these skills when you need to:
- Create publication-quality figures from single-cell data
- Generate multi-panel figure layouts for papers
- Set up interactive data browsers for exploration
- Export high-resolution plots (300+ DPI)

## Sub-Skills

| Sub-Skill | Description | Key Functions |
|-----------|-------------|---------------|
| [publication-plots](publication-plots/SKILL.md) | scanpy plotting: UMAP, dotplot, stacked violin, matrix plot, spatial plots. Multi-panel layouts with publication settings | `sc.pl.umap()`, `sc.pl.dotplot()`, `sc.pl.stacked_violin()` |
| [interactive-browsers](interactive-browsers/SKILL.md) | cellxgene and cirrocumulus interactive exploration. Launch commands, data preparation | `cellxgene launch`, `cirrocumulus` |

## Python Environment

```bash
${CONDA_ENV_PATH}/bin/python
```

## Quick Start

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc

sc.set_figure_params(dpi=300, frameon=False, fontsize=12, facecolor="white")

adata = sc.read_h5ad("/workspace/group/annotated.h5ad")
sc.pl.umap(adata, color="cell_type", show=False, save="_celltypes.png")
```

## Output Directory

All outputs (figures, processed data) should be saved to:

```
/workspace/group/
```
