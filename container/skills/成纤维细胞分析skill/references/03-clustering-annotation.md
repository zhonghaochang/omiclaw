---
name: 03-clustering-annotation
description: Section 3：双层聚类与标签下放。在全局图谱上进行大类粗分与舱室内二次精聚类，赋予亚型标签后回传各原始数据集，并进行覆盖率审计。
type: reference
---

# Section 3：双层聚类与标签下放

## 概述

| 项 | 说明 |
|---|---|
| **读入** | Section 2 的全局融合 `merged.h5ad`，大类基因表 `celltype.xlsx`，亚型基因表 `subtype.xlsx` |
| **处理** | 聚类 → 按标志基因集大类粗分 → 提取成纤维细胞、T细胞等舱室独立做二次高分辨率聚类 → 利用亚型基因集赋予精准标签 → 标签回传原始数据集（强制依赖 Barcode + `dataset_id` 做 `pd.merge`） |
| **输出** | 更新了 `Cell_Subtype` 标签的独立 `.h5ad` + 亚型覆盖率审计报告 + Fig_S2 + Fig_S3 |

**前置依赖**：Section 2 完成

## 两层聚类策略

1. **第一层（全局粗分）**：在全局 atlas 的高分辨率 leiden 聚类上，利用大类 marker 基因集划分主要舱室（Fibroblast、T/NK、Myeloid/DC、B/Plasma、Epithelial/Tumor、Mast 等）
2. **第二层（舱室内精分）**：提取每个主要舱室的细胞，在舱室内部重新做高分辨率聚类，利用亚型基因集赋予 iCAF、myoCAF、apCAF、NKcyto、mregDC 等精准标签

`raw_label` 的字符串匹配只允许用于 major cell type 的粗分标准化，不得直接作为细粒度亚型的最终来源。

## 细胞类型注释参考（Marker 基因集）

### 成纤维细胞亚型

| 亚型 | 关键标志基因 | 功能 |
|---|---|---|
| 一般成纤维细胞 | PDGFRA、DCN、LUM、COL1A1、COL3A1 | 结构支撑 |
| myoCAF | ACTA2、NDUFA4L2、MYL9、MYLK | 结构重塑；物理屏障 |
| iCAF | IL6、CXCL12、DPT、CXCL14、C3、CFD、APOD、FBLN1、PTGDS、GSN | 免疫抑制趋化因子；ICB 耐药 |
| apCAF | HLA-DRA、HLA-DQB1、CD74、SLPI、HLA-DPA1、HLA-DQA1 | MHC II 抗原呈递 |
| 增殖成纤维细胞 | MKI67、TOP2A | 活跃增殖 |

### T 细胞亚型

| 亚型 | 关键标志基因 | 功能 |
|---|---|---|
| CD8 效应/杀伤 | CD8A、GZMB、IFNG、PRF1 | 肿瘤杀伤 |
| TCF7+ CD8 干性 | CD8A、TCF7、SELL | 自我更新；ICB 应答标志 |
| 耗竭 CD8 | CD8A、TOX、PDCD1、TIGIT、HAVCR2 | 功能失调 |
| CD4 辅助 | CD4、CD40LG | 免疫协调 |
| Treg | CD4、FOXP3、IL2RA | 免疫抑制 |

### NK 细胞亚型

| 亚型 | 关键标志基因 | 功能 |
|---|---|---|
| NKrest | GZMK、XCL1、XCL2、IL7R、SELL、KLRC1 | 相对低杀伤；迁移/募集 |
| NKcyto | NKG7、GNLY、PRF1、FGFBP2、FCGR3A、GZMB、GZMH | 经典固有免疫杀伤 |

### 树突状细胞亚型

| 亚型 | 关键标志基因 | 功能 |
|---|---|---|
| cDC1 | XCR1、CLEC9A、BATF3 | 向 CD8 T 细胞交叉呈递抗原 |
| cDC2 | IRF4、CD1C、CLEC4A、FCER1A | 激活 CD4 T 细胞 |
| mregDC | CCR7、LAMP3、PD-L1；XCR1−、CLEC9A−、CD1C− | 应答相关 DC 亚型 |
| pDC | CLEC4C、LILRA4、IL3RA | 干扰素分泌 |

### 髓系细胞亚型

| 亚型 | 关键标志基因 |
|---|---|
| M1 样巨噬细胞 | CD68、HLA-DR、IL6、TNF |
| M2 样巨噬细胞 | CD68、MRC1、CD163、TGFB1 |
| 单核细胞 | CD14、LYZ、S100A8 |

