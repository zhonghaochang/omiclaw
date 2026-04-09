---
name: 08-figure-standards
description: 成纤维细胞分析 skill 的正式作图标准。约束 Nature 风格尺寸、字体、导出格式、源数据与图注交付。
type: reference
---

# 正式作图标准

当任务需要输出正式图包时，必须读取本文件。

## 参考标准

- Nature Research figure guide: `https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/`
- Nature final artwork guide: `https://www.nature.com/documents/NRJs-guide-to-preparing-final-artwork.pdf`

本 skill 采用以上官方指南的通用要求，不跟随某个子刊的特殊例外。

## 图稿规格

- 单栏宽：`88 mm`
- 双栏宽：`180 mm`
- 字体：`Arial` 或 `Helvetica`
- 正文最小字号：`5 pt`
- 正文最大字号：`7 pt`
- 文本必须保持可编辑；禁止 outline
- 颜色空间：`RGB`
- raster 位图面板：`>= 450 dpi`
- 线图、条形图、散点图、dotplot 优先导出为向量
- 使用色盲友好调色板
- 所有轴必须有 tick、label、单位

## Matplotlib 默认值

```python
import matplotlib
matplotlib.use("Agg")

from matplotlib import rcParams
rcParams["pdf.fonttype"] = 42
rcParams["ps.fonttype"] = 42
rcParams["font.family"] = ["Arial", "Helvetica", "sans-serif"]
rcParams["figure.facecolor"] = "white"
rcParams["axes.spines.top"] = False
rcParams["axes.spines.right"] = False
```

## 每张正式图的最低交付

同名图必须同时存在：
- `*.pdf`
- `*.png`
- `*_source_data.tsv`
- `*_caption.md`

并且必须被登记到：
- `work/figures/index.tsv`
- `work/figures/README.md`

## Fig_S2_Global_UMAP 专项规范

`Fig_S2_Global_UMAP` 是本 skill 的固定三联图，必须使用同一套全局 UMAP 坐标，按以下顺序排布：

1. `UMAP by dataset`
2. `UMAP by Major_CellType`
3. `UMAP by Fibroblast Cell_Subtype`

细则：
- panel 3 只高亮 `Major_CellType == Fibroblast` 的细胞亚型
- 非 Fibroblast 细胞在 panel 3 中必须统一浅灰显示，而不是删除
- 正式 `Fig_S2` 不再接受“全体细胞按所有细粒度 `Cell_Subtype`”作为替代 panel
- `Fig_S2` 的 source data 至少包含：`UMAP1`, `UMAP2`, `dataset_id`, `Major_CellType`, `Cell_Subtype`, `is_fibro`, `focal_panel_label`
- 若 Fibroblast 二层亚型未完成或 unresolved 过高，必须阻断正式 `Fig_S2`，不得回退为简化版

## Section 3 肿瘤感知注释补充图组

当 Section 3 启用肿瘤感知注释主流程时，除固定三联 `Fig_S2_Global_UMAP` 外，建议额外交付一个补充图组，推荐文件级 artifact 名称为：

- `Fig_S2_Annotation_Companion`

其内部 panel 可按以下顺序标注 `a-e`：

1. Step 1：全局 coarse compartment UMAP
2. Step 3：immune/stroma major class UMAP
3. Step 4：immune subset 细分 UMAP
4. Step 5：stroma subset 细分 UMAP
5. Step 6：最终全局 + tumor/epithelial UMAP

兼容要求：
- `Fig_S2_Global_UMAP` 与 `Fig_S2b_Harmony_batch_mixing_diagnostic` 仍是保留 artifact，不得被替代或覆盖
- 若项目必须拆成多个单文件，可使用：
  - `Fig_S2a_Global_Coarse_UMAP`
  - `Fig_S2b_Major_Class_UMAP`
  - `Fig_S2c_Immune_Subset_UMAP`
  - `Fig_S2d_Stroma_Subset_UMAP`
  - `Fig_S2e_Final_Global_Tumor_UMAP`
- 即使采用拆分文件，上述新文件也不得覆盖 `Fig_S2b_Harmony_batch_mixing_diagnostic`
- 补充图组与正式 `Fig_S2` 一样，必须同步交付 `pdf`、`png`、`*_source_data.tsv`、`*_caption.md`
- 补充图组的 source data 至少包含：`UMAP1`, `UMAP2`, `cell_id`, `dataset_id`, `TopLevel_Compartment`, `Major_CellType`, `Cell_Subtype`, `Annotation_Method`, `panel_label`

## 文案与证据等级绑定

- 若模型为 `weak_evidence`，图注不得使用强机制性措辞
- 若机制验证为 `blocked`，应输出诊断图，而不是伪造小提琴图
- 若关键亚型 unresolved，图注必须直说，不得把缺失解读成生物学 absence

## 图包验收底线

最终图包至少应满足：
- 存在 `main/` 与 `supplementary/` 子目录
- `figures/index.tsv` 可映射到每张图的 `pdf/png/source_data/caption`
- `figures/README.md` 解释图命名和目录结构
- 每张图都能追溯到对应 stage 的 source data
