---
name: 02-global-atlas
description: Section 2：全局图谱整合。将所有数据集全量拼接后以 Harmony 进行去批次整合，输出全局 UMAP、dotplot 和整合诊断。
type: reference
---

# Section 2：全局图谱整合

## 概述

| 项 | 说明 |
|---|---|
| 读入 | Section 1 输出的所有独立 `.h5ad` + `manifest_all.tsv` |
| 处理 | 全量细胞拼接 -> checkpointed HVG/PCA -> Harmony -> neighbors -> full-optimization UMAP -> Leiden |
| 输出 | `merged.h5ad`、`atlas_checkpoint_manifest.tsv`、`global_atlas_integration_diagnostics.tsv`、全局图谱图包 |

**前置依赖**：Section 1 完成

## 与 Section 3 的接口契约

- Section 3 的肿瘤感知注释必须消费本 Section 产出的真实全局 atlas，不得跳过本 Section 直接用 metadata 粗分
- `merged.h5ad` 至少要为下游保留：
  - `cell_id`
  - `dataset_id`
  - `patient_id`
  - `sample_id`
  - `global_cluster`
  - `X_umap`
- `global_cluster` 必须来自 Section 2 的真实 Leiden 结果，不得由 `raw_label` / `cellType` / `cluster` / 其他现成 metadata 直接拼接代替
- Section 3 Step 1 可以基于同一 atlas 额外派生 `global_cluster_coarse` / `top_level_cluster` 做 coarse compartment 粗分与 DE，但不能用 metadata partition 覆盖正式 `global_cluster`

## 唯一正式整合器

本 skill 的正式整合器只有一个：

```text
Harmony(full data)
```

禁止：
- `scVI`
- `BBKNN`
- `Harmony sketch`
- atlas downsampling
- 未校正 PCA 冒充整合成功

## 允许的 atlas checkpoint / cache

本 Section 鼓励保存中间 atlas checkpoint，以支持断点恢复、失败重试和参数未改动时的快速复用，但前提是 **分析结果必须与从头运行一致**。

推荐 checkpoint 目录：

```text
work/atlas/checkpoints/
├── atlas_concat_full.h5ad
├── atlas_post_hvg_pca.h5ad
├── atlas_post_harmony.h5ad
├── atlas_post_neighbors.h5ad
└── atlas_checkpoint_manifest.tsv
```

复用规则：
- 只能复用 full-data checkpoint，不能复用任意采样、中途裁剪或只保留部分 compartment 的对象
- 复用前必须核对 `qc_total_cells`、`atlas_input_cells`、`cell_id` 顺序、`dataset_id`、HVG 数量、PCA 维度、Harmony 参数
- checkpoint 损坏、schema 不全、shape 不匹配时，必须自动失效并回退到最近可信上游步骤
- 每次 save / load / invalidate 都必须写日志，并登记到 `atlas_checkpoint_manifest.tsv`

## Harmony 正确执行流程

```text
第1步：每个数据集先完成基础 QC，并保留 raw counts / lognorm
第2步：将全部 QC 后细胞拼接成 atlas，对每个细胞补全 dataset_id / patient_id / sample_id
第3步：保存 concat checkpoint（仅用于 resume/retry）
第4步：将 dataset_id 强制转为纯字符串，禁止 mixed dtype
第5步：全局对象上做 normalize_total -> log1p -> HVG -> PCA(50)
第6步：保存 pre-harmony checkpoint
第7步：运行 harmonypy.run_harmony(pca, obs, "dataset_id")
第8步：对 Z_corr 进行方向断言，强制得到 n_obs x n_pcs
第9步：写入 atlas.obsm["X_pca_harmony"] 并保存 post-harmony checkpoint
第10步：在 X_pca_harmony 上做 neighbors -> full-optimization sc.tl.umap() -> leiden
第11步：将真实 `global_cluster` 提交给 Section 3，完成 top-level/major/subtype 标注后再导出正式 Fig_S2
```

## 禁止的提速捷径

以下操作会损害图谱质量或注释可靠性，在正式流程中必须明确禁止：

- `sc.tl.umap(..., maxiter < 60)` 这类低迭代上限
- `sc.tl.umap(..., init_pos="random")` 这类仅为提速的随机初始化
- `sc.tl.leiden(..., n_iterations=2)` 或其他明显过低的强制迭代上限
- 将全局 atlas `neighbors` 人为压到过低设置以换速度；正式全局 atlas 使用 `n_neighbors=30`
- 在 `Major_CellType` 和 Fibroblast 细分标签尚未稳定前，就提前导出正式 `Fig_S2`
- 用 metadata partition、现成 `cellType`、现成 `cluster` 或其他外源标签直接覆盖正式 `global_cluster`

## Harmony 参考实现骨架

