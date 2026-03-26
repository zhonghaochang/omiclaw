---
name: trajectory
description: "Trajectory inference, pseudotime, and fate analysis for scRNA-seq. Contains 3 sub-skills: diffusion-pseudotime, rna-velocity, cellrank."
children:
  - diffusion-pseudotime
  - rna-velocity
  - cellrank
---

# Trajectory Analysis

## When to Use

Use these skills to study dynamic biological processes: differentiation, development, cell state transitions, lineage commitment.

## Decision Guide

| Method | Input | Best For | Limitations |
|--------|-------|----------|-------------|
| **Diffusion Pseudotime (DPT)** | Standard scRNA-seq | Pseudotime ordering, simple trajectories, PAGA graph | Requires root cell selection, no directionality from data |
| **RNA Velocity (scVelo)** | Spliced + unspliced counts | Directionality of transitions, velocity vectors | Needs spliced/unspliced quantification (e.g., from STARsolo, alevin, velocyto) |
| **CellRank** | Velocity + pseudotime + other kernels | Fate probabilities, terminal state identification, driver genes | Most complex, combines multiple signals |

## Workflow

1. Start with **DPT** for basic pseudotime ordering and PAGA connectivity graph
2. If spliced/unspliced counts are available, add **RNA velocity** for directionality
3. Use **CellRank** to combine velocity, pseudotime, and other signals for fate analysis

## Prerequisites

All methods require:
- Preprocessed, clustered, annotated AnnData
- PCA and neighbor graph computed
- UMAP for visualization

Additional for RNA velocity:
- Spliced/unspliced count matrices (in `adata.layers["spliced"]` and `adata.layers["unspliced"]`)
- Typically from `STARsolo --soloFeatures Gene Velocyto` or `velocyto run`
