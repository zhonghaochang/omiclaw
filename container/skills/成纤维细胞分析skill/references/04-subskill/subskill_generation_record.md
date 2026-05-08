# Section 4 Subskill Generation Record

## 生成目的

将原单体 `04-feature-engineering.md` 重组为 Map-Reduce 分块运行子 skill，支持先运行总控与 catalog freeze，再分别运行大类 feature block，最后统一整合交付 Section 5 输入包。

## 读取来源

- `references/04-feature-engineering.md`
- `references/04-prompt.txt`
- `assets/04-section4-flow-explanation.md`
- 用户提供的 V2.0 Map-Reduce 拆分 prompt

## 关键重组决定

1. S4.0-S4.2 拆为总控：preflight、metadata backfill、Research/Data catalog freeze、block dispatch。
2. S4.3-S4.8 拆为可独立运行的 feature block。
3. S4.9-S4.10 拆为依赖 block：只从前序 block 组织 state，不重复计算基础特征；external multiomics 只读取真实 patient-level 表。
4. S4.11-S4.fig 拆为 post-integration：合并 block 输出、全局 gate、全局 response-aware 筛选、Section 5 输入包和图包。
5. 用户 prompt 中的局部 ElasticNet 与全局 LASSO/Boruta 已纳入。当前版本改为二元入场：只有 `raw_biological_numeric` 可入漏斗；`response_derived/qc_only` 禁止入场。所有 response-aware 筛选结果均标记 `response_aware=True` 和 `requires_trainfold_recompute=True`。

## 冲突处理

- 固定路径、hash、环境、数据库、输入 run 和禁止事项以原 skill / 原 prompt 为准。
- 原 skill 的四类预分层已废弃，替换为 `raw_biological_numeric` 入场、`response_derived/qc_only` 禁止入场。
- DE-GSEA/ORA、differential LR、univariate screen 的 response-derived 解释性定位保留。
- V2.0 prompt 的 Map-Reduce 结构、块内局部自净和全局 funnel 作为分块组织增强。

## 新增文件

- `00-subskill-index.md`
- `01-orchestrator-preflight-catalog.md`
- `02-block-composition-ratio-diversity.md`
- `03-block-pathway-program.md`
- `04-block-tf-regulon.md`
- `05-block-de-gsea-ora.md`
- `06-block-cell-communication.md`
- `07-block-pseudobulk-hvg-module.md`
- `08-block-state-multiomics.md`
- `09-post-integration-screen-delivery.md`
- `04-mapreduce-run-prompt.txt`
- `subskill_generation_record.md`

## 待 QC 项

- 文件均位于 `references/04-subskill/`。
- 原 `04-feature-engineering.md` 和 `04-prompt.txt` 未修改。
- 每个 block 有 Block ID、输入、计算规则、局部自净、输出和 process index 要求。
- 固定环境与本地数据库约束已覆盖。
- all/major/subtype/major_pair/subtype_pair 层级已覆盖。
- response-aware 筛选的防泄漏标记已覆盖。

## QC 结果

- 新增 operational subskill/prompt 文件 11 个，记录文件 1 个，manifest 1 个。
- 原 `04-feature-engineering.md` sha256 保持为 `a83ece79083d8ca3d20c0aba96ef37ec9ed11313ea362cbb43c7a82ff0bef909`。
- 原 `04-prompt.txt` sha256 保持为 `1f30c573867edcc5ec7744ee327f40daa825c54905ecf0b407b11a933955a58c`。
- `SUBSKILL_MANIFEST.tsv` 已记录 11 个 operational 文件的行数和 sha256；为避免自引用，不记录 manifest 自身和本 generation record 的 hash。
- 关键词检查已覆盖：`all/major/subtype`、`major_pair`、`subtype_pair`、`ElasticNet`、`LASSO`、`Boruta`、`response_aware`、`requires_trainfold_recompute`。
- 固定环境检查已覆盖：`omiclaw-r-upstream-lite`、`section4-python`、`section4-sccoda`、`pyscenic`、`assets/dataset`、`transcriptome_feature.tsv`。
- 运行边界检查已覆盖：只运行 Section 4，不重跑 Section 1/2/3，不执行 Section 5/6/7，不训练 Section 5 模型。
- 科学性处理：块内宽松单因素 gate + ElasticNet、块外严格 LASSO + Boruta 已纳入；所有 response-aware 候选均 trainfold-required，避免全数据 response 筛选泄漏。

## 2026-04-30 输出结构优化

- 新增 `00-output-structure-contract.md`，统一规定每个模块主输出目录为 `<run_dir>/work/features/<module>/`。
- 所有 block 均增加模块目录主输出：`<module>_summary.tsv/md`、manifest、matrix、meta、QC、gate、screen、candidate、issue。
- 原 skill 的兼容输出路径继续保留；模块目录作为分块运行主接口，兼容路径作为下游既有接口。
- post-integration 被要求优先读取模块目录；若使用旧兼容路径 fallback，必须写入 `work/features/integration/input_structure_reconciliation.tsv`。
- `05-block-de-gsea-ora.md` 是唯一不产生 raw 入场候选的 block；原因是该 block 全部输出均为 `response_derived`，不产生建模候选。


## 2026-04-30 Composition Debug Prompt QC

- 新增 `02-composition-prompt.txt`，用于只运行 S4.0-S4.2、S4.3 composition 和 composition-only S4.11-S4.13 后处理。
- 在 prompt 中补充硬规则：`00-subskill-index.md` 只作为 global/naming/output contract 读取，不得根据推荐运行顺序自动调度未列入 prompt 的 block。
- 在 `01-orchestrator-preflight-catalog.md` 中补充 debug dispatch override：`composition_only_debug` 模式下 `block_dispatch_manifest.tsv` 只能把 `S4B_COMPOSITION_RATIO_DIVERSITY` 标为 required/runnable，其他模块标记 `not_required_debug_excluded` 或 `not_run_debug_excluded`。
- 在 `09-post-integration-screen-delivery.md` 中补充 `Composition Debug Override`：`composition_only_debug` 模式下唯一 required feature block 是 `S4B_COMPOSITION_RATIO_DIVERSITY`，其他模块缺失必须标记 `not_run_debug_excluded`，不得触发 fatal。
- 已确认非 composition 图在 debug 模式下只能输出 blocked/not_run_debug_excluded caption 和 source manifest 记录。
