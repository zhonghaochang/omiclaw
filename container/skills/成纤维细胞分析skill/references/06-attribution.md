---
name: 06-attribution
description: Section 6：核心归因——CAF"一票否决权"的量化判定。三步连环证法：SHAP 全局霸榜、边际 AUC 消融、双变量拮抗分析。
type: reference
---

# Section 6：核心归因——CAF"一票否决权"的量化判定

## 概述

| 项 | 说明 |
|---|---|
| **读入** | Section 5 的全模型及权重 |
| **处理** | 三步连环证法：SHAP 全局霸榜 → 边际 AUC 消融 → 双变量拮抗分析 |
| **输出** | SHAP 图、消融柱状图、拮抗散点图、排序表格 |

**前置依赖**：Section 5 完成

## 多视角稳定性要求

一个特征只有在满足以下全部四个条件时才能被报告为重要：

| 条件 | 评估方法 |
|---|---|
| 方向和量级 | 逻辑回归系数的符号和绝对值 |
| 在 held-out 数据上的泛化 | 测试集排列置换重要性 |
| 非线性确认 | SHAP 值或树模型特征重要性 |
| 重采样稳定性 | 重复交叉验证各 fold 中方向一致且秩稳定 |

不得基于单一方法就报告特征重要性。

## 跨舱室的相对重要性

成纤维细胞专属模型无法建立成纤维细胞的重要性。正确分析需要三个模型：

| 模型 | 特征范围 |
|---|---|
| 全模型 | 全部四层（CAF + T + 髓系/DC + NK + 肥大 + 上皮 + B/浆） |
| 成纤维细胞消融模型 | 仅 CAF 相关特征 |
| 免疫消融模型 | 仅非 CAF 免疫特征 |

## Step 1：SHAP 全局霸榜测试

计算所有患者特征的 SHAP 值（特征对模型输出的推拉贡献度）。

**执行：**
1. 在全模型（Section 5 的 LODO 模型）上，用 `shap.LinearExplainer` 或 `shap.KernelExplainer` 计算每个病人每个特征的 SHAP 值
2. 按 `|SHAP|` 均值排序所有特征
3. 提取所有 CAF 相关特征的 SHAP 值单独排序

**输出：**
- `Fig_M4`：全局 SHAP Beeswarm Plot — 展示所有特征对 R/NR 预测的推拉效应
- `Fig_M5`：CAFs SHAP Beeswarm Plot — 展示 CAF 各特征的推拉效应
- `Table_M4`：全局 SHAP 排序表格（feature_name, mean_abs_shap, direction）
- `Table_M5`：CAFs SHAP 排序表格

## Step 2：边际贡献消融实验（Marginal AUC Ablation）

通过系统性地扣除特征集并重建模型，量化每个舱室对预测的不可替代贡献。

**消融模型矩阵：**

| 模型名称 | 操作 | 目的 |
|---|---|---|
| Full Model | 全部特征 | 基准 AUC |
| Drop-Fibro | 移除**所有 CAF 特征** | 量化 CAF 整体边际贡献 |
| Drop-Fibro-myoCAF | 移除所有 myoCAF 特征 | 量化 myoCAF 亚群贡献 |
| Drop-Fibro-iCAF | 移除所有 iCAF 特征 | 量化 iCAF 亚群贡献 |
| Drop-Fibro-apCAF | 移除所有 apCAF 特征 | 量化 apCAF 亚群贡献 |
| Drop-Immune | 移除**所有非 CAF 免疫特征** | 量化免疫整体贡献 |
| Drop-Tcell | 移除所有 T 细胞特征 | 量化 T 细胞贡献 |
| Drop-NK | 移除所有 NK 特征 | 量化 NK 贡献 |
| Drop-Myeloid | 移除所有髓系/DC 特征 | 量化髓系贡献 |
| Drop-Treg | 移除所有 Treg 特征 | 量化 Treg 贡献 |
| Drop-CD8 | 移除所有 CD8 特征 | 量化 CD8 贡献 |

