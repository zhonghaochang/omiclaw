---
name: interactive-browsers
description: Interactive single-cell data browsers using cellxgene and cirrocumulus. Launch commands, data preparation, and serving configurations for collaborative data exploration.
---

# Interactive Data Browsers

## When to Use

Use this skill when you need to:
- Launch an interactive web browser for exploring single-cell data
- Allow collaborators to explore data without coding
- Interactively select cells, view gene expression, compare clusters
- Serve data to multiple users for collaborative exploration

## Prerequisites

- An AnnData object (h5ad) with embeddings (UMAP), cell annotations, and normalized expression
- For cellxgene: `cellxgene` package installed
- For cirrocumulus: `cirrocumulus` package installed

## cellxgene

### Prepare Data for cellxgene

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""
Prepare AnnData for optimal cellxgene performance.
cellxgene requires specific data formatting for best experience.
"""
import matplotlib; matplotlib.use("Agg")
import os
import numpy as np
import scanpy as sc
import warnings
warnings.filterwarnings("ignore")

OUTDIR = "/workspace/group"

# ── Load data ──
adata = sc.read_h5ad(f"{OUTDIR}/annotated.h5ad")
print(f"Original: {adata.n_obs} cells x {adata.n_vars} genes")

# ══════════════════════════════════════════════
# Optimize for cellxgene
# ══════════════════════════════════════════════

# 1. Ensure UMAP exists
if "X_umap" not in adata.obsm:
    sc.pp.pca(adata, n_comps=50)
    sc.pp.neighbors(adata, n_pcs=30)
    sc.tl.umap(adata)

# 2. Ensure normalized data in X (cellxgene displays X)
# Store raw in .raw for DE analysis in cellxgene
if adata.raw is None and "counts" in adata.layers:
    adata.raw = adata.copy()
    # X should be log-normalized
    if adata.X.max() > 50:  # likely raw counts
        sc.pp.normalize_total(adata, target_sum=1e4)
        sc.pp.log1p(adata)

# 3. Ensure categorical columns are proper categoricals
for col in adata.obs.columns:
    if adata.obs[col].dtype == object:
        adata.obs[col] = adata.obs[col].astype("category")

# 4. Clean up unnecessary data to reduce file size
# Remove large intermediate matrices
keys_to_remove = [k for k in adata.obsm.keys() if k not in ["X_umap", "X_pca", "X_tsne", "spatial"]]
for k in keys_to_remove:
    if k.startswith("_"):  # internal keys
        del adata.obsm[k]

# 5. Add descriptive embeddings names
# cellxgene uses obsm key names for dropdown menu

# 6. Compute DE for cellxgene's built-in DE analysis
if "rank_genes_groups" not in adata.uns:
    sc.tl.rank_genes_groups(adata, groupby="cell_type", method="wilcoxon")

# ── Save optimized file ──
output_path = f"{OUTDIR}/cellxgene_ready.h5ad"
adata.write_h5ad(output_path)
print(f"Saved: {output_path}")
print(f"File size: {os.path.getsize(output_path) / 1e6:.1f} MB")
print(f"\nTo launch cellxgene:")
print(f"  cellxgene launch {output_path} --host 0.0.0.0 --port 5005")
```

### Launch cellxgene

```bash
# Basic launch (local access only)
${CONDA_ENV_PATH}/bin/cellxgene launch \
    /workspace/group/cellxgene_ready.h5ad \
    --port 5005

# Network accessible (for collaborators)
${CONDA_ENV_PATH}/bin/cellxgene launch \
    /workspace/group/cellxgene_ready.h5ad \
    --host 0.0.0.0 \
    --port 5005 \
    --open

# With custom title and annotations enabled
${CONDA_ENV_PATH}/bin/cellxgene launch \
    /workspace/group/cellxgene_ready.h5ad \
    --host 0.0.0.0 \
    --port 5005 \
    --title "My scRNA-seq Dataset" \
    --disable-annotations false

# Read-only mode (no user annotations)
${CONDA_ENV_PATH}/bin/cellxgene launch \
    /workspace/group/cellxgene_ready.h5ad \
    --host 0.0.0.0 \
    --port 5005 \
    --disable-annotations
```

### cellxgene Features

| Feature | Description |
|---------|-------------|
| **Embedding view** | UMAP, tSNE, PCA — any embedding in `adata.obsm` |
| **Color by gene** | Type gene name to color cells by expression |
| **Color by metadata** | Click any `adata.obs` column to color cells |
| **Differential expression** | Select two groups and compute DE genes |
| **Lasso selection** | Draw freeform selection on embedding |
| **Clip/subset** | Focus on selected cells only |

## cirrocumulus

### Prepare and Launch cirrocumulus

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""
Prepare data for cirrocumulus.
cirrocumulus supports larger datasets and has additional features.
"""
import matplotlib; matplotlib.use("Agg")
import os
import scanpy as sc
import warnings
warnings.filterwarnings("ignore")

