---
name: differential-expression
description: "Differential expression and pathway analysis for scRNA-seq. Contains 3 sub-skills: pseudobulk-de, compositional-analysis, gene-set-enrichment."
children:
  - pseudobulk-de
  - compositional-analysis
  - gene-set-enrichment
---

# Differential Expression & Pathway Analysis

## When to Use

Use these skills to identify genes, pathways, and cell composition changes between conditions (e.g., treatment vs control, disease vs healthy, timepoint A vs B).

## Decision Guide

| Method | Purpose | When to Use |
|--------|---------|-------------|
| **Pseudobulk DE (PyDESeq2)** | Gene-level DE between conditions | RECOMMENDED for condition comparisons. Properly handles replicates, avoids pseudoreplication. |
| **Compositional Analysis (Milo/scCODA)** | Differential abundance of cell types/states | When asking "which cell types change in proportion between conditions?" |
| **Gene Set Enrichment** | Pathway/gene set activity | After DE analysis or for pathway-level summaries. GO, KEGG, Reactome, MSigDB. |

## Important: Why Pseudobulk?

Per-cell DE methods (Wilcoxon, t-test) treat each cell as an independent observation. This inflates statistics because cells from the same sample are correlated (pseudoreplication). **Pseudobulk DE aggregates cells per sample, then uses bulk RNA-seq methods (DESeq2), which properly accounts for biological replicates.**

Always prefer pseudobulk DE for comparing conditions across biological replicates.

## Workflow

1. **Pseudobulk DE**: Identify differentially expressed genes per cell type between conditions
2. **Gene Set Enrichment**: Run pathway analysis on DE results (ORA on significant genes, or GSEA on ranked gene lists)
3. **Compositional Analysis**: Test if cell type proportions differ between conditions

## Prerequisites

- Annotated AnnData with cell type labels
- Condition/group column in `adata.obs` (e.g., `"condition"`, `"treatment"`)
- Sample/donor column for pseudobulk aggregation (e.g., `"sample"`, `"donor"`)
- Raw counts available (for pseudobulk DE)
