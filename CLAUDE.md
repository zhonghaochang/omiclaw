# OmiClaw

## About

Single-cell transcriptomics AI assistant powered by local agent runners and a host Conda environment.

## Architecture

Single Node.js process with Feishu, Web, and optional chat channels. Messages are routed to a local agent runner process on the same server. Python tooling comes from `/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw`.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main orchestrator and message loop |
| `src/container-runner.ts` | Host-mode agent launcher with Conda PATH injection |
| `src/container-runtime.ts` | Runtime validation for local Conda execution |
| `container/agent-runner/` | Claude/Codex SDK runner invoked by the host |
| `container/skills/` | Single-cell and utility skill guides |
| `groups/{name}/CLAUDE.md` | Per-group memory and instructions |

## Skills

Single-cell workflows live in:
- `container/skills/omics-compute`
- `container/skills/data-loading`
- `container/skills/preprocessing`
- `container/skills/integration`
- `container/skills/clustering-annotation`
- `container/skills/differential-expression`
- `container/skills/trajectory`
- `container/skills/visualization`

Utility skills remain in:
- `container/skills/agent-browser`
- `container/skills/general-tools`

## Development

```bash
npm run build
npm run dev
npm run setup
```

The build installs and compiles `container/agent-runner` automatically.
