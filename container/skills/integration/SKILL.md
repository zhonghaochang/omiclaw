---
name: integration
description: "Batch integration and data harmonization methods for multi-sample scRNA-seq. Contains 4 sub-skills: harmony, scvi-integration, scanorama, scib-evaluation."
children:
  - harmony
  - scvi-integration
  - scanorama
  - scib-evaluation
---

# Batch Integration

## When to Use

Use these skills when combining scRNA-seq datasets from multiple batches, donors, experiments, or technologies. Batch effects confound biological variation and must be corrected before downstream analysis (clustering, DE, trajectory).

## Decision Guide

| Method | Speed | GPU | Best For | Limitations |
|--------|-------|-----|----------|-------------|
| **Harmony** | Fast (seconds) | No | Quick integration, moderate batch effects | Linear correction only |
| **scVI** | Medium (minutes) | Yes | Complex batch effects, large datasets, probabilistic framework | Requires GPU for speed |
| **Scanorama** | Fast (seconds) | No | Moderate datasets, preserves local structure | Less effective for severe batch effects |

## Evaluation

Always evaluate integration quality with **scib-evaluation** after running any integration method. Key metrics: batch mixing (ASW_batch, graph_connectivity) vs. bio-conservation (ARI, NMI, ASW_celltype).

## Workflow

1. Start with `harmony` (fastest, good baseline)
2. If harmony is insufficient, try `scvi-integration` (most powerful)
3. Use `scanorama` as an alternative lightweight method
4. Always run `scib-evaluation` to compare methods quantitatively

## Prerequisites

All methods require preprocessed AnnData with:
- Normalized, log-transformed counts
- Highly variable genes selected
- PCA computed (for harmony, scanorama)
- A batch column in `adata.obs` (e.g., `"batch"`, `"sample"`, `"donor"`)
