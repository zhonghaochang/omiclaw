# Automated Cell Type Annotation

## When to Use

Use this skill when you want to:
- Automatically annotate cell types using pre-trained models (CellTypist)
- Transfer labels from a reference atlas to your query dataset
- Get a quick first-pass annotation before manual refinement
- Annotate large datasets where manual annotation is impractical

## Prerequisites

All packages are pre-installed:
- `celltypist` -- Pre-trained cell type classification models
- `scanpy`, `anndata`
- `matplotlib`, `pandas`, `numpy`

## Script 1: CellTypist Annotation (Complete Pipeline)

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Automated cell type annotation with CellTypist.

CellTypist uses pre-trained logistic regression models trained on large
reference atlases to predict cell types in your data.

Steps:
  1. Download a pre-trained model
  2. Run prediction on your normalized data
  3. Apply majority voting for cluster-level consensus
  4. Visualize and validate results
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import celltypist
from celltypist import models
import pandas as pd
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Step 1: Load and preprocess data ---
print("=" * 60)
print("Step 1: Loading and preprocessing data")
print("=" * 60)
adata = sc.datasets.pbmc3k()
adata.var_names_make_unique()
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata.var["mt"] = adata.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], inplace=True)
adata = adata[adata.obs.pct_counts_mt < 20].copy()
adata.layers["counts"] = adata.X.copy()

# CellTypist expects log-normalized data with normalized total counts
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# Also compute UMAP for visualization
sc.pp.highly_variable_genes(adata, n_top_genes=2000, flavor="seurat_v3", layer="counts")
sc.pp.scale(adata, max_value=10)
sc.tl.pca(adata, n_comps=50, use_highly_variable=True)
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata)
sc.tl.leiden(adata, resolution=0.5, random_state=0)
print(f"  {adata.n_obs} cells, {adata.obs['leiden'].nunique()} clusters")

# Restore log-normalized data (not scaled) for CellTypist
adata_ct = adata.copy()
adata_ct.X = adata_ct.layers["counts"].copy()
sc.pp.normalize_total(adata_ct, target_sum=1e4)
sc.pp.log1p(adata_ct)

# --- Step 2: List available models ---
print("\n" + "=" * 60)
print("Step 2: Available CellTypist models")
print("=" * 60)
available_models = models.models_description()
print(f"  Total models available: {len(available_models)}")
print("\n  Key immune models:")
immune_models = available_models[available_models["model"].str.contains("Immune|PBMC|Blood", case=False)]
for _, row in immune_models.head(10).iterrows():
    print(f"    {row['model']}: {row['description'][:70]}")

# --- Step 3: Download and load model ---
print("\n" + "=" * 60)
print("Step 3: Loading CellTypist model")
print("=" * 60)
# Broad immune model (good starting point)
model_name = "Immune_All_Low.pkl"
print(f"  Downloading/loading: {model_name}")
model = models.Model.load(model=model_name)
print(f"  Cell types in model: {len(model.cell_types)}")
print(f"  Feature genes: {len(model.features)}")
print(f"  Cell types: {list(model.cell_types)[:10]}...")

# --- Step 4: Run annotation ---
print("\n" + "=" * 60)
print("Step 4: Running CellTypist annotation")
print("=" * 60)

# Without majority voting (per-cell prediction)
print("  Running per-cell prediction...")
predictions = celltypist.annotate(
    adata_ct,
    model=model_name,
    majority_voting=False,
)
adata.obs["celltypist_predicted"] = predictions.predicted_labels["predicted_labels"].values
print(f"  Per-cell annotation complete")
print(f"  Unique types: {adata.obs['celltypist_predicted'].nunique()}")

# With majority voting (cluster-refined prediction)
print("\n  Running with majority voting...")
predictions_mv = celltypist.annotate(
    adata_ct,
    model=model_name,
    majority_voting=True,
    over_clustering=adata.obs["leiden"],  # Use Leiden clusters for voting
)

# Transfer results to adata
result_adata = predictions_mv.to_adata()
adata.obs["celltypist_majority"] = result_adata.obs["majority_voting"].values
adata.obs["celltypist_conf_score"] = result_adata.obs["conf_score"].values

print(f"  Majority voting complete")
print(f"  Unique types (majority): {adata.obs['celltypist_majority'].nunique()}")

# --- Step 5: Visualize ---
print("\n" + "=" * 60)
print("Step 5: Visualization")
print("=" * 60)

fig, axes = plt.subplots(1, 3, figsize=(24, 6))
sc.pl.umap(adata, color="leiden", ax=axes[0], show=False, title="Leiden clusters")
sc.pl.umap(adata, color="celltypist_predicted", ax=axes[1], show=False,
           title="CellTypist (per-cell)", legend_fontsize=6)
sc.pl.umap(adata, color="celltypist_majority", ax=axes[2], show=False,
           title="CellTypist (majority voting)", legend_fontsize=6)
plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "celltypist_results.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved CellTypist results plot")

