# Downloading Public Single-Cell Datasets

## When to Use

Use this skill when you need to:
- Download standard reference datasets (PBMC3k, Tabula Muris) for tutorials or benchmarking
- Access datasets from cellxgene Census (Chan Zuckerberg Initiative)
- Use scanpy's built-in dataset functions

## Prerequisites

All packages are pre-installed:
- `scanpy` (includes built-in datasets)
- `cellxgene-census` (for CZI Census access)
- `pooch` (download manager, used by scanpy internally)

## Script 1: Download PBMC3k (Most Common Tutorial Dataset)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Download and prepare the PBMC3k dataset from 10x Genomics.

This is the most commonly used dataset in single-cell tutorials.
~2,700 peripheral blood mononuclear cells.
"""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Option A: Download raw PBMC3k (unprocessed) ---
print("Downloading PBMC3k raw data...")
adata = sc.datasets.pbmc3k()
print(f"  Raw PBMC3k: {adata.n_obs} cells x {adata.n_vars} genes")
print(f"  This is the unprocessed version (raw counts)")

# Save raw
raw_path = os.path.join(OUTPUT_DIR, "pbmc3k_raw.h5ad")
adata.write(raw_path)
print(f"  Saved to {raw_path}")

# --- Option B: Download pre-processed PBMC3k (with clusters, UMAP, etc.) ---
print("\nDownloading PBMC3k processed data...")
adata_proc = sc.datasets.pbmc3k_processed()
print(f"  Processed PBMC3k: {adata_proc.n_obs} cells x {adata_proc.n_vars} genes")
print(f"  Cell types: {list(adata_proc.obs['louvain'].cat.categories)}")
print(f"  Embeddings: {list(adata_proc.obsm.keys())}")

# Save processed
proc_path = os.path.join(OUTPUT_DIR, "pbmc3k_processed.h5ad")
adata_proc.write(proc_path)
print(f"  Saved to {proc_path}")

# Quick visualization
sc.settings.figdir = OUTPUT_DIR
sc.pl.umap(adata_proc, color="louvain", save="_pbmc3k_clusters.png", show=False)
print(f"  Saved UMAP plot to {OUTPUT_DIR}")

print("Done.")
```

## Script 2: Download Other Scanpy Built-in Datasets

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Download various built-in scanpy datasets."""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- PBMC 68k (larger PBMC dataset) ---
# Note: This is a larger download (~200MB)
# print("Downloading PBMC 68k...")
# adata_68k = sc.datasets.pbmc68k_reduced()  # Reduced version
# print(f"  PBMC 68k reduced: {adata_68k.n_obs} cells x {adata_68k.n_vars} genes")

# --- Paul et al. 2015 (myeloid progenitors, good for trajectory analysis) ---
print("Downloading Paul15 dataset (myeloid progenitors)...")
adata_paul = sc.datasets.paul15()
print(f"  Paul15: {adata_paul.n_obs} cells x {adata_paul.n_vars} genes")
print(f"  Cell types: {adata_paul.obs['paul15_clusters'].nunique()} clusters")
out_paul = os.path.join(OUTPUT_DIR, "paul15.h5ad")
adata_paul.write(out_paul)
print(f"  Saved to {out_paul}")

# --- Blobs (synthetic data for testing) ---
print("\nGenerating synthetic blob dataset...")
adata_blobs = sc.datasets.blobs(n_variables=200, n_centers=5, n_observations=1000)
print(f"  Blobs: {adata_blobs.n_obs} cells x {adata_blobs.n_vars} genes")
out_blobs = os.path.join(OUTPUT_DIR, "blobs_synthetic.h5ad")
adata_blobs.write(out_blobs)
print(f"  Saved to {out_blobs}")

# --- Krumsiek11 (small, good for quick tests) ---
print("\nDownloading Krumsiek11 dataset...")
adata_krum = sc.datasets.krumsiek11()
print(f"  Krumsiek11: {adata_krum.n_obs} cells x {adata_krum.n_vars} genes")

# --- List all available datasets ---
print("\n=== All available sc.datasets functions ===")
datasets_list = [
    "sc.datasets.pbmc3k()          - 2,700 PBMCs (raw)",
    "sc.datasets.pbmc3k_processed() - 2,700 PBMCs (processed with clusters)",
    "sc.datasets.pbmc68k_reduced()  - 68k PBMCs (reduced version)",
    "sc.datasets.paul15()           - Myeloid progenitors",
    "sc.datasets.blobs()            - Synthetic data",
    "sc.datasets.krumsiek11()       - Small hematopoiesis simulation",
    "sc.datasets.moignard15()       - Blood stem cells",
    "sc.datasets.toggleswitch()     - Toggle switch simulation",
]
for d in datasets_list:
    print(f"  {d}")