```python
from __future__ import annotations

import anndata as ad
import harmonypy as hm
import numpy as np
import pandas as pd
import scanpy as sc


def build_global_atlas(dataset_adatas: dict[str, ad.AnnData]) -> ad.AnnData:
    prepared = []
    qc_total_cells = 0

    for dataset_id, adata in dataset_adatas.items():
        x = adata.copy()
        x.obs["dataset_id"] = str(dataset_id)
        x.obs["cell_id"] = x.obs_names.astype(str)
        qc_total_cells += x.n_obs
        prepared.append(x)

    atlas = ad.concat(prepared, join="outer", label="dataset_join", fill_value=0.0)
    atlas.obs["dataset_id"] = atlas.obs["dataset_id"].astype(str)
    safe_write_h5ad(atlas, WORK_DIR / "atlas" / "checkpoints" / "atlas_concat_full.h5ad", compression="gzip")

    sc.pp.normalize_total(atlas, target_sum=1e4)
    sc.pp.log1p(atlas)
    atlas.layers["lognorm"] = atlas.X.copy()

    sc.pp.highly_variable_genes(
        atlas,
        flavor="seurat_v3",
        n_top_genes=4000,
        batch_key="dataset_id",
        subset=True,
    )
    sc.tl.pca(atlas, n_comps=50, svd_solver="arpack")
    safe_write_h5ad(atlas, WORK_DIR / "atlas" / "checkpoints" / "atlas_post_hvg_pca.h5ad", compression="gzip")

    ho = hm.run_harmony(atlas.obsm["X_pca"], atlas.obs, "dataset_id")
    z_corr = np.asarray(ho.Z_corr)
    if z_corr.shape[0] == atlas.n_obs:
        corrected = z_corr
    elif z_corr.shape[1] == atlas.n_obs:
        corrected = z_corr.T
    else:
        raise RuntimeError("ERROR: harmony_embedding_shape_mismatch")

    atlas.obsm["X_pca_harmony"] = corrected
    safe_write_h5ad(atlas, WORK_DIR / "atlas" / "checkpoints" / "atlas_post_harmony.h5ad", compression="gzip")
    sc.pp.neighbors(atlas, use_rep="X_pca_harmony", n_neighbors=30)
    safe_write_h5ad(atlas, WORK_DIR / "atlas" / "checkpoints" / "atlas_post_neighbors.h5ad", compression="gzip")
    sc.tl.umap(atlas, min_dist=0.3, maxiter=60)
    sc.tl.leiden(atlas, resolution=1.2, key_added="global_cluster")

    if atlas.n_obs != qc_total_cells:
        raise RuntimeError("ERROR: atlas_cell_count_mismatch")
    return atlas
```

## 整合诊断必须记录的字段

`global_atlas_integration_diagnostics.tsv` 至少包含：

| 字段 | 含义 |
|---|---|
| `integration_method` | 必须为 `harmony` |
| `qc_total_cells` | Section 1 QC 后总细胞数 |
| `atlas_input_cells` | 实际进入 atlas 的细胞数 |
| `harmony_embedding_shape` | Harmony 输出矩阵维度 |
| `batch_key_dtype` | `dataset_id` 的 dtype |
| `used_full_data` | 必须为 `True` |
| `checkpoint_reused` | 是否命中 atlas checkpoint |
| `checkpoint_invalidated_reason` | cache 失效原因，若无则为空 |
| `integration_failed_reason` | 失败时的错误原因 |

## 失败即阻断的条件

出现以下任一情况都必须立即停止：
- 日志中出现 `sketch`、`subsample`、`max_cells`
- `atlas_input_cells != qc_total_cells`
- `dataset_id` 不是纯字符串
- `X_pca_harmony.shape[0] != atlas.n_obs`
- Harmony 报错后试图切换到 `scVI`、`BBKNN` 或未校正 PCA

## 强制作图

| 图名 | 目的 |
|---|---|
| `Fig_S2_Global_UMAP` | 全局 atlas 三联图：按 `dataset_id`、按 `Major_CellType`、按 `Fibroblast Cell_Subtype` |
| `Fig_S2b_Harmony_batch_mixing_diagnostic` | 展示 batch mixing 与整合效果 |
| `Fig_S3_Global_Dotplot` | 展示关键 marker 在主要细胞群/亚型中的表达模式 |

`Fig_S2_Global_UMAP` 的正式布局必须满足：
- panel 1：全部细胞，按 `dataset_id`
- panel 2：全部细胞，按 `Major_CellType`
- panel 3：全部细胞共用同一 UMAP 坐标，只高亮 `Major_CellType == Fibroblast` 的 `Cell_Subtype`；非 Fibroblast 细胞统一浅灰显示
- 不得再把“全体细胞按所有 `Cell_Subtype`”当作正式 `Fig_S2` 的 panel 2 或 panel 3

兼容说明：
- Section 3 可额外交付一个肿瘤感知注释补充图组，内部 panel 可按 Step 1 / 3 / 4 / 5 / 6 标记为 `S2a-e`
- 该补充图组不得替代正式 `Fig_S2_Global_UMAP`
- 该补充图组也不得覆盖本 Section 已保留的 `Fig_S2b_Harmony_batch_mixing_diagnostic`

每张图都必须同步交付：`pdf`、`png`、`*_source_data.tsv`、`*_caption.md`

## Deliverables

| 交付物 | 路径 |
|---|---|
| 全局融合对象 | `work/atlas/merged.h5ad` |
| atlas checkpoint | `work/atlas/checkpoints/` |
| checkpoint 清单 | `work/atlas/atlas_checkpoint_manifest.tsv` |
| 整合诊断报告 | `work/atlas/global_atlas_integration_diagnostics.tsv` |
| 全局 UMAP | `work/atlas/figures/Fig_S2_Global_UMAP.pdf` + `.png` |
| Harmony mixing diagnostics | `work/atlas/figures/Fig_S2b_Harmony_batch_mixing_diagnostic.pdf` + `.png` |
| 全局 Dotplot | `work/atlas/figures/Fig_S3_Global_Dotplot.pdf` + `.png` |

## 完成检查

- [ ] 全局 atlas 使用了 QC 后全部细胞
- [ ] `integration_method = harmony`
- [ ] `atlas_input_cells == qc_total_cells`
- [ ] `X_pca_harmony.shape[0] == atlas.n_obs`
- [ ] atlas checkpoint 已登记，可安全 resume / retry
- [ ] 正式 `Fig_S2` 为 dataset / major / fibro 三联图
- [ ] `Fig_S2`、`Fig_S2b`、`Fig_S3` 已生成并附带 source data 与 caption
