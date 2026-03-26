---
name: omics-compute
description: "Single-cell RNA-seq computation environment reference and skill index. READ THIS FIRST when performing any scRNA-seq analysis — contains the master index of all skills across 12 groups."
---

# Single-Cell RNA-seq Computation Environment

This environment includes a full single-cell analysis stack. Use these tools for scRNA-seq analysis tasks.

## Python Environment

```
${CONDA_ENV_PATH}/bin/python
```

All packages pre-installed. Always set matplotlib backend:

```python
import matplotlib
matplotlib.use("Agg")
```

## GPU

NVIDIA A100-SXM4-80GB with CUDA 12.8. Auto-detect:

```python
import torch
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
```

Use GPU for: scVI, scANVI, totalVI, SOLO, CellRank (PyTorch-based models).

## Available Packages

### Core Framework
| Package | Purpose |
|---------|---------|
| scanpy | Core analysis (QC, normalization, clustering, DE, visualization) |
| anndata | Data structure (cells x genes matrix + metadata) |
| mudata / muon | Multi-modal data format and analysis |

### Deep Learning
| Package | Purpose |
|---------|---------|
| scvi-tools | VAE models (scVI, scANVI, totalVI, SOLO, PeakVI) |
| torch (CUDA) | PyTorch GPU acceleration |
| cellrank | Markov-chain trajectory analysis |
| scvelo | RNA velocity |

### Integration & Batch Correction
| Package | Purpose |
|---------|---------|
| harmonypy | Harmony batch correction |
| scanorama | Mutual nearest neighbors integration |
| bbknn | Batch-balanced KNN |

### Functional Analysis
| Package | Purpose |
|---------|---------|
| decoupler | TF/pathway activity (ORA, GSEA, ULM, MLM) |
| liana | Cell-cell communication (CellPhoneDB, CellChat, NATMI) |
| pyscenic | Gene regulatory network inference |

### Specialized
| Package | Purpose |
|---------|---------|
| scrublet | Doublet detection |
| celltypist | Automated cell type annotation |
| scirpy | TCR/BCR immune repertoire analysis |
| pertpy | Perturbation experiment analysis |
| squidpy | Spatial transcriptomics |
| infercnvpy | CNV inference from scRNA-seq |
| pydeseq2 | Pseudobulk differential expression |

### Visualization
| Package | Purpose |
|---------|---------|
| matplotlib / seaborn | Static plots |
| plotly | Interactive plots |

## File Storage

All outputs go to `/workspace/group/` (data disk):

```
/workspace/group/
├── data/          ← h5ad files, raw and processed
├── results/       ← DE results, enrichment, metrics
├── plots/         ← saved figures (.png)
├── models/        ← trained scVI/CellRank models
└── reports/       ← summary reports
```

**NEVER write to `/tmp/`.**

## Skill Reference Index

### Data Handling

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `data-loading` | tenx-loading, format-conversion, public-datasets | Load 10x output, convert formats, download PBMC/Tabula Muris |

### Preprocessing

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `preprocessing` | quality-control, doublet-detection, ambient-rna, normalization, feature-selection, dimensionality-reduction | QC filtering, doublets, ambient RNA, normalize, HVG, PCA/UMAP |

### Core Analysis

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `clustering-annotation` | leiden-clustering, manual-annotation, auto-annotation | Cluster cells, identify cell types manually or with CellTypist |
| `integration` | harmony, scvi-integration, scanorama, scib-evaluation | Batch correction, multi-sample integration, evaluation metrics |

### Differential & Functional Analysis

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `differential-expression` | pseudobulk-de, compositional-analysis, gene-set-enrichment | DE between conditions, abundance changes, pathway enrichment |

### Trajectory & Dynamics

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `trajectory` | diffusion-pseudotime, rna-velocity, cellrank | Pseudotime ordering, RNA velocity, fate probabilities |

### Regulatory Mechanisms

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `regulatory-networks` | pyscenic-grn, cell-communication | GRN inference with SCENIC, ligand-receptor with LIANA+ |

### Spatial Transcriptomics

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `spatial` | spatial-preprocessing, spatial-neighbors, spatial-domains, spatially-variable-genes, deconvolution | Visium/MERFISH analysis, SVG detection, cell type mapping |

### Multi-omics

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `multiomics` | scatac-seq, cite-seq, multiome | scATAC-seq, CITE-seq protein, RNA+ATAC joint analysis |

### Immune Repertoire

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `immune-repertoire` | tcr-analysis, bcr-analysis | TCR/BCR clonotype analysis with scirpy |

### Visualization

| Skill Group | Sub-skills | Use For |
|---|---|---|
| `visualization` | publication-plots, interactive-browsers | UMAP, dotplot, heatmap, violin; cellxgene browser |

## How to Use a Skill

1. **Identify** the relevant skill from the index above
2. **Read** the SKILL.md: `cat ~/.claude/skills/<group>/<sub-skill>/SKILL.md`
3. **Follow** the step-by-step code — all code is complete and runnable
4. **Check** the "Common Issues" table at the bottom if anything goes wrong

## Standard scRNA-seq Workflow

```
1. Load data          → data-loading/tenx-loading/
2. QC & filter        → preprocessing/quality-control/
3. Doublet removal    → preprocessing/doublet-detection/
4. Normalize          → preprocessing/normalization/
5. Select HVGs        → preprocessing/feature-selection/
6. PCA + UMAP         → preprocessing/dimensionality-reduction/
7. Cluster            → clustering-annotation/leiden-clustering/
8. Annotate           → clustering-annotation/auto-annotation/
9. (If multi-batch)   → integration/harmony/ or integration/scvi-integration/
10. DE analysis       → differential-expression/pseudobulk-de/
11. Enrichment        → differential-expression/gene-set-enrichment/
12. Trajectory        → trajectory/diffusion-pseudotime/
13. Visualization     → visualization/publication-plots/
```