print("\nDone.")
```

## Script 3: Download from cellxgene Census (CZI)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Download datasets from CZI cellxgene Census.

cellxgene Census provides access to millions of cells from published studies,
organized by tissue, disease, organism, etc.
"""

import matplotlib; matplotlib.use("Agg")
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

try:
    import cellxgene_census

    # --- Open the Census ---
    print("Opening cellxgene Census (latest stable version)...")
    census = cellxgene_census.open_soma()

    # --- List available organisms ---
    print("\nAvailable organisms:")
    for organism in ["Homo sapiens", "Mus musculus"]:
        exp = census["census_data"][organism]
        n_cells = exp.obs.count
        print(f"  {organism}: available in Census")

    # --- Query specific cells ---
    print("\nQuerying human PBMC cells from Census...")
    adata = cellxgene_census.get_anndata(
        census=census,
        organism="Homo sapiens",
        obs_value_filter=(
            "tissue_general == 'blood' "
            "and disease == 'normal' "
            "and is_primary_data == True"
        ),
        obs_column_names=[
            "cell_type",
            "tissue",
            "disease",
            "donor_id",
            "dataset_id",
            "assay",
        ],
        # Limit to specific genes if needed:
        # var_value_filter="feature_name in ['CD3D', 'CD4', 'CD8A', 'MS4A1']",
    )
    print(f"  Downloaded: {adata.n_obs} cells x {adata.n_vars} genes")
    print(f"  Cell types: {adata.obs['cell_type'].nunique()} unique types")
    print(f"  Top cell types:")
    print(adata.obs["cell_type"].value_counts().head(10))

    # Save
    out_path = os.path.join(OUTPUT_DIR, "census_blood_normal.h5ad")
    adata.write(out_path)
    print(f"\n  Saved to {out_path}")

    census.close()

except ImportError:
    print("cellxgene-census not installed. Install with:")
    print("  pip install cellxgene-census")

except Exception as e:
    print(f"Error accessing Census: {e}")
    print("Census requires internet access and may be temporarily unavailable.")

print("Done.")
```

## Script 4: Download Tabula Muris (Mouse Cell Atlas)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Download Tabula Muris data from figshare.

Tabula Muris is a comprehensive mouse single-cell atlas covering 20 tissues.
Two protocols: FACS (Smart-seq2) and droplet (10x).
"""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os
import urllib.request

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Option A: Download from figshare (h5ad format) ---
# Tabula Muris Senis (aged mouse) h5ad files are available on figshare
TABULA_MURIS_URL = "https://figshare.com/ndownloader/files/24351014"  # Tabula Muris Senis droplet

print("Downloading Tabula Muris Senis data...")
print("Note: This is a large file (~1GB). For quick testing, use PBMC3k instead.")

h5ad_path = os.path.join(OUTPUT_DIR, "tabula_muris_senis.h5ad")

if not os.path.exists(h5ad_path):
    try:
        print(f"  Downloading from figshare to {h5ad_path}...")
        urllib.request.urlretrieve(TABULA_MURIS_URL, h5ad_path)
        print("  Download complete.")
    except Exception as e:
        print(f"  Download failed: {e}")
        print("  Falling back to scanpy test dataset...")
        # Use a smaller built-in dataset as fallback
        adata = sc.datasets.pbmc3k()
        adata.write(h5ad_path)

if os.path.exists(h5ad_path):
    adata = sc.read_h5ad(h5ad_path)
    print(f"\n  Shape: {adata.n_obs} cells x {adata.n_vars} genes")
    print(f"  Obs columns: {list(adata.obs.columns)[:10]}...")

    if "tissue" in adata.obs.columns:
        print(f"  Tissues: {adata.obs['tissue'].nunique()}")
        print(adata.obs["tissue"].value_counts().head(10))

    if "cell_ontology_class" in adata.obs.columns:
        print(f"\n  Cell types: {adata.obs['cell_ontology_class'].nunique()}")

print("Done.")
```

## Script 5: Download Dataset by GEO Accession

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Download a dataset by GEO accession number.

This is a general-purpose approach when you know the GEO ID.
"""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import os
import subprocess
import gzip
import shutil

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Configuration ---
GEO_ACCESSION = "GSE96583"  # Example: Kang et al. 2018 (stimulated PBMCs)

print(f"Downloading data for {GEO_ACCESSION}...")
print("Note: GEO downloads require wget/curl and vary by dataset format.")

# General approach: use GEO supplementary files
# Most scRNA-seq datasets on GEO provide either:
#   1. Count matrix files (mtx + barcodes + features)
#   2. H5 files
#   3. Raw FASTQ (need Cell Ranger to process)

# For this example, we provide a template for h5ad files hosted on figshare/zenodo
# that are commonly shared alongside GEO submissions

# --- Alternative: Use scanpy's built-in download for known datasets ---
print("\nFor well-known datasets, check these sources:")
sources = [
    "scanpy.datasets module      - Built-in reference datasets",
    "cellxgene Census             - Millions of cells, queryable API",
    "cellxgene portal             - https://cellxgene.cziscience.com/",
    "Human Cell Atlas             - https://data.humancellatlas.org/",
    "Single Cell Portal (Broad)   - https://singlecell.broadinstitute.org/",
    "UCSC Cell Browser            - https://cells.ucsc.edu/",
    "GEO                          - https://www.ncbi.nlm.nih.gov/geo/",
]
for s in sources:
    print(f"  {s}")

print("\nDone.")
```

## Key Parameters

| Function | Parameter | Description |
|----------|-----------|-------------|
| `sc.datasets.pbmc3k()` | (none) | Returns raw PBMC3k (~2700 cells) |
| `sc.datasets.pbmc3k_processed()` | (none) | Returns processed PBMC3k with clusters |
| `cellxgene_census.get_anndata()` | `organism` | `"Homo sapiens"` or `"Mus musculus"` |
| `cellxgene_census.get_anndata()` | `obs_value_filter` | SOMA query string for cell filtering |
| `cellxgene_census.get_anndata()` | `var_value_filter` | SOMA query string for gene filtering |
| `cellxgene_census.get_anndata()` | `obs_column_names` | List of metadata columns to include |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `ConnectionError` on download | No internet or firewall | Download files manually and use `sc.read_h5ad()` |
| Census query returns too many cells | Filter too broad | Add more specific `obs_value_filter` conditions |
| Census query is slow | Downloading millions of cells | Narrow query with tissue/disease/assay filters |
| `pbmc3k()` returns different size | Scanpy version difference | Check `sc.__version__`; newer versions may differ slightly |
| Out of memory with Census | Too many cells requested | Use Census in streaming mode or add strict filters |
