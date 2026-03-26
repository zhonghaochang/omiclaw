---
name: gene-set-enrichment
description: "Gene set enrichment and pathway activity analysis with decoupler. ORA, GSEA, ULM, MLM on MSigDB/GO/KEGG/Reactome databases."
---

# Gene Set Enrichment & Pathway Activity (decoupler)

## When to Use

- After DE analysis: interpret which pathways/gene sets are enriched in DE genes
- Pathway activity scoring per cell or per cluster
- Multiple methods: ORA (over-representation), GSEA (gene set enrichment), ULM (univariate linear model), MLM (multivariate linear model)
- Multiple databases: MSigDB Hallmark, GO (BP/MF/CC), KEGG, Reactome

## Prerequisites

- DE results (gene list or ranked gene list) OR an AnnData for per-cell activity
- Package: `decoupler`

## Complete Runnable Script: Post-DE Enrichment

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Gene set enrichment analysis on DE results using decoupler."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import decoupler as dc
import pandas as pd
import numpy as np
import os

# --- Configuration ---
DE_RESULTS_CSV = "/workspace/group/pseudobulk_de/de_T_cells.csv"  # From pseudobulk-de skill
OUTPUT_DIR = "/workspace/group/enrichment"
PADJ_THRESHOLD = 0.05
LOG2FC_THRESHOLD = 1.0

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load DE Results ---
de_df = pd.read_csv(DE_RESULTS_CSV, index_col=0)
print(f"Loaded DE results: {de_df.shape[0]} genes")
print(f"Significant: {((de_df['padj'] < PADJ_THRESHOLD) & (de_df['log2FoldChange'].abs() > LOG2FC_THRESHOLD)).sum()}")

# --- Get Gene Sets from MSigDB ---
# Hallmark gene sets
msigdb_hallmark = dc.get_resource("MSigDB", organism="human")
msigdb_hallmark = msigdb_hallmark[msigdb_hallmark["collection"] == "hallmark"]
msigdb_hallmark = msigdb_hallmark[["geneset", "genesymbol"]].rename(
    columns={"geneset": "source", "genesymbol": "target"}
)
msigdb_hallmark["weight"] = 1.0
print(f"Hallmark gene sets: {msigdb_hallmark['source'].nunique()}")

# GO Biological Process
go_bp = dc.get_resource("MSigDB", organism="human")
go_bp = go_bp[go_bp["collection"] == "go_biological_process"]
go_bp = go_bp[["geneset", "genesymbol"]].rename(
    columns={"geneset": "source", "genesymbol": "target"}
)
go_bp["weight"] = 1.0
print(f"GO BP gene sets: {go_bp['source'].nunique()}")

# KEGG pathways
kegg = dc.get_resource("MSigDB", organism="human")
kegg = kegg[kegg["collection"] == "kegg_pathways"]
kegg = kegg[["geneset", "genesymbol"]].rename(
    columns={"geneset": "source", "genesymbol": "target"}
)
kegg["weight"] = 1.0
print(f"KEGG pathways: {kegg['source'].nunique()}")

# --- 1. Over-Representation Analysis (ORA) ---
# Get significant up/down gene lists
sig_mask = (de_df["padj"] < PADJ_THRESHOLD) & (de_df["log2FoldChange"].abs() > LOG2FC_THRESHOLD)
up_genes = de_df[sig_mask & (de_df["log2FoldChange"] > 0)].index.tolist()
down_genes = de_df[sig_mask & (de_df["log2FoldChange"] < 0)].index.tolist()
print(f"\nORA: {len(up_genes)} up, {len(down_genes)} down genes")

# Create a matrix for ORA (1 = DE gene, 0 = background)
mat = pd.DataFrame(index=["up", "down"], columns=de_df.index, data=0.0)
mat.loc["up", [g for g in up_genes if g in mat.columns]] = 1.0
mat.loc["down", [g for g in down_genes if g in mat.columns]] = 1.0

# Run ORA on Hallmark
ora_hallmark = dc.run_ora(mat=mat, net=msigdb_hallmark, source="source", target="target")
ora_results_up = ora_hallmark.loc["up"].sort_values("FDR p-value")
ora_results_down = ora_hallmark.loc["down"].sort_values("FDR p-value")