OUTDIR = "/workspace/group"

# ── Load data ──
adata = sc.read_h5ad(f"{OUTDIR}/annotated.h5ad")

# cirrocumulus can read h5ad directly, but for large datasets
# convert to its optimized format (.jsonl or backed mode)

# Ensure categorical columns
for col in adata.obs.columns:
    if adata.obs[col].dtype == object:
        adata.obs[col] = adata.obs[col].astype("category")

# Save in cirrocumulus-compatible format
output_path = f"{OUTDIR}/cirro_ready.h5ad"
adata.write_h5ad(output_path)
print(f"Saved: {output_path}")
print(f"\nTo launch cirrocumulus:")
print(f"  cirro launch {output_path} --host 0.0.0.0 --port 5006")
```

### Launch cirrocumulus

```bash
# Basic launch
${CONDA_ENV_PATH}/bin/cirro launch \
    /workspace/group/cirro_ready.h5ad \
    --port 5006

# Network accessible
${CONDA_ENV_PATH}/bin/cirro launch \
    /workspace/group/cirro_ready.h5ad \
    --host 0.0.0.0 \
    --port 5006

# Serve multiple datasets from a directory
${CONDA_ENV_PATH}/bin/cirro launch \
    /workspace/group/ \
    --host 0.0.0.0 \
    --port 5006
```

### cirrocumulus Features

| Feature | Description |
|---------|-------------|
| **3D embeddings** | Visualize UMAP/tSNE in 3D |
| **Multiple datasets** | Serve a directory of h5ad files |
| **Spatial data** | Native support for spatial transcriptomics |
| **Dot plots** | Built-in dot plot and violin plot panels |
| **Gene sets** | Load and visualize gene set scores |
| **Gallery view** | Side-by-side comparison of multiple genes |

## Comparison: cellxgene vs cirrocumulus

| Feature | cellxgene | cirrocumulus |
|---------|-----------|--------------|
| Max cells | ~1M (with backed mode) | ~2M |
| Built-in DE | Yes | No |
| 3D embedding | No | Yes |
| Spatial data | Limited | Good |
| Multi-dataset | No (one file per instance) | Yes (directory mode) |
| Cell annotations | Yes (user can annotate) | No |
| Dot plots | No (embedding only) | Yes |
| Setup complexity | Simple | Simple |

## Key Parameters

| Parameter | Tool | Description |
|-----------|------|-------------|
| `--host` | Both | Bind address. `0.0.0.0` for network access, `127.0.0.1` for local only |
| `--port` | Both | Port number. Default: 5005 (cellxgene), 5006 (cirrocumulus) |
| `--title` | cellxgene | Browser tab title |
| `--disable-annotations` | cellxgene | Prevent users from saving annotations |

## Common Issues

- **cellxgene "file too large" error**: For datasets >500k cells, use `cellxgene launch --backed` to memory-map the file instead of loading entirely into RAM.
- **Port already in use**: Change port with `--port 5007` or kill existing process with `lsof -ti:5005 | xargs kill`.
- **Cannot access from remote machine**: Use `--host 0.0.0.0` (not `127.0.0.1`). Check firewall rules. Consider SSH tunneling: `ssh -L 5005:localhost:5005 user@host`.
- **Slow gene search**: cellxgene indexes genes on startup. First launch may be slow for large datasets but subsequent gene lookups are fast.
- **Missing embeddings**: Both tools require at least one embedding in `adata.obsm` (e.g., `X_umap`). Compute embeddings before launching.
- **h5ad version incompatibility**: If cellxgene fails to read the file, re-save with `adata.write_h5ad(filename)` using the same anndata version as cellxgene.
