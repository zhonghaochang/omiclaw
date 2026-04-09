---
name: 07-mechanism-validation
description: Section 7：机制验证。对 GSE241934 的 IIT 与 RWC 分 cohort 检查注释与 patient-level 特征，支持 valid 或 blocked 的机制结论。
type: reference
---

# Section 7：机制验证

## 概述

| 项 | 说明 |
|---|---|
| 读入 | GSE241934 治疗后队列、Section 6 关键 CAF 特征、Section 3 注释结果 |
| 处理 | cohort-level validity check -> patient-level 特征计算 -> MPR vs non-MPR 对比或 blocked 诊断 |
| 输出 | `mechanism_validation_stats.tsv` 或 `mechanism_block_report.tsv`、`Fig_M8` 或 `Fig_M8b`、最终报告 |

**前置依赖**：Section 6 完成

## 核心原则

Section 7 不再默认追求“闭环成立”，而是先判断**能不能做有效机制验证**。

正式规则：
- IIT 和 RWC 先分别评估
- 任一 cohort 的注释失败或关键特征全 NA，就不能直接做 combined inference
- blocked 时必须留下明确诊断，而不是伪造成功统计表

## Cohort-level validity check

对 IIT 与 RWC 分别检查：
- `Cell_Subtype` 是否有效
- `Major_CellType` 是否有效
- patient-level 聚合是否完成
- 关键机制特征是否存在非 NA 值
- unresolved 比例是否过高

若任一检查失败：
- 该 cohort 标记为 `blocked_for_mechanism`
- 写入阻断原因、样本数、缺失特征比例

## 有效时的统计流程

若 cohort 有效，则：
1. 在 GSE241934 的原始归一化矩阵上计算关键 CAF 程序分数
2. 聚合到 patient-level
3. 按 MPR / non-MPR 或等价分类分组
4. 进行 Mann-Whitney U test / Wilcoxon rank-sum test
5. 绘制 violin + jitter，并标注 n 与 p 值

## Blocked 流程

若任一 cohort 无法支持正式比较，则：
- combined inference 必须 blocked
- 输出 `mechanism_block_report.tsv`
- 输出 `Fig_M8b_mechanism_block_diagnostic`
- `analysis_summary.md` 必须写明 blocked 原因，不能把 blocked 包装成阴性结果

## 最终报告要求

`analysis_summary.md`、`methods.md`、`figure_legend.md` 必须支持三种状态：
- `valid`
- `weak_evidence`
- `blocked`

其中 Section 7 至少要把以下内容说清楚：
- 哪些 cohort 有效
- 哪些 cohort blocked
- blocked 的具体原因
- 若做了统计，效应方向与显著性如何

## 强制作图

| 图名 | 目的 |
|---|---|
| `Fig_M8_mechanism_validation_violin` | 有效时展示关键 CAF 特征在 MPR vs non-MPR 的分布 |
| `Fig_M8b_mechanism_block_diagnostic` | blocked 时展示 cohort 可用样本数、缺失特征比例、注释失败原因 |

每张图都必须同步交付：`pdf`、`png`、`*_source_data.tsv`、`*_caption.md`

## Deliverables

| 交付物 | 路径 |
|---|---|
| 机制特征表 | `work/mechanism/GSE241934_mechanism_features.tsv` |
| 机制统计表 | `work/mechanism/mechanism_validation_stats.tsv` |
| blocked 报告 | `work/mechanism/mechanism_block_report.tsv` |
| 机制验证图 | `work/figures/main/Fig_M8_mechanism_validation_violin.pdf` |
| blocked 诊断图 | `work/figures/main/Fig_M8b_mechanism_block_diagnostic.pdf` |
| 最终分析报告 | `work/reports/analysis_summary.md` |
| 方法说明 | `work/reports/methods.md` |
| 图注 | `work/reports/figure_legend.md` |
| 全局过程索引 | `work/process_index.tsv` |

## 完成检查

- [ ] IIT 与 RWC 都已做 validity check
- [ ] 若任一 cohort blocked，已生成 `mechanism_block_report.tsv`
- [ ] 若做了统计，patient-level 特征已在原始矩阵上独立计算
- [ ] `Fig_M8` 或 `Fig_M8b` 至少其一已生成
- [ ] `analysis_summary.md`、`methods.md`、`figure_legend.md` 不是占位文本
