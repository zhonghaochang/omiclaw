---
name: scib-evaluation
description: "Quantitative evaluation of batch integration quality using scib metrics. Compare multiple integration methods."
---

# scib Integration Evaluation

## When to Use

- After running one or more batch integration methods
- To quantitatively compare integration approaches (Harmony vs scVI vs Scanorama)
- To assess both batch mixing and biological conservation
- To generate a summary benchmark table and radar plot

## Prerequisites

- Integrated AnnData with corrected embeddings in `adata.obsm`
- Batch key and cell type key in `adata.obs`
- Package: `scib`

## Complete Runnable Script

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Evaluate integration quality with scib metrics. Compare multiple methods."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import scib
import pandas as pd
import numpy as np
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/preprocessed.h5ad"
OUTPUT_TABLE = "/workspace/group/integration_benchmark.csv"
OUTPUT_PLOT = "/workspace/group/integration_benchmark.png"
BATCH_KEY = "batch"
CELLTYPE_KEY = "cell_type"

# Define methods to evaluate: name -> (h5ad_path, embedding_key)
# Adjust paths/keys to match your integrated files
METHODS = {
    "Unintegrated": (INPUT_H5AD, "X_pca"),
    "Harmony": ("/workspace/group/integrated_harmony.h5ad", "X_pca_harmony"),
    "scVI": ("/workspace/group/integrated_scvi.h5ad", "X_scVI"),
    "Scanorama": ("/workspace/group/integrated_scanorama.h5ad", "X_scanorama"),
}

# --- Evaluate Each Method ---
results = {}

for method_name, (h5ad_path, embed_key) in METHODS.items():
    if not os.path.exists(h5ad_path):
        print(f"Skipping {method_name}: {h5ad_path} not found")
        continue

    print(f"\n{'='*60}")
    print(f"Evaluating: {method_name}")
    print(f"{'='*60}")

    adata = sc.read_h5ad(h5ad_path)

    # Ensure neighbors are computed on the correct embedding
    sc.pp.neighbors(adata, use_rep=embed_key)

    # Compute cluster labels on this embedding for evaluation
    sc.tl.leiden(adata, resolution=0.8, key_added="leiden_eval")

    metrics = {}

    # --- Batch Mixing Metrics ---
    # 1. Batch ASW (Average Silhouette Width for batch)
    #    Ideal: 0 (batches mixed). scib returns 1 - |ASW|, so higher = better.
    try:
        metrics["Batch_ASW"] = scib.metrics.silhouette_batch(
            adata, batch_key=BATCH_KEY, group_key=CELLTYPE_KEY, embed=embed_key
        )
        print(f"  Batch ASW: {metrics['Batch_ASW']:.4f}")
    except Exception as e:
        print(f"  Batch ASW failed: {e}")

    # 2. Graph Connectivity (kBET-like)
    try:
        metrics["Graph_Connectivity"] = scib.metrics.graph_connectivity(
            adata, label_key=CELLTYPE_KEY
        )
        print(f"  Graph Connectivity: {metrics['Graph_Connectivity']:.4f}")
    except Exception as e:
        print(f"  Graph Connectivity failed: {e}")

    # 3. PCR Comparison (Principal Component Regression)
    try:
        adata_pre = sc.read_h5ad(INPUT_H5AD)
        if "X_pca" not in adata_pre.obsm:
            sc.pp.highly_variable_genes(adata_pre, n_top_genes=2000)
            adata_tmp = adata_pre[:, adata_pre.var["highly_variable"]].copy()
            sc.pp.scale(adata_tmp, max_value=10)
            sc.tl.pca(adata_tmp)
            adata_pre.obsm["X_pca"] = adata_tmp.obsm["X_pca"]
        metrics["PCR_Comparison"] = scib.metrics.pcr_comparison(
            adata_pre, adata, covariate=BATCH_KEY, embed=embed_key
        )
        print(f"  PCR Comparison: {metrics['PCR_Comparison']:.4f}")
        del adata_pre
    except Exception as e:
        print(f"  PCR Comparison failed: {e}")

    # --- Bio Conservation Metrics ---
    # 4. ARI (Adjusted Rand Index) - cluster vs cell type agreement
    try:
        metrics["ARI"] = scib.metrics.ari(adata, cluster_key="leiden_eval", label_key=CELLTYPE_KEY)
        print(f"  ARI: {metrics['ARI']:.4f}")
    except Exception as e:
        print(f"  ARI failed: {e}")

    # 5. NMI (Normalized Mutual Information)
    try:
        metrics["NMI"] = scib.metrics.nmi(adata, cluster_key="leiden_eval", label_key=CELLTYPE_KEY)
        print(f"  NMI: {metrics['NMI']:.4f}")
    except Exception as e:
        print(f"  NMI failed: {e}")

    # 6. Cell Type ASW
    try:
        metrics["CellType_ASW"] = scib.metrics.silhouette(
            adata, group_key=CELLTYPE_KEY, embed=embed_key
        )
        print(f"  Cell Type ASW: {metrics['CellType_ASW']:.4f}")
    except Exception as e:
        print(f"  Cell Type ASW failed: {e}")

    # 7. Isolated Label ASW (F1)
    try:
        metrics["Isolated_Label_ASW"] = scib.metrics.isolated_labels_asw(
            adata, batch_key=BATCH_KEY, label_key=CELLTYPE_KEY, embed=embed_key
        )
        print(f"  Isolated Label ASW: {metrics['Isolated_Label_ASW']:.4f}")
    except Exception as e:
        print(f"  Isolated Label ASW failed: {e}")

    results[method_name] = metrics

