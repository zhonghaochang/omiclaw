---
name: 02-global-atlas
description: Section 2：全局图谱整合。将所有数据集拼接后以 scVI（默认）或 BBKNN（备选）进行泛癌种去批次融合，输出全局 UMAP 与整合诊断。
type: reference
---

# Section 2：全局图谱整合

## 概述

| 项 | 说明 |
|---|---|
| **读入** | Section 1 输出的所有独立 `.h5ad` 文件 + `manifest.tsv` 路由表 |
| **处理** | 将所有数据拼接 → 采用 scVI（默认）或 BBKNN（备选）在降维空间进行泛癌种融合 |
| **输出** | 包含所有细胞的全局融合 `merged.h5ad` 文件（仅含降维坐标，不含修改后的表达矩阵）+ 批次消除效果评估报告 |

**前置依赖**：Section 1 完成

## 整合方法选择

**默认方法：scVI**（`scvi-tools`，GPU 加速）

本项目涉及 5 个队列、多种癌症类型、不同测序平台。scVI 优势：
- 直接建模原始 counts 的离散分布（负二项分布）
- 非线性 latent space 对复杂批次效应有更强的纠偏能力
- 原生 Python + PyTorch，可利用 GPU（A100）加速
- 可扩展至百万级细胞

**首选备选方法：BBKNN**

当 scVI 训练失败时（如 GPU OOM、收敛异常），首选回退到 BBKNN。BBKNN 直接在 PCA 空间上构建 batch-balanced neighbors graph，轻量且稳定。

**紧急备选：Harmony**（默认弃用，仅当 scVI 和 BBKNN 都失败时）

回退时必须：
1. 在 `global_atlas_integration_diagnostics.tsv` 中记录失败原因
2. 在 pipeline.log 中记录 WARNING
3. Harmony 本身失败时，必须 `raise` 阻断，不得再降级为未校正 PCA

## 整合的强制用途

整合方法至少承担以下任务：
- 跨数据集对齐成纤维细胞与免疫亚型定义
- 构建泛癌种联合 UMAP 可视化
- 支持全局高分辨率 clustering 与统一 `Cell_Subtype` 注释
- 为后续标签下放提供一致的全局亚型字典

## scVI 正确执行流程（默认）

```text
第1步：每个数据集独立完成基础 QC，保留原始 counts 层（adata.layers["counts"] = adata.X.copy()）
第2步：各数据集独立归一化 + log1p，保留归一化层（adata.layers["lognorm"] = adata.X.copy()）
第3步：将所有细胞拼接成一个全局对象，补全 dataset_id / patient_id / sample_id / lesion_id / cancer_context
第4步：在全局对象上选 HVG（flavor="seurat_v3", n_top_genes=4000, batch_key="dataset_id"）
第5步：设置 scVI 模型并训练
         scvi.model.SCVI.setup_anndata(atlas, layer="counts", batch_key="dataset_id")
         model = scvi.model.SCVI(atlas, n_latent=30, n_layers=2)
         model.train(max_epochs=200, early_stopping=True)
第6步：提取 latent representation
         atlas.obsm["X_scVI"] = model.get_latent_representation()
第7步：用 scVI latent 做：sc.pp.neighbors(use_rep="X_scVI") → sc.tl.umap() → 高分辨率 leiden 聚类
第8步：基于全局聚类和 marker 基因集统一赋予 Cell_Subtype（详见 Section 3）
第9步：将 Cell_Subtype 标签回传到各个原始数据集对象（详见 Section 3）
第10步：所有基因集打分、亚型占比与病人级特征，必须在各数据集原始的、未整合的归一化矩阵上独立计算（详见 Section 4）
```

## BBKNN 备选执行流程（scVI 失败时）

```text
第1步：每个数据集独立完成基础 QC、归一化与 HVG 预处理，并保留原始/归一化矩阵副本
第2步：将所有细胞拼接成一个全局对象，补全 dataset_id 等元数据
第3步：在全局 HVG 矩阵上 scale + PCA（n_comps=50）
第4步：运行 BBKNN：
         bbknn.bbknn(atlas, batch_key="dataset_id", n_pcs=50)
第5步：用 BBKNN 校正后的 neighbors graph 做：sc.tl.umap() → 高分辨率 leiden 聚类
第6-10步：同 scVI 流程的第 8-10 步
```

## Harmony 紧急备选执行流程（仅当 scVI 和 BBKNN 都失败时）

```text
第1步：同 BBKNN 流程的第 1-3 步
第4步：在 PCA 嵌入上运行 Harmony：
         sce.pp.harmony_integrate(atlas, key="dataset_id", basis="X_pca", adjusted_basis="X_pca_harmony")
第5步：用 Harmony 校正后的嵌入做：neighbors → sc.tl.umap() → 高分辨率聚类
第6-10步：同 scVI 流程的第 8-10 步
```

## 参考实现脚本

