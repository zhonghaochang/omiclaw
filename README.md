# OmiClaw

OmiClaw is a host-native AI assistant for single-cell transcriptomics workflows. It keeps the MatClaw orchestration architecture, but runs agent jobs directly on this server inside a standard Conda environment instead of Docker.

## Runtime

- Project path: `/vepfs-mlp2/mlp-public/250266/omiclaw`
- Conda environment: `/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw`
- Default assistant name: `OmiClaw`
- Default trigger: `@OmiClaw`

## Main Capabilities

- Data loading and format conversion for common single-cell inputs
- QC, ambient RNA removal, normalization, HVG selection, dimensionality reduction
- Batch integration with Harmony, Scanorama, and scVI
- Leiden clustering and annotation workflows
- Differential expression and pseudobulk analysis
- Trajectory analysis with CellRank, RNA velocity, and diffusion pseudotime
- Publication-ready and interactive visualization

## Setup

```bash
npm run build
npm run setup
npm run dev
```

`npm run build` also installs and builds `container/agent-runner`.

## Skills Reference

See `docs/materials-compute-skills.md` for the OmiClaw single-cell skill inventory.
