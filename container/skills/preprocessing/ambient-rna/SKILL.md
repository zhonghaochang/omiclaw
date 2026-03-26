# Ambient RNA Removal

## When to Use

Use this skill when your droplet-based scRNA-seq data (10x Chromium) has significant ambient RNA contamination. Ambient RNA comes from lysed cells in the suspension and creates a background of mRNA that contaminates all droplets.

**Signs of ambient RNA contamination:**
- Marker genes appear in unexpected cell types (e.g., hemoglobin in non-RBCs)
- High expression of highly expressed genes across all cells
- Clusters look "blurred" or cell types are hard to separate

**Note:** This step is optional and typically done before standard QC filtering. Most analyses skip it unless contamination is visually obvious.

## Prerequisites

- `scanpy`, `anndata`, `numpy`, `matplotlib` (pre-installed)
- `soupx` -- Available via rpy2 (R package) or Python reimplementation
- `cellbender` -- Separate installation may be needed (deep learning approach)

## Script 1: Estimate Ambient RNA Contamination Level

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Estimate ambient RNA contamination in your dataset.

This script helps you assess whether ambient RNA removal is needed
by checking for known marker genes in unexpected cell types.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load processed data (with clusters) ---
print("Loading PBMC3k processed data...")
adata = sc.datasets.pbmc3k_processed()
print(f"  Shape: {adata.n_obs} cells x {adata.n_vars} genes")
print(f"  Cell types: {list(adata.obs['louvain'].cat.categories)}")

# --- Check marker gene expression across clusters ---
# If these genes appear in unexpected clusters, you may have ambient RNA
marker_genes = {
    "T cell markers": ["CD3D", "CD3E"],
    "B cell markers": ["MS4A1", "CD79A"],
    "Monocyte markers": ["CST3", "LYZ"],
    "NK markers": ["NKG7", "GNLY"],
    "Platelet markers": ["PPBP", "PF4"],
}

print("\nChecking marker gene expression across clusters...")
for category, genes in marker_genes.items():
    available_genes = [g for g in genes if g in adata.var_names]
    if available_genes:
        print(f"\n  {category}: {available_genes}")
        # Check mean expression per cluster
        for gene in available_genes:
            gene_idx = list(adata.var_names).index(gene)
            for ct in adata.obs["louvain"].cat.categories:
                mask = adata.obs["louvain"] == ct
                if hasattr(adata.X, "toarray"):
                    mean_expr = adata.X[mask, gene_idx].toarray().mean()
                else:
                    mean_expr = adata.X[mask, gene_idx].mean()
                if mean_expr > 0.1:  # Non-trivial expression
                    print(f"    {gene} in {ct}: mean={mean_expr:.2f}")

# --- Visualize potential contamination ---
check_genes = ["CST3", "NKG7", "PPBP", "CD3D", "MS4A1", "LYZ"]
available = [g for g in check_genes if g in adata.var_names]

if available:
    sc.pl.dotplot(adata, available, groupby="louvain",
                  save="_ambient_check.png", show=False)
    print("\n  Saved dotplot for ambient RNA assessment")
    print("  Look for unexpected expression: if a T cell marker appears in")
    print("  monocytes, ambient RNA contamination may be present.")

# --- Estimate contamination fraction ---
print("\n--- Contamination estimation ---")
print("  A rough estimate: look at the expression of cell-type-specific markers")
print("  in cell types where they should NOT be expressed.")
print("  If PPBP (platelet) shows mean > 0.5 in T cells, contamination is likely.")
print("  Typical contamination fraction: 1-10% of total counts per cell.")