```python
from __future__ import annotations

import anndata as ad
import numpy as np
import pandas as pd
import scanpy as sc


def build_global_atlas(dataset_adatas: dict[str, ad.AnnData]) -> ad.AnnData:
    prepared = []
    for dataset_id, adata in dataset_adatas.items():
        x = adata.copy()
        x.obs["dataset_id"] = dataset_id
        x.obs["cell_id"] = x.obs_names.astype(str)
        sc.pp.normalize_total(x, target_sum=1e4)
        sc.pp.log1p(x)
        x.layers["lognorm"] = x.X.copy()
        prepared.append(x)

    atlas = ad.concat(prepared, join="outer", label="dataset_join", fill_value=0.0)
    sc.pp.highly_variable_genes(
        atlas,
        flavor="seurat_v3",
        n_top_genes=4000,
        batch_key="dataset_id",
        subset=True,
    )

    # --- 默认方法：scVI（GPU 加速）---
    import scvi
    try:
        scvi.model.SCVI.setup_anndata(atlas, layer="counts", batch_key="dataset_id")
        model = scvi.model.SCVI(atlas, n_latent=30, n_layers=2)
        model.train(max_epochs=200, early_stopping=True)
        atlas.obsm["X_scVI"] = model.get_latent_representation()
        use_rep = "X_scVI"
        integration_method = "scVI"
    except Exception as e:
        # --- 首选备选：BBKNN ---
        import logging
        logger = logging.getLogger(__name__)
        logger.warning("scVI failed (%s), falling back to BBKNN", e)
        try:
            import bbknn
            sc.pp.scale(atlas, max_value=10)
            sc.tl.pca(atlas, n_comps=50, svd_solver="arpack")
            bbknn.bbknn(atlas, batch_key="dataset_id", n_pcs=50)
            use_rep = "X_pca"  # BBKNN modifies the neighbors graph directly
            integration_method = "BBKNN_fallback"
        except Exception as e2:
            # --- 紧急备选：Harmony ---
            logger.warning("BBKNN also failed (%s), falling back to Harmony", e2)
            try:
                import scanpy.external as sce
            except ImportError:
                raise RuntimeError("scVI, BBKNN, and Harmony all unavailable")
            sc.pp.scale(atlas, max_value=10)
            sc.tl.pca(atlas, n_comps=50, svd_solver="arpack")
            sce.pp.harmony_integrate(atlas, key="dataset_id", basis="X_pca", adjusted_basis="X_pca_harmony")
            if "X_pca_harmony" not in atlas.obsm:
                raise RuntimeError("Harmony integration also failed")
            use_rep = "X_pca_harmony"
            integration_method = "Harmony_emergency_fallback"

    if integration_method == "BBKNN_fallback":
        # BBKNN already set up the neighbors graph
        pass
    else:
        sc.pp.neighbors(atlas, use_rep=use_rep, n_neighbors=30)
    sc.tl.umap(atlas, min_dist=0.3)
    sc.tl.leiden(atlas, resolution=1.2, key_added="global_cluster")
    return atlas
```

**绝对不要这样写：**
- 不要把 `unit_id` 或样本级组成矩阵做 SVD/PCA 后伪装成 `Global UMAP`
- 不要把 `major_cell_type/subtype_label` 的已有统计表当作 cell-level atlas
- 不要用 `raw_label` 字符串匹配直接生成最终细亚型，然后跳过全局 clustering

## 批次纠偏时机总结

| 场景 | 纠偏层次 | 方法 |
|---|---|---|
| 泛癌种全局 atlas 注释 | 全局对象的 latent / 嵌入层 | scVI（默认）或 BBKNN（备选），以 `dataset_id` 为批次键 |
| 标签下放后的病人级特征工程 | 各数据集原始/归一化矩阵层 | 独立 `score_genes` / frac / ratio，不得在整合嵌入上打分 |
| 建模阶段的混淆控制 | 元数据层 | `dataset_id`、`cancer_context` 仅作元数据，不入 primary model |

## 强制输出图

| 图名 | 目的 |
|---|---|
| `Fig_S2_Global_UMAP.pdf` | 展示全队列整合后的统一细胞图谱与稀有亚群分离效果 |
| `Fig_S3_Global_Dotplot.pdf` | 展示各大亚群核心 marker 的全局气泡图/点图 |

每张图都必须同步交付：`png` + `*_source_data.tsv` + `*_caption.md`

## Deliverables（交付物清单）

| 交付物 | 路径 |
|---|---|
| 全局融合对象 | `work/atlas/merged.h5ad` |
| 整合诊断报告 | `work/atlas/global_atlas_integration_diagnostics.tsv` |
| 全局 UMAP | `work/atlas/figures/Fig_S2_Global_UMAP.pdf` + `.png` |
| 全局 Dotplot | `work/atlas/figures/Fig_S3_Global_Dotplot.pdf` + `.png` |

### 完成检查

- [ ] 全局 atlas 包含所有数据集的全部细胞（无 downsampling）
- [ ] 整合方法成功（scVI / BBKNN / Harmony），诊断报告已输出
- [ ] 全局 UMAP 能看到主要细胞舱室的分离
- [ ] Fig_S2 和 Fig_S3 已生成（pdf + png + source_data + caption）

**完成后可暂停并回复用户，提示进入 Section 3。**