**每个消融模型都必须：**
- 在扣除后的特征集上**重新构建 design matrix**
- **重新执行完整 LODO**（不得沿用 full-model 的 AUC）
- 落地 `sensitivity/<model_name>__fold_metrics.tsv` 与 `sensitivity/<model_name>__heldout_predictions.tsv`

**判定标准：**

$$\Delta\text{AUC}_{\text{Fibro}} = \text{AUC}_{\text{Full}} - \text{AUC}_{\text{Drop-Fibro}}$$

**如果 $\Delta\text{AUC}_{\text{Fibro}}$ 远大于 $\Delta\text{AUC}_{\text{Drop-Immune}}$、$\Delta\text{AUC}_{\text{Drop-Tcell}}$、$\Delta\text{AUC}_{\text{Drop-NK}}$ 等，这就在统计学上"实锤"了 CAF 是整个系统最大的瓶颈。**

**输出：**
- `Fig_M6`：边际 AUC 消融柱状图——清晰对比 Full AUC vs 各 Drop-X 模型 AUC
- 消融结果汇总表

## Step 3：双变量拮抗分析（Bivariate Antagonism Analysis）

证明 CAF 对免疫治疗疗效具有"一票否决权"——即使在免疫浸润充足的"热肿瘤"患者中，高 CAF 屏障仍导致治疗失败。

**执行：**
1. 提取经典热肿瘤特征（CD8 浸润度 / cytotoxic_score / PD-1 表达量）作为 X 轴
2. 提取 CAF 屏障特征（myoCAF_score / myoCAF_to_CD8_score_ratio）作为 Y 轴
3. 绘制二维散点图，每个点是一个病人，颜色区分 Response vs Non-Response
4. 观察四象限分布

**判定标准：**

如果在**右上象限**（CD8 高 + myoCAF 高）中，Non-Response 病人占多数——这证明即使在 CD8 极高（本该有效）的患者中，只要 myoCAF 也很高，结果依然是 Non-Response。**CAF 拥有"一票否决权"。**

**输出：**
- `Fig_M7`：传统热肿瘤特征 vs myoCAF 疗效二维分布图

## 直接文献支持组合

| 组合 | 证据来源 | 测试方式 |
|---|---|---|
| mregDC 比例 + TCF7+ CD8 | Yang 2025（GSE269936） | 乘积、比值、加性项 |
| iCAF 评分 × mregDC 比例 | Yang 2025 CCL19/CCL21–CCR7 轴 | 乘积特征 |
| treg_frac + exhausted_cd8_frac | 经典淋巴系免疫抑制 | 乘积、加性项 |
| nkcyto_score / treg_suppressive_score | 固有免疫 vs 抑制平衡 | 比值 |

## Deliverables（交付物清单）

| 交付物 | 路径 |
|---|---|
| 全局 SHAP Beeswarm | `work/figures/main/Fig_M4_SHAP_global_beeswarm.pdf` |
| CAFs SHAP Beeswarm | `work/figures/main/Fig_M5_SHAP_CAF_beeswarm.pdf` |
| 全局 SHAP 排序表 | `work/modeling/{run_id}/Table_M4_SHAP_global_ranking.tsv` |
| CAFs SHAP 排序表 | `work/modeling/{run_id}/Table_M5_SHAP_CAF_ranking.tsv` |
| 边际 AUC 消融柱状图 | `work/figures/main/Fig_M6_ablation_barplot.pdf` |
| 拮抗分析散点图 | `work/figures/main/Fig_M7_bivariate_antagonism.pdf` |
| 各消融模型 LODO 明细 | `work/modeling/{run_id}/sensitivity/Drop-*__fold_metrics.tsv` |

### 完成检查

- [ ] SHAP 值已计算，Fig_M4 和 Fig_M5 已生成
- [ ] 所有消融模型已重建 design matrix 并重跑 LODO
- [ ] Fig_M6 消融柱状图能清晰对比各 Drop 模型的 AUC
- [ ] Fig_M7 双变量散点图已绘制，四象限可辨
- [ ] Table_M4 和 Table_M5 已输出

**完成后可暂停并回复用户，提示进入 Section 7。**