### 其他舱室

| 舱室 | 关键标志基因 |
|---|---|
| B 细胞 | MS4A1（CD20）、CD79A |
| 浆细胞 | MZB1、IGHG1、SDC1 |
| 肥大细胞 | TPSAB1、TPSB2、CPA3、KIT、HDC、MS4A2 |
| 非肿瘤上皮 | EPCAM、KRT8、KRT18、KRT19、CDH1 |
| 肿瘤/恶性 | CNV 信号或组织特异性 marker |
| NK 细胞 | NCAM1（CD56）、KLRD1、NKG7 |

## 参考实现脚本（全局注释）

```python
def annotate_global_clusters(atlas, marker_sets: dict[str, list[str]]):
    for subtype, genes in marker_sets.items():
        valid = [g for g in genes if g in atlas.var_names]
        if len(valid) >= 2:
            sc.tl.score_genes(atlas, gene_list=valid, score_name=f"{subtype}_score", use_raw=False)

    cluster_scores = (
        atlas.obs.groupby("global_cluster")[[c for c in atlas.obs.columns if c.endswith("_score")]]
        .mean()
    )
    cluster_to_subtype = cluster_scores.idxmax(axis=1).str.replace("_score", "", regex=False).to_dict()
    atlas.obs["Cell_Subtype"] = atlas.obs["global_cluster"].map(cluster_to_subtype).astype("category")
    return atlas
```

## 标签下放与注释覆盖审计

全局 atlas 完成后，必须将统一的 `Cell_Subtype` 标签回传给各个独立的原始数据集对象：

```python
def push_labels_back(adata, atlas_labels):
    label_df = atlas_labels[["cell_id", "Cell_Subtype"]].drop_duplicates()
    adata.obs = adata.obs.merge(label_df, left_on="cell_id", right_on="cell_id", how="left")
    return adata
```

**覆盖审计规则：**
- 必须生成 `subtype_continuous_scores_summary.tsv`，包含每个数据集、每个亚型的基因集连续得分均值/中位数/方差
- 如果某亚型离散细胞数 `detected_count < 10`，必须在日志中触发 Fallback，放弃离散分类，全面转向连续打分
- 如果某数据集已检出 major compartment 但细亚型全零，默认记为 `coarse_label_only_or_subclustering_missing`，不直接记为生物学缺失
- 只有在二层 sub-clustering 已完成、marker-based scoring 也近乎无方差、且 major compartment 确实存在的前提下，才允许判定为 `absent_in_tissue`

## 跨队列注释一致性检查

如果不同数据集使用了不同的注释方式：
1. 在 manifest 的 `annotation_method` 字段中记录
2. 对 marker 推断队列，额外验证推断规则的精度
3. 在报告中标注系统偏差风险

## Deliverables（交付物清单）

| 交付物 | 路径 |
|---|---|
| 带标签的独立 .h5ad | `work/annotation/{dataset_id}/` |
| 全局 subtype 字典 | `work/atlas/global_subtype_dictionary.tsv` |
| 全局标签文件 | `work/atlas/global_cell_subtype_labels.tsv.gz` |
| cluster markers | `work/annotation/{dataset_id}/{dataset_id}__cluster_markers.tsv` |
| subtype marker scores | `work/annotation/{dataset_id}/{dataset_id}__subtype_marker_scores.tsv` |
| 覆盖率审计 | `work/annotation/{dataset_id}/{dataset_id}__annotation_coverage_audit.tsv` |
| 连续分数摘要 | `work/annotation/{dataset_id}/{dataset_id}__subtype_continuous_scores_summary.tsv` |
| UMAP 图 | `work/atlas/figures/Fig_S2_Global_UMAP.pdf` |
| Dotplot 图 | `work/atlas/figures/Fig_S3_Global_Dotplot.pdf` |

### 完成检查

- [ ] 所有数据集都有 `Cell_Subtype` 标签
- [ ] cluster_markers.tsv 和 subtype_marker_scores.tsv 非空
- [ ] annotation_coverage_audit.tsv 已输出，零覆盖亚型已标注原因
- [ ] subtype_continuous_scores_summary.tsv 已输出
- [ ] 全局 UMAP 和 Dotplot 已生成

**完成后可暂停并回复用户，提示进入 Section 4。**
