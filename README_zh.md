# OmiClaw

OmiClaw 是一个面向单细胞转录组分析的 AI 助手。它保留了 MatClaw 的消息编排、队列、调度和 Web 面板结构，但不再依赖 Docker，而是直接在这台服务器上使用标准 Conda 环境运行 agent。

## 运行时

- 项目目录：`/vepfs-mlp2/mlp-public/250266/omiclaw`
- Conda 环境：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw`
- 默认助手名：`OmiClaw`
- 默认触发词：`@OmiClaw`

## 主要能力

- 单细胞数据加载与格式转换
- 质控、去环境 RNA、归一化、高变基因、降维
- Harmony、Scanorama、scVI 批次整合
- Leiden 聚类与细胞类型注释
- 差异表达与 pseudobulk 分析
- CellRank、RNA velocity、扩散拟时序
- 论文级可视化与交互式浏览

## 启动方式

```bash
npm run build
npm run setup
npm run dev
```

`npm run build` 会自动安装并编译 `container/agent-runner`。

## 技能参考

技能清单见 `docs/materials-compute-skills.md`，其内容已经改为 OmiClaw 的单细胞技能目录。
