# OmiClaw Skills Reference

This document now tracks the OmiClaw single-cell skill inventory.

## Core Single-Cell Skills

- `成纤维细胞分析skill` — environment overview, package map, fibro/ICB workflow entry point
- `data-loading` — 10x, public datasets, format conversion
- `preprocessing` — QC, ambient RNA, normalization, HVG, dimensionality reduction, doublet detection
- `integration` — Harmony, Scanorama, scVI, scIB-style evaluation
- `clustering-annotation` — Leiden clustering, auto annotation, manual annotation
- `differential-expression` — pseudobulk DE, gene set enrichment, compositional analysis
- `trajectory` — CellRank, RNA velocity, diffusion pseudotime
- `visualization` — publication plots, interactive browsers

## Utility Skills

- `agent-browser` — web browsing and extraction
- `general-tools` — plotting, documents, spreadsheets, statistical helpers

## Environment Rules

- Prefer `python` and `python3` from the active Conda PATH
- When an absolute interpreter is needed, use `${CONDA_ENV_PATH}/bin/python`
- Do not hardcode deprecated Conda prefixes; always use `CONDA_ENV_PATH`