print("\nDone.")
```

## Script 2: Manual Ambient RNA Correction (Python)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Simple ambient RNA correction approach in Python.

This implements a basic SoupX-like correction:
1. Estimate the ambient RNA profile from empty droplets
2. Subtract a fraction of the ambient profile from each cell

For production use, consider CellBender (Script 3) for better results.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import scipy.sparse as sp
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Configuration ---
# You need BOTH filtered (cells) and raw (all droplets) matrices from Cell Ranger
FILTERED_H5 = "/path/to/filtered_feature_bc_matrix.h5"  # Cells only
RAW_H5 = "/path/to/raw_feature_bc_matrix.h5"            # All droplets including empty
CONTAMINATION_FRACTION = 0.1  # Estimated fraction (0.02-0.2 typical)

print("=" * 60)
print("Ambient RNA Correction (SoupX-style)")
print("=" * 60)

# --- For demonstration, simulate with PBMC3k ---
print("\nNote: Using PBMC3k for demonstration.")
print("Replace with your own filtered and raw matrices.\n")

adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)

# Simulate ambient profile (in practice, compute from empty droplets)
# Empty droplets are barcodes in raw matrix but NOT in filtered matrix
# Ambient profile = mean expression across empty droplets
print("Step 1: Estimating ambient RNA profile...")
if sp.issparse(adata.X):
    total_expression = np.array(adata.X.sum(axis=0)).flatten()
else:
    total_expression = adata.X.sum(axis=0).flatten()

# Ambient profile is proportional to total gene expression
ambient_profile = total_expression / total_expression.sum()
print(f"  Ambient profile computed for {len(ambient_profile)} genes")
print(f"  Top ambient genes: {adata.var_names[np.argsort(ambient_profile)[-5:]].tolist()}")

# --- Step 2: Subtract ambient RNA ---
print(f"\nStep 2: Subtracting ambient RNA (contamination fraction={CONTAMINATION_FRACTION})...")

# Store original counts
adata.layers["raw_counts"] = adata.X.copy()

# For each cell, subtract: contamination_fraction * total_counts * ambient_profile
if sp.issparse(adata.X):
    cell_totals = np.array(adata.X.sum(axis=1)).flatten()
    corrected = adata.X.toarray().astype(np.float64)
else:
    cell_totals = adata.X.sum(axis=1).flatten()
    corrected = adata.X.astype(np.float64).copy()

for i in range(adata.n_obs):
    correction = CONTAMINATION_FRACTION * cell_totals[i] * ambient_profile
    corrected[i, :] = np.maximum(corrected[i, :] - correction, 0)

# Round to integers (counts should be non-negative integers)
corrected = np.round(corrected).astype(np.float32)
adata.X = sp.csr_matrix(corrected)

print(f"  Correction complete")
print(f"  Mean counts before: {cell_totals.mean():.0f}")
new_totals = np.array(adata.X.sum(axis=1)).flatten()
print(f"  Mean counts after:  {new_totals.mean():.0f}")
print(f"  Mean reduction:     {(1 - new_totals.mean()/cell_totals.mean())*100:.1f}%")

# --- Step 3: Verify correction ---
print("\nStep 3: Verification...")
# Check that highly expressed genes were reduced proportionally
top_ambient = np.argsort(ambient_profile)[-5:]
for idx in top_ambient:
    gene = adata.var_names[idx]
    before = np.array(adata.layers["raw_counts"][:, idx].toarray()).mean() if sp.issparse(adata.layers["raw_counts"]) else adata.layers["raw_counts"][:, idx].mean()
    after = np.array(adata.X[:, idx].toarray()).mean() if sp.issparse(adata.X) else adata.X[:, idx].mean()
    print(f"  {gene}: {before:.2f} -> {after:.2f}")

# Save
out_path = os.path.join(OUTPUT_DIR, "ambient_corrected.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 3: CellBender (Deep Learning Approach)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""CellBender ambient RNA removal.

CellBender uses a deep generative model to distinguish cell-containing
droplets from empty droplets and remove ambient RNA.

NOTE: CellBender may need separate installation:
  pip install cellbender
It also benefits from GPU acceleration.

CellBender is run as a command-line tool, not a Python library.
This script shows how to run it and load results.
"""

import matplotlib; matplotlib.use("Agg")
import scanpy as sc
import subprocess
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Configuration ---
RAW_H5 = "/path/to/raw_feature_bc_matrix.h5"  # Raw Cell Ranger output (all droplets)
OUTPUT_H5 = os.path.join(OUTPUT_DIR, "cellbender_output.h5")
EXPECTED_CELLS = 3000   # Approximate number of real cells
TOTAL_DROPLETS = 15000  # Include some empty droplets (2-5x expected cells)
EPOCHS = 150
FPR = 0.01             # False positive rate (0.01 = conservative)

# --- Check if CellBender is available ---
print("Checking CellBender installation...")
try:
    result = subprocess.run(
        ["cellbender", "--help"],
        capture_output=True, text=True, timeout=10,
    )
    cellbender_available = result.returncode == 0
except (FileNotFoundError, subprocess.TimeoutExpired):
    cellbender_available = False

if cellbender_available:
    print("  CellBender is available!")

    # --- Run CellBender ---
    cmd = [
        "cellbender", "remove-background",
        "--input", RAW_H5,
        "--output", OUTPUT_H5,
        "--expected-cells", str(EXPECTED_CELLS),
        "--total-droplets-included", str(TOTAL_DROPLETS),
        "--epochs", str(EPOCHS),
        "--fpr", str(FPR),
        "--cuda",  # Remove if no GPU available
    ]
    print(f"\n  Running: {' '.join(cmd)}")
    print("  This may take 10-30 minutes...")

    try:
        subprocess.run(cmd, check=True, timeout=3600)
        print("  CellBender complete!")

        # Load CellBender output
        adata = sc.read_10x_h5(OUTPUT_H5)
        print(f"  Result: {adata.n_obs} cells x {adata.n_vars} genes")

        adata.write(os.path.join(OUTPUT_DIR, "cellbender_corrected.h5ad"))
        print(f"  Saved corrected data")

    except subprocess.CalledProcessError as e:
        print(f"  CellBender failed: {e}")
    except subprocess.TimeoutExpired:
        print("  CellBender timed out (>1 hour)")
else:
    print("  CellBender is NOT installed.")
    print("  Install with: pip install cellbender")
    print("  Or use the manual correction approach (Script 2).")
    print("\n  CellBender command reference:")
    print("    cellbender remove-background \\")
    print("      --input raw_feature_bc_matrix.h5 \\")
    print("      --output cellbender_output.h5 \\")
    print("      --expected-cells 3000 \\")
    print("      --total-droplets-included 15000 \\")
    print("      --epochs 150 \\")
    print("      --fpr 0.01")

print("\nDone.")
```