# --- Compile Results Table ---
df = pd.DataFrame(results).T
df.index.name = "Method"

# Compute aggregate scores
batch_cols = [c for c in ["Batch_ASW", "Graph_Connectivity", "PCR_Comparison"] if c in df.columns]
bio_cols = [c for c in ["ARI", "NMI", "CellType_ASW", "Isolated_Label_ASW"] if c in df.columns]

if batch_cols:
    df["Batch_Score"] = df[batch_cols].mean(axis=1)
if bio_cols:
    df["Bio_Score"] = df[bio_cols].mean(axis=1)
if "Batch_Score" in df.columns and "Bio_Score" in df.columns:
    df["Overall_Score"] = 0.4 * df["Batch_Score"] + 0.6 * df["Bio_Score"]

df = df.round(4)
df.to_csv(OUTPUT_TABLE)
print(f"\n{'='*60}")
print("BENCHMARK RESULTS")
print(f"{'='*60}")
print(df.to_string())
print(f"\nSaved table: {OUTPUT_TABLE}")

# --- Radar/Bar Plot ---
plot_cols = [c for c in ["Batch_ASW", "Graph_Connectivity", "ARI", "NMI", "CellType_ASW"] if c in df.columns]
if len(plot_cols) >= 3 and len(df) >= 2:
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))

    # Bar plot
    df[plot_cols].plot(kind="bar", ax=axes[0], rot=0)
    axes[0].set_title("Integration Metrics by Method")
    axes[0].set_ylabel("Score (higher = better)")
    axes[0].legend(bbox_to_anchor=(1.05, 1), loc="upper left", fontsize=8)
    axes[0].set_ylim(0, 1)

    # Overall score comparison
    if "Overall_Score" in df.columns:
        colors = plt.cm.Set2(np.linspace(0, 1, len(df)))
        df["Overall_Score"].plot(kind="barh", ax=axes[1], color=colors)
        axes[1].set_title("Overall Score (0.4 * Batch + 0.6 * Bio)")
        axes[1].set_xlabel("Score")
        axes[1].set_xlim(0, 1)
        for i, v in enumerate(df["Overall_Score"]):
            axes[1].text(v + 0.01, i, f"{v:.3f}", va="center")

    plt.tight_layout()
    plt.savefig(OUTPUT_PLOT, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Saved plot: {OUTPUT_PLOT}")
else:
    print("Not enough methods/metrics for comparison plot")
```

## Key Parameters

| Metric | Type | Range | Interpretation |
|--------|------|-------|----------------|
| `Batch_ASW` | Batch mixing | 0-1 | Higher = batches better mixed within cell types |
| `Graph_Connectivity` | Batch mixing | 0-1 | Higher = cell type clusters connected across batches |
| `PCR_Comparison` | Batch mixing | 0-1 | Higher = more batch variance removed |
| `ARI` | Bio conservation | 0-1 | Higher = clusters match cell type labels |
| `NMI` | Bio conservation | 0-1 | Higher = cluster-label mutual information |
| `CellType_ASW` | Bio conservation | 0-1 | Higher = cell types well separated |
| `Isolated_Label_ASW` | Bio conservation | 0-1 | Higher = rare cell types preserved |

## Scoring Formula

- **Batch Score** = mean(Batch_ASW, Graph_Connectivity, PCR_Comparison)
- **Bio Score** = mean(ARI, NMI, CellType_ASW, Isolated_Label_ASW)
- **Overall** = 0.4 * Batch + 0.6 * Bio (bio-conservation weighted higher)

## Common Issues

- **"cell_type" column not found**: Set `CELLTYPE_KEY` to match your annotation column name (e.g., `"celltype"`, `"annotation"`, `"louvain"`).
- **Slow computation**: Silhouette metrics are O(n^2). Subsample to 50k cells for evaluation if dataset is very large.
- **ARI/NMI are 0**: Leiden resolution may not match cell type granularity. Try multiple resolutions (0.3, 0.5, 0.8, 1.0, 1.5) and report the best.
- **All methods score similarly**: Batch effects may be mild; any method works. Check the unintegrated baseline.
- **Missing embedding key**: Verify the embedding name in `adata.obsm` (e.g., `"X_pca_harmony"` vs `"X_harmony"`).