print("\nTop 10 Hallmark - UP-regulated:")
print(ora_results_up.head(10)[["Combined score", "FDR p-value"]].to_string())
print("\nTop 10 Hallmark - DOWN-regulated:")
print(ora_results_down.head(10)[["Combined score", "FDR p-value"]].to_string())

# --- 2. GSEA (Gene Set Enrichment Analysis) ---
# Rank genes by signed -log10(pvalue) * sign(log2FC)
de_ranked = de_df.dropna(subset=["pvalue", "log2FoldChange"]).copy()
de_ranked["rank_metric"] = -np.log10(de_ranked["pvalue"] + 1e-300) * np.sign(de_ranked["log2FoldChange"])
rank_mat = pd.DataFrame(de_ranked["rank_metric"]).T
rank_mat.index = ["gsea"]

gsea_hallmark = dc.run_gsea(mat=rank_mat, net=msigdb_hallmark, source="source", target="target")
gsea_results = gsea_hallmark.loc["gsea"].sort_values("NES", ascending=False)

print("\nGSEA Hallmark - Top enriched:")
print(gsea_results.head(10)[["NES", "FDR p-value"]].to_string())
print("\nGSEA Hallmark - Top depleted:")
print(gsea_results.tail(10)[["NES", "FDR p-value"]].to_string())

