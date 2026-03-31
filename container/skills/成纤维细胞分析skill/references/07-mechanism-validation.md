---
name: 07-mechanism-validation
description: Section 7：独立队列机制反证。在治疗后队列（GSE241934 NSCLC）中验证 Section 6 发现的关键 CAF 特征，完成基线→治疗后的逻辑闭环。
type: reference
---

# Section 7：独立队列机制反证（Post-Treatment Mechanism Validation）

## 概述

| 项 | 说明 |
|---|---|
| **读入** | 治疗后数据集（GSE241934）+ Section 6 找出的"最重要 CAF 罪魁祸首"特征 |
| **处理** | 在肺癌的治疗后样本中，直接对比有效（MPR）和无效（non-MPR）患者的关键 CAF 特征 |
| **输出** | 机制验证小提琴图，完成"基线找出的老大，在治疗后依然是决定生死的关键"这一逻辑闭环 |

**前置依赖**：Section 6 完成

## 科学逻辑

Section 5-6 在基线队列中通过 LODO + SHAP + 消融证明了某些 CAF 特征是预测 R/NR 最重要的因子。但这只说明了"治疗前的 CAF 状态能预测结果"。

Section 7 要回答的问题是：**这些关键特征在一个完全独立的、治疗后的队列中是否仍然与疗效显著相关？**

如果是——"基线找出的老大，在治疗后依然是决定生死的关键"——则建立了完整的因果链闭环。

## 验证队列：GSE241934（NSCLC）

- **IIT 队列**（18 例）：CTONG2104/NEOTIDE 临床试验，EGFR 突变的 NSCLC
  - 应答分类：Immune sensitive / Moderate response / Highly resistant
- **RWC 队列**（34 例）：真实世界队列，多种 PD-1 抗体
  - 应答分类：pCR / MPR / non-MPR

所有样本都是**治疗后手术切除标本**的单细胞测序，这也是它们不能进入基线主模型的原因。

## 处理流程

### Step 1：确认关键特征

从 Section 6 的输出中提取：
- `Table_M5_SHAP_CAF_ranking.tsv` 中排名前 N 的 CAF 特征
- `Fig_M6` 消融实验中 AUC 下降最大的特征类别

### Step 2：在治疗后队列中计算这些特征

1. 读取 GSE241934 的 IIT 和 RWC 的表达矩阵（已在 Section 1 QC'd）
2. 使用 Section 3 的全局注释结果中对应的 `Cell_Subtype` 标签
3. 在 GSE241934 的**原始归一化矩阵**上，独立计算关键 CAF 程序分数（`myoCAF_score`、`iCAF_score` 等）
4. 聚合到患者级

### Step 3：对比 MPR vs non-MPR

对每个关键 CAF 特征：
1. 按 MPR / non-MPR 分组
2. 计算统计显著性（Wilcoxon rank-sum test 或 Mann-Whitney U test）
3. 绘制小提琴图 + 散点叠加，标注 n 值和 p 值

### Step 4：逻辑闭环判定

如果关键 CAF 特征（例如 `myoCAF_score`）在 non-MPR 组中显著高于 MPR 组：
- **闭环成立**："治疗前 myoCAF 高→预测无效"（基线模型）+ "治疗后 myoCAF 仍然高→实际无效"（机制验证）
- 说明 CAF 的免疫抑制作用不仅是基线的预测信号，而且在治疗后仍持续存在

如果不显著：
- 需要讨论可能原因（癌种差异、样本量不足、治疗后微环境重塑等）
- 不得隐瞒阴性结果

## 最终报告结构

分四个模块报告：

**模块一 — 队列设置**
- 每个数据集的病人数量、R:NR 比例
- 癌种和治疗分布
- 排除病人数和原因

**模块二 — 模型性能**
- 每个 LODO fold 的 ROC AUC / PR AUC
- 校准摘要
- near-random fold 标注

**模块三 — 稳定成纤维细胞特征**
- 通过全部四个重要性条件的特征
- 系数方向和量级
- 相对于免疫模型的边际 AUC 贡献

**模块四 — 机制解释**
- iCAF vs myoCAF 平衡及其与应答的关联
- apCAF 与 CD4/Treg 轴
- iCAF–mregDC 互作轴
- NK 细胞毒性状态与应答
- **治疗后队列闭环验证结果**
- 局限性和下一步建议

## 实时进度推送要求

| 推送点 | 最低内容 |
|---|---|
| 任务启动 | 分析计划、预期阶段 |
| 数据加载 + Manifest | 每队列样本数、R:NR 分布 |
| QC 完成 | 每队列保留率 |
| 注释完成 | 检出细胞类型、零覆盖亚型 |
| 特征完成 | 特征总数、门控后通过数 |
| 建模完成 | LODO fold AUC、top 特征 |
| 归因完成 | SHAP top 5、消融 delta、拮抗分析结论 |
| 机制验证完成 | MPR vs non-MPR 的关键统计结果 |
| 最终总结 | 科学结论、效应方向/强度、局限性、下一步 |

**推送原则：**
- 每条推送必须包含具体数字
- 发现异常时立即推送
- 最终推送必须是科学结论，不是文件列表

## Deliverables（交付物清单）

| 交付物 | 路径 |
|---|---|
| 机制验证特征表 | `work/mechanism/GSE241934_mechanism_features.tsv` |
| MPR vs non-MPR 统计表 | `work/mechanism/mechanism_validation_stats.tsv` |
| 机制验证小提琴图 | `work/figures/main/Fig_M8_mechanism_validation_violin.pdf` |
| 最终分析报告 | `work/reports/analysis_summary.md` |
| 方法说明 | `work/reports/methods.md` |
| 图注 | `work/reports/figure_legend.md` |
| 全局过程索引 | `work/process_index.tsv` |

### 完成检查

- [ ] GSE241934 的关键 CAF 特征已在原始矩阵上独立计算
- [ ] MPR vs non-MPR 对比统计已完成（含 p 值）
- [ ] 机制验证小提琴图已生成
- [ ] analysis_summary.md 包含完整科学结论和局限性
- [ ] methods.md 和 figure_legend.md 非占位文本
- [ ] 全部主图（Fig_S2, S3, M4, M5, M6, M7, M8）均已交付

**全部 Section 完成。向用户发送最终科学总结。**