# Confidence score UMAP
sc.pl.umap(adata, color="celltypist_conf_score", save="_confidence.png", show=False)
print("  Saved confidence score plot")

# --- Step 6: Summary ---
print("\n" + "=" * 60)
print("Step 6: Cell type composition")
print("=" * 60)
composition = adata.obs["celltypist_majority"].value_counts()
for ct_name, count in composition.items():
    print(f"  {ct_name}: {count} cells ({count/adata.n_obs*100:.1f}%)")

# Cross-tabulation: Leiden vs CellTypist
crosstab = pd.crosstab(adata.obs["leiden"], adata.obs["celltypist_majority"])
crosstab_path = os.path.join(OUTPUT_DIR, "leiden_vs_celltypist.csv")
crosstab.to_csv(crosstab_path)
print(f"\n  Saved cross-tabulation: {crosstab_path}")
print("\n  Leiden vs CellTypist:")
print(crosstab.to_string())

# Save
out_path = os.path.join(OUTPUT_DIR, "celltypist_annotated.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 2: Multiple Models for Consensus Annotation

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Run multiple CellTypist models and compare for robust annotation.

Using both broad (Low) and fine-grained (High) models helps validate
annotations and discover sub-types.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import celltypist
from celltypist import models
import pandas as pd
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Load processed PBMC3k ---
print("Loading PBMC3k processed...")
adata = sc.datasets.pbmc3k_processed()
print(f"  {adata.n_obs} cells, {adata.n_vars} genes")

# --- Run multiple models ---
model_configs = [
    ("Immune_All_Low.pkl", "celltypist_low"),    # Broad cell types
    ("Immune_All_High.pkl", "celltypist_high"),   # Fine-grained sub-types
]

for model_name, col_name in model_configs:
    print(f"\nRunning {model_name}...")
    predictions = celltypist.annotate(
        adata,
        model=model_name,
        majority_voting=True,
    )
    result = predictions.to_adata()
    adata.obs[col_name] = result.obs["majority_voting"].values
    n_types = adata.obs[col_name].nunique()
    print(f"  {n_types} cell types identified")

    # Print composition
    for ct, count in adata.obs[col_name].value_counts().items():
        print(f"    {ct}: {count} ({count/adata.n_obs*100:.1f}%)")

# --- Compare models ---
print("\n" + "=" * 60)
print("Model comparison")
print("=" * 60)

# Cross-tabulation
crosstab = pd.crosstab(adata.obs["celltypist_low"], adata.obs["celltypist_high"])
print("\nLow-resolution vs High-resolution:")
print(crosstab.to_string())

crosstab.to_csv(os.path.join(OUTPUT_DIR, "model_comparison_crosstab.csv"))

# --- Visualize comparison ---
fig, axes = plt.subplots(1, 3, figsize=(24, 6))

# Original annotation (if available)
if "louvain" in adata.obs.columns:
    sc.pl.umap(adata, color="louvain", ax=axes[0], show=False,
               title="Original (Louvain)", legend_fontsize=7)
else:
    axes[0].set_visible(False)

sc.pl.umap(adata, color="celltypist_low", ax=axes[1], show=False,
           title="CellTypist Low (broad)", legend_fontsize=7)
sc.pl.umap(adata, color="celltypist_high", ax=axes[2], show=False,
           title="CellTypist High (fine)", legend_fontsize=6)

plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "multi_model_comparison.png"), dpi=150, bbox_inches="tight")
plt.close()
print("\n  Saved multi-model comparison plot")

# --- Consensus: combine broad + fine ---
# Use broad types as main annotation, add fine types as sub-annotation
adata.obs["cell_type_broad"] = adata.obs["celltypist_low"]
adata.obs["cell_type_fine"] = adata.obs["celltypist_high"]

out_path = os.path.join(OUTPUT_DIR, "multi_model_annotated.h5ad")
adata.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Script 3: Reference-Based Annotation with Ingest

