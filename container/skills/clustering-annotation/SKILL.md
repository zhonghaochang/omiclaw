---
name: clustering-annotation
description: Cluster single-cell data and annotate cell types using marker genes, reference databases, or automated tools.
---

# Clustering and Cell Type Annotation

## When to Use

Use these skills after preprocessing (QC, normalization, HVG selection, PCA, neighbor graph) to identify cell populations and assign biological labels.

## Pipeline

```
Preprocessed data (with PCA + neighbor graph)
  |
  v
1. Leiden Clustering    -- Identify cell groups
  |
  v
2. Marker Gene Analysis -- Find cluster-specific genes
  |
  v
3. Cell Type Annotation -- Assign biological labels
   ├── Manual: using known markers + literature
   └── Automated: CellTypist, reference mapping
```

## Sub-Skills

| Sub-Skill | Description | Key Functions |
|-----------|-------------|---------------|
| [leiden-clustering](leiden-clustering/SKILL.md) | Leiden/Louvain clustering with resolution tuning | `sc.tl.leiden`, resolution comparison |
| [manual-annotation](manual-annotation/SKILL.md) | Find marker genes, visualize, manually label clusters | `sc.tl.rank_genes_groups`, dotplot, stacked_violin |
| [auto-annotation](auto-annotation/SKILL.md) | Automated annotation with CellTypist, reference mapping | `celltypist.annotate`, majority voting |

## Python Environment

```bash
${CONDA_ENV_PATH}/bin/python
```

## Quick Example

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
import matplotlib; matplotlib.use("Agg")
import scanpy as sc

adata = sc.read_h5ad("/workspace/group/preprocessed.h5ad")

# Cluster
sc.tl.leiden(adata, resolution=0.5)

# Find markers
sc.tl.rank_genes_groups(adata, groupby="leiden", method="wilcoxon")
sc.pl.rank_genes_groups_dotplot(adata, n_genes=5, save="_markers.png", show=False)

# Visualize
sc.pl.umap(adata, color="leiden", save="_clusters.png", show=False)
```

## Output Directory

All outputs should be saved to `/workspace/group/`.