## Key Parameters

| Tool | Parameter | Typical Value | Description |
|------|-----------|--------------|-------------|
| Manual | `contamination_fraction` | 0.02-0.2 | Fraction of counts from ambient RNA |
| CellBender | `--expected-cells` | From Cell Ranger | Approximate number of real cells |
| CellBender | `--total-droplets-included` | 2-5x cells | Include empty droplets for profile estimation |
| CellBender | `--epochs` | 150 | Training epochs (increase if loss not converged) |
| CellBender | `--fpr` | 0.01 | False positive rate; lower = more conservative |
| CellBender | `--cuda` | (flag) | Use GPU if available |

## When to Skip Ambient RNA Removal

| Scenario | Skip? | Reason |
|----------|-------|--------|
| Clean PBMC data | Yes | Minimal contamination expected |
| Plate-based (Smart-seq2) | Yes | No ambient RNA in plate-based protocols |
| Solid tissue with lysis | No | High contamination from tissue dissociation |
| Samples with many dead cells | No | Dead cells release RNA into suspension |
| Mixed species experiment | Check | Ambient RNA correction helps species demultiplexing |

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| CellBender `ModuleNotFoundError` | Not installed | `pip install cellbender` |
| CellBender OOM on GPU | Dataset too large | Reduce `--total-droplets-included` or use CPU |
| Over-correction removes signal | Contamination fraction too high | Lower `contamination_fraction` or CellBender `--fpr` |
| No raw matrix available | Only filtered output from Cell Ranger | Cannot estimate ambient profile; skip this step |
| Negative counts after correction | Subtraction exceeded count | Clamp to zero with `np.maximum(corrected, 0)` |