```python
#!/usr/bin/env ${CONDA_ENV_PATH}/bin/python
"""Reference-based annotation using scanpy's ingest.

Transfer cell type labels from a reference (annotated) dataset
to a query (unannotated) dataset based on shared gene expression patterns.
"""

import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import scanpy as sc
import numpy as np
import os

OUTPUT_DIR = "/workspace/group/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sc.settings.figdir = OUTPUT_DIR

# --- Step 1: Load reference (annotated) dataset ---
print("Step 1: Loading reference dataset...")
adata_ref = sc.datasets.pbmc3k_processed()
print(f"  Reference: {adata_ref.n_obs} cells, {adata_ref.n_vars} genes")
print(f"  Cell types: {list(adata_ref.obs['louvain'].cat.categories)}")

# --- Step 2: Load query (unannotated) dataset ---
print("\nStep 2: Loading query dataset...")
# For demo, use a subset of the same data (in practice, this is your new data)
adata_query = sc.datasets.pbmc3k()
adata_query.var_names_make_unique()
sc.pp.filter_cells(adata_query, min_genes=200)
sc.pp.filter_genes(adata_query, min_cells=3)
adata_query.var["mt"] = adata_query.var_names.str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata_query, qc_vars=["mt"], inplace=True)
adata_query = adata_query[adata_query.obs.pct_counts_mt < 20].copy()
sc.pp.normalize_total(adata_query, target_sum=1e4)
sc.pp.log1p(adata_query)
print(f"  Query: {adata_query.n_obs} cells, {adata_query.n_vars} genes")

# --- Step 3: Align features ---
print("\nStep 3: Aligning features between reference and query...")
# Find shared genes
shared_genes = adata_ref.var_names.intersection(adata_query.var_names)
print(f"  Shared genes: {len(shared_genes)}")

# Subset to shared genes
adata_ref_sub = adata_ref[:, shared_genes].copy()
adata_query_sub = adata_query[:, shared_genes].copy()

# Compute PCA on reference
sc.pp.highly_variable_genes(adata_ref_sub, n_top_genes=min(2000, len(shared_genes)))
sc.tl.pca(adata_ref_sub, n_comps=50, use_highly_variable=True)
sc.pp.neighbors(adata_ref_sub, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata_ref_sub)

# --- Step 4: Ingest query into reference space ---
print("\nStep 4: Ingesting query into reference space...")
sc.tl.ingest(
    adata_query_sub,
    adata_ref_sub,
    obs="louvain",           # Transfer this annotation
    embedding_method="umap",  # Project into reference UMAP
)
print(f"  Transferred labels: {adata_query_sub.obs['louvain'].nunique()} cell types")

# --- Step 5: Visualize ---
print("\nStep 5: Visualizing...")
fig, axes = plt.subplots(1, 2, figsize=(16, 6))
sc.pl.umap(adata_ref_sub, color="louvain", ax=axes[0], show=False,
           title="Reference (annotated)")
sc.pl.umap(adata_query_sub, color="louvain", ax=axes[1], show=False,
           title="Query (transferred labels)")
plt.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "ingest_annotation.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved ingest annotation plot")

# Composition
print("\nTransferred cell type composition:")
for ct, count in adata_query_sub.obs["louvain"].value_counts().items():
    print(f"  {ct}: {count} ({count/adata_query_sub.n_obs*100:.1f}%)")

out_path = os.path.join(OUTPUT_DIR, "ingest_annotated.h5ad")
adata_query_sub.write(out_path)
print(f"\nSaved to {out_path}")
print("Done.")
```

## Available CellTypist Models

| Model | Tissues | Resolution | Typical Use |
|-------|---------|-----------|-------------|
| `Immune_All_Low.pkl` | Pan-immune | Broad (T, B, NK, Mono, DC) | First-pass immune cell annotation |
| `Immune_All_High.pkl` | Pan-immune | Fine (CD4 naive, CD8 TEM, etc.) | Detailed immune sub-typing |
| `Developing_Human_Brain.pkl` | Brain | Neural cell types | Brain organoids, cortical samples |
| `Pan_Fetal_Human.pkl` | Multiple fetal | Developmental cell types | Fetal tissue studies |
| `Healthy_COVID19_PBMC.pkl` | Blood | COVID-specific states | COVID-19 PBMC studies |
| `Adult_Mouse_Gut.pkl` | Gut | Intestinal cell types | Mouse intestinal studies |
| `Cells_Lung_Airway.pkl` | Lung | Airway cell types | Respiratory studies |

Full list: `celltypist.models.models_description()`

## Key Parameters

| Function | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `celltypist.annotate` | `model` | required | Model name or path |
| `celltypist.annotate` | `majority_voting` | `False` | Use cluster consensus (recommended: `True`) |
| `celltypist.annotate` | `over_clustering` | `None` | Custom clustering for majority voting |
| `celltypist.annotate` | `p_thres` | 0.5 | Probability threshold for confident predictions |
| `celltypist.annotate` | `min_prop` | 0 | Minimum proportion for majority voting |
| `sc.tl.ingest` | `obs` | required | Annotation column to transfer |
| `sc.tl.ingest` | `embedding_method` | `"umap"` | Method for embedding projection |

## Annotation Quality Checks

1. **Confidence scores**: Low scores indicate uncertain predictions
2. **Cross-tabulation**: Compare automated vs manual annotation
3. **Marker validation**: Check that predicted types express expected markers
4. **UMAP overlay**: Verify that annotations are spatially coherent on UMAP

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Many "Unassigned" cells | Low confidence predictions | Lower `p_thres`, or use a more relevant model |
| Wrong tissue model | Model not suited to your tissue | Check `models.models_description()` for tissue-specific models |
| Gene name mismatch | CellTypist uses gene symbols | Convert Ensembl IDs to symbols before annotation |
| Model download fails | Network issue | Check internet; models cache at `~/.celltypist/data/models/` |
| Too many fine-grained types | High-resolution model | Use `Immune_All_Low.pkl` for broader categories |
| Ingest gives bad results | Reference and query too different | Use CellTypist or scANVI for cross-dataset annotation |
| Majority voting picks wrong type | Clustering too coarse/fine | Try different `over_clustering` resolution |