# --- Visualization: Dotplot of GSEA Results ---
fig, ax = plt.subplots(figsize=(10, 8))
top_n = 20
gsea_top = pd.concat([gsea_results.head(top_n // 2), gsea_results.tail(top_n // 2)])
gsea_top = gsea_top.sort_values("NES")

colors = ["red" if x > 0 else "blue" for x in gsea_top["NES"]]
sizes = [-np.log10(gsea_top["FDR p-value"].clip(lower=1e-10)) * 10]
ax.barh(range(len(gsea_top)), gsea_top["NES"], color=colors, alpha=0.7)
ax.set_yticks(range(len(gsea_top)))
ax.set_yticklabels(gsea_top.index, fontsize=8)
ax.set_xlabel("Normalized Enrichment Score (NES)")
ax.set_title("GSEA Hallmark Pathways")
ax.axvline(0, c="grey", lw=0.5)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "gsea_hallmark_barplot.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Save All Results ---
ora_results_up.to_csv(os.path.join(OUTPUT_DIR, "ora_hallmark_up.csv"))
ora_results_down.to_csv(os.path.join(OUTPUT_DIR, "ora_hallmark_down.csv"))
gsea_results.to_csv(os.path.join(OUTPUT_DIR, "gsea_hallmark.csv"))
print(f"\nResults saved to: {OUTPUT_DIR}")
```

## Complete Runnable Script: Per-Cell Pathway Activity

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Per-cell pathway activity scoring with decoupler ULM/MLM."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import decoupler as dc
import pandas as pd
import numpy as np
import os

# --- Configuration ---
INPUT_H5AD = "/workspace/group/annotated.h5ad"
OUTPUT_H5AD = "/workspace/group/pathway_activity.h5ad"
OUTPUT_DIR = "/workspace/group/pathway_activity_plots"
CELLTYPE_KEY = "cell_type"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load Data ---
adata = sc.read_h5ad(INPUT_H5AD)
print(f"Loaded: {adata.shape[0]} cells, {adata.shape[1]} genes")

# --- Get PROGENy Pathway Gene Weights ---
# PROGENy provides pathway-responsive genes with weights (better than binary gene sets)
progeny = dc.get_progeny(organism="human", top=500)
print(f"PROGENy pathways: {progeny['source'].nunique()}")

# --- Run ULM (Univariate Linear Model) for Pathway Activity ---
dc.run_ulm(
    mat=adata,
    net=progeny,
    source="source",
    target="target",
    weight="weight",
    use_raw=False,
)

# Results stored in adata.obsm["ulm_estimate"] and adata.obsm["ulm_pvals"]
print(f"Pathway activities shape: {adata.obsm['ulm_estimate'].shape}")

# --- Visualize Pathway Activities ---
# Mean activity per cell type
acts = dc.get_acts(adata, obsm_key="ulm_estimate")

fig, axes = plt.subplots(1, 2, figsize=(20, 8))

# Heatmap: mean pathway activity per cell type
sc.pl.matrixplot(
    acts,
    var_names=acts.var_names,
    groupby=CELLTYPE_KEY,
    cmap="RdBu_r",
    vcenter=0,
    ax=axes[0],
    show=False,
    title="Pathway Activity (ULM)",
)

# Violin plot of selected pathways
top_pathways = ["JAK-STAT", "NFkB", "TNFa", "p53", "Hypoxia", "MAPK"]
available = [p for p in top_pathways if p in acts.var_names]
if available:
    sc.pl.stacked_violin(
        acts,
        var=available,
        groupby=CELLTYPE_KEY,
        ax=axes[1],
        show=False,
    )

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "pathway_activity_overview.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- UMAP colored by pathway activity ---
for pathway in acts.var_names[:6]:
    adata.obs[f"activity_{pathway}"] = acts[:, pathway].X.flatten()

fig, axes = plt.subplots(2, 3, figsize=(18, 12))
for i, pathway in enumerate(acts.var_names[:6]):
    ax = axes[i // 3, i % 3]
    sc.pl.umap(adata, color=f"activity_{pathway}", ax=ax, show=False,
               title=pathway, cmap="RdBu_r", vcenter=0)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "pathway_umap.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Transcription Factor Activity (DoRothEA) ---
dorothea = dc.get_dorothea(organism="human")
# Filter to high-confidence regulons (A, B, C)
dorothea = dorothea[dorothea["confidence"].isin(["A", "B", "C"])]
print(f"DoRothEA TFs: {dorothea['source'].nunique()}")

dc.run_ulm(
    mat=adata,
    net=dorothea,
    source="source",
    target="target",
    weight="weight",
    use_raw=False,
)

tf_acts = dc.get_acts(adata, obsm_key="ulm_estimate")
fig, ax = plt.subplots(figsize=(14, 8))
sc.pl.matrixplot(
    tf_acts,
    var_names=tf_acts.var_names[:30],
    groupby=CELLTYPE_KEY,
    cmap="RdBu_r",
    vcenter=0,
    ax=ax,
    show=False,
    title="Transcription Factor Activity (Top 30)",
)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "tf_activity_heatmap.png"), dpi=150, bbox_inches="tight")
plt.close()

# --- Save ---
adata.write_h5ad(OUTPUT_H5AD)
print(f"Saved: {OUTPUT_H5AD}")
print(f"Plots saved to: {OUTPUT_DIR}")
```

## Key Parameters

| Method | Function | Description |
|--------|----------|-------------|
| `run_ora` | Over-Representation Analysis | Fisher's exact test on DE gene lists. Fast, simple. |
| `run_gsea` | Gene Set Enrichment Analysis | Rank-based, uses full gene list. More powerful than ORA. |
| `run_ulm` | Univariate Linear Model | Regresses each gene on pathway membership. Good for per-cell activity. |
| `run_mlm` | Multivariate Linear Model | Multi-gene regression. More robust than ULM for correlated genes. |

| Database | Function | Content |
|----------|----------|---------|
| MSigDB Hallmark | `dc.get_resource("MSigDB")` | 50 curated hallmark gene sets |
| GO | `dc.get_resource("MSigDB")` collection="go_biological_process" | Gene Ontology terms |
| KEGG | `dc.get_resource("MSigDB")` collection="kegg_pathways" | KEGG pathway database |
| PROGENy | `dc.get_progeny()` | 14 pathways with gene weights (recommended for activity) |
| DoRothEA | `dc.get_dorothea()` | TF-target regulons with confidence levels |

## Common Issues

- **"Gene names don't match"**: Ensure gene names are HUGO symbols (not Ensembl IDs). Convert with `sc.queries.biomart_annotations()` if needed.
- **No significant ORA results**: Check that your gene list uses the same naming convention as the gene set database. Try GSEA (rank-based) instead.
- **PROGENy returns few pathways**: PROGENy has only 14 pathways by design. Use MSigDB Hallmark or GO for broader coverage.
- **DoRothEA slow**: Filter to confidence A+B only. Reduce `top` in `get_progeny()`.
- **Mouse data**: Use `organism="mouse"` in `get_progeny()` and `get_dorothea()`. For MSigDB, gene names may need conversion (capitalize first letter only).
- **Per-cell activity noisy**: Smooth with `sc.pp.neighbors()` + averaging, or aggregate to pseudobulk first.
