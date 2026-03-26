# Loading 10x Genomics and Standard Single-Cell Data

## When to Use

Use this skill when you need to load single-cell RNA-seq data from:
- 10x Genomics Cell Ranger output (`.h5` or `mtx` directory)
- Pre-processed h5ad files
- Loom files from velocyto or other tools

## Prerequisites

All packages are pre-installed in the OmiClaw environment:
- `scanpy` (includes `anndata`)
- `h5py`
- `scipy`

## Script 1: Load 10x Genomics HDF5 File

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Load 10x Genomics .h5 file (Cell Ranger output)."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os

# --- Configuration ---
H5_FILE = "/path/to/filtered_feature_bc_matrix.h5"  # Cell Ranger output
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load ---
print("Loading 10x h5 file...")
adata = sc.read_10x_h5(H5_FILE)
print(f"  Raw shape: {adata.n_obs} cells x {adata.n_vars} genes")

# Make variable names unique (required — 10x can have duplicate gene names)
adata.var_names_make_unique()
print(f"  Unique gene names ensured")

# Inspect structure
print(f"\n  Observation (cell) metadata columns: {list(adata.obs.columns)}")
print(f"  Variable (gene) metadata columns: {list(adata.var.columns)}")
print(f"  Matrix type: {type(adata.X)}")
print(f"  Matrix dtype: {adata.X.dtype}")

# Save as h5ad for faster future loading
out_path = os.path.join(OUTPUT_DIR, "raw_data.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 2: Load 10x Genomics MTX Directory

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Load 10x Genomics mtx directory (matrix.mtx, barcodes.tsv, genes/features.tsv)."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os

# --- Configuration ---
# The directory should contain: matrix.mtx.gz, barcodes.tsv.gz, features.tsv.gz (or genes.tsv.gz)
MTX_DIR = "/path/to/filtered_feature_bc_matrix/"
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load ---
print(f"Loading 10x mtx directory: {MTX_DIR}")
adata = sc.read_10x_mtx(
    MTX_DIR,
    var_names="gene_symbols",  # Use "gene_ids" for Ensembl IDs
    cache=True,                # Cache the converted file for faster re-loading
)
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")

adata.var_names_make_unique()

# Preview first few cells and genes
print(f"\n  First 5 cell barcodes: {list(adata.obs_names[:5])}")
print(f"  First 5 gene names: {list(adata.var_names[:5])}")

# Save
out_path = os.path.join(OUTPUT_DIR, "raw_from_mtx.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 3: Load h5ad File

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Load a pre-existing h5ad file."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os

# --- Configuration ---
H5AD_FILE = "/path/to/data.h5ad"
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load ---
print(f"Loading h5ad file: {H5AD_FILE}")
adata = sc.read_h5ad(H5AD_FILE)
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")

# Full summary
print(f"\n  obs columns: {list(adata.obs.columns)}")
print(f"  var columns: {list(adata.var.columns)}")
print(f"  obsm keys: {list(adata.obsm.keys())}")
print(f"  layers: {list(adata.layers.keys())}")
print(f"  uns keys: {list(adata.uns.keys())}")

# Backed mode: load large files without reading entire matrix into RAM
print("\n--- Backed mode (memory-efficient for large datasets) ---")
adata_backed = sc.read_h5ad(H5AD_FILE, backed="r")
print(f"  Backed shape: {adata_backed.n_obs} cells x {adata_backed.n_vars} genes")
print(f"  Matrix is on disk, not in memory")
# Note: backed mode is read-only; write to new file after subsetting
# subset = adata_backed[:100, :].to_memory()

print("Done.")
```

## Script 4: Load Loom File

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Load a loom file (e.g., from velocyto)."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os

# --- Configuration ---
LOOM_FILE = "/path/to/data.loom"
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load ---
print(f"Loading loom file: {LOOM_FILE}")
adata = sc.read_loom(
    LOOM_FILE,
    sparse=True,          # Store as sparse matrix
    cleanup=True,         # Remove empty metadata
    X_name="matrix",      # Name of the main data layer (default: "matrix")
    obs_names="CellID",   # Column to use as cell names (check your loom file)
    var_names="Gene",     # Column to use as gene names (check your loom file)
)
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")

# Loom files from velocyto often contain spliced/unspliced layers
if "spliced" in adata.layers:
    print(f"  Found spliced layer: {adata.layers['spliced'].shape}")
if "unspliced" in adata.layers:
    print(f"  Found unspliced layer: {adata.layers['unspliced'].shape}")

# Save as h5ad
out_path = os.path.join(OUTPUT_DIR, "from_loom.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 5: Load Multiple Samples and Merge

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Load and merge multiple 10x samples into a single AnnData object."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import anndata as ad
import os

# --- Configuration ---
SAMPLES = {
    "sample_A": "/path/to/sampleA/filtered_feature_bc_matrix.h5",
    "sample_B": "/path/to/sampleB/filtered_feature_bc_matrix.h5",
    "sample_C": "/path/to/sampleC/filtered_feature_bc_matrix.h5",
}
OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load each sample ---
adatas = {}
for sample_name, h5_path in SAMPLES.items():
    print(f"Loading {sample_name} from {h5_path}...")
    adata = sc.read_10x_h5(h5_path)
    adata.var_names_make_unique()
    adata.obs["sample"] = sample_name          # Tag cells with sample ID
    adata.obs_names = [f"{sample_name}_{bc}" for bc in adata.obs_names]  # Unique barcodes
    adatas[sample_name] = adata
    print(f"  {sample_name}: {adata.n_obs} cells x {adata.n_vars} genes")

# --- Merge ---
print("\nMerging all samples...")
adata_merged = ad.concat(adatas, label="sample", keys=SAMPLES.keys(), join="outer")
print(f"  Merged shape: {adata_merged.n_obs} cells x {adata_merged.n_vars} genes")
print(f"  Samples: {adata_merged.obs['sample'].value_counts().to_dict()}")

# Save
out_path = os.path.join(OUTPUT_DIR, "merged_raw.h5ad")
adata_merged.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Key Parameters

| Function | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `sc.read_10x_h5` | `genome` | `None` | Genome group to read (for multi-genome experiments) |
| `sc.read_10x_h5` | `gex_only` | `True` | Only read gene expression (skip antibody capture, etc.) |
| `sc.read_10x_mtx` | `var_names` | `"gene_symbols"` | Use `"gene_symbols"` or `"gene_ids"` for var_names |
| `sc.read_10x_mtx` | `cache` | `False` | Cache converted h5ad for faster reload |
| `sc.read_h5ad` | `backed` | `None` | `"r"` for read-only backed mode (low memory) |
| `sc.read_loom` | `X_name` | `"matrix"` | Layer name to use as main X matrix |
| `ad.concat` | `join` | `"inner"` | `"inner"` keeps shared genes, `"outer"` keeps all |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `ValueError: var_names not unique` | Duplicate gene symbols in 10x data | Call `adata.var_names_make_unique()` after loading |
| `KeyError: 'Gene'` in read_loom | Wrong column name for genes | Inspect loom file with `loompy.connect()` to find correct column name |
| Out of memory loading large h5ad | Dataset too large for RAM | Use `sc.read_h5ad(path, backed="r")` for backed mode |
| MTX directory not found | Wrong path or missing files | Ensure directory contains `matrix.mtx.gz`, `barcodes.tsv.gz`, `features.tsv.gz` |
| Merged data has NaN | Genes not shared across samples | Use `join="outer"` in `ad.concat` (fills missing with 0) or `join="inner"` (keeps shared only) |
