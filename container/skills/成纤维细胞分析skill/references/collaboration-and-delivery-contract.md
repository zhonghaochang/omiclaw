# Shared Collaboration and Delivery Contract

This reference is the shared collaboration, progress-reporting, traceability, anomaly-reporting, and figure-delivery contract for `成纤维细胞分析skill`.

Use this file whenever a task is:
- longer than 30 seconds
- expected to generate structured result directories
- expected to produce formal figures rather than ad hoc screenshots
- executed in a repository that primarily relies on `成纤维细胞分析skill`

## Single-Skill Mode

Treat `成纤维细胞分析skill/SKILL.md` as the root environment guide.

In single-skill mode:
- use `SKILL.md` for workflow, environment, package availability, and stage order
- use `00-07` for stage-specific rules
- use `08-figure-standards.md` for formal figure specs

## Real-Time Progress Reporting

For any analysis that takes more than 30 seconds, you must send real-time progress updates.

Minimum rules:
- send a plan message before starting multi-step work
- send a checkpoint after each major stage with specific numbers
- send anomaly alerts immediately when issues are discovered
- never go silent for more than 60 seconds during a long run
- send a final summary with scientific conclusions, not just file paths
- do not stop a still-progressing computation merely to satisfy the 60-second reporting rule; send the update before the long step or during log-based monitoring

## Mandatory Checkpoints

| Seq | Timing | Must include |
|---|---|---|
| 0 | task start | analysis plan, expected stages, whether strict mode is active |
| 1 | before main script | script path, whether regenerated or patched, script hash, compliance result, run directory hygiene result |
| 2 | after data loading | per-cohort sample counts, R/NR distribution |
| 3 | after manifest validation | main-analysis patient count, `analysis_unit` check, source id completeness, exclusions and reasons |
| 4 | after QC | retained cell counts and filter fractions per dataset |
| 5 | after atlas | `qc_total_cells`, `atlas_input_cells`, `harmony_embedding_shape`, checkpoint hit/miss, invalidated cache reason, full-data confirmation, `Fig_S2` three-panel readiness |
| 6 | after annotation | detected major cell types, second-layer clustering status, unresolved summary, schema repair result |
| 7 | after feature construction | total features, passed features, removed features, metadata backfill coverage, manifest rows vs feature rows |
| 8 | after communication | tool used or blocked reason, whether result is real communication or blocked diagnostics |
| 9 | after modeling | per-fold AUC, near-random folds, top features, whether any forbidden meta/route/count features remain |
| 10 | after attribution | evidence grade, SHAP top features, ablation findings, whether strong claims are allowed |
| 11 | after mechanism validation | valid vs blocked, per-cohort usable samples, key stats or block reasons |
| 12 | after figure generation | figure paths, figure classes covered, whether pdf/png/source_data/caption/index are complete |
| 13 | final summary | scientific conclusion, effect direction/strength, limitations, recommended next step |

## Anomaly Taxonomy

The following anomalies must be reported immediately when they occur:
- `missing_manifest_metadata_in_cached_annotation`
- `late_route_merge_suffix_conflict`
- `atlas_cell_count_mismatch`
- `atlas_checkpoint_invalidated`
- `atlas_shortcut_parameters_forbidden`
- `mechanism_annotation_blocked`
- `forbidden_primary_feature`
- `modeling_coverage_mismatch`
- `incomplete_manifest_backfill`
- `weak_evidence`

## Message Content Rules

- Messages must contain numbers and specific findings
- Do not hide anomalies until the final message
- Final summaries must contain interpretation, not only file paths
- If a fold is near-random, if a mechanism cohort is blocked, or if unresolved fractions are high, say so explicitly
- If modeled rows shrink relative to `manifest.tsv`, say so explicitly and report per-dataset attrition
- If `primary_feature_audit.tsv` is missing or disagrees with `features_used.tsv`, report that as a modeling failure
- If `methods.md` / `figure_legend.md` are placeholder-like, do not present delivery as complete

## Watchdog and Fallback Policy

For any run expected to exceed 60 seconds:
- use host-managed `start_job` for the primary long-running script whenever possible
- do not rely on `nohup`, `setsid`, shell `&`, or parent-query-bound foreground processes as the formal execution path
- for very large single-cell runs, long wall-clock time alone is not evidence of a stall
- if `start_job` is temporarily unavailable but the active foreground run still shows progress, keep monitoring that run rather than interrupting and restarting it
- a runtime stall must be evidenced, not guessed; at minimum inspect logs plus process state before deciding a run is blocked
- for 200k+ cell atlas / compartment jobs, allow multi-hour clustering / Leiden / marker phases and use progress evidence, not impatience, to decide whether to continue
- treat ad hoc shell backgrounding only as emergency debugging, not as a delivery mechanism

watchdog is allowed to:
- monitor
- detect failure or stalling
- restart
- record audit evidence

watchdog is not allowed to:
- generate fallback “success” artifacts
- mark blocked stages as completed
- replace real outputs with synthetic placeholders
- interrupt and restart a long-running analysis solely because it has been running for “too long” while progress evidence still exists

`stage6_fallback_mechanism.py` and `stage7_fallback_finalize.py` may remain for audit or debugging, but they must not be part of the formal success path.

## File Storage

Default output root is `/workspace/group/` on the data disk.

Recommended layout:

```text
/workspace/group/
├── data/
├── results/
│   ├── tables/
│   ├── figures/
│   ├── figure_data/
│   └── reports/
├── objects/
└── scripts/
```

Storage rules:
- never write formal outputs to `/tmp/`
- keep outputs in stable, replayable directory structures
- every major stage should have an index or summary table

## Process Traceability

Default to strong traceability mode:
- every major stage should emit audit tables, parameter records, QC summaries, and figure source data
- each major output directory should contain key input provenance
- important tables must use explicit column names rather than unexplained abbreviations

At minimum, a new team member reading only `work/` should be able to answer:
- which patients entered main analysis and which did not
- what QC was performed per dataset
- how cell types and subtypes were annotated
- how patient-level features were aggregated
- which covariates and sensitivity analyses the model used
- which source data produced each figure

## Figure and Delivery Standards

Formal figures are mandatory unless the user explicitly says otherwise.

All formal figures must follow `08-figure-standards.md`.

Per formal figure, save at least:
- vector output: `pdf`
- bitmap output: high-resolution `png`
- source data: `*_source_data.tsv`
- caption/description: `*_caption.md`

Final figure package must include:
- `work/figures/index.tsv`
- `work/figures/README.md`
- `work/figure_data/`

## Delivery Failure Conditions

Any of the following counts as incomplete delivery:
- only result tables with no formal figure directory
- only PNG files without vector files, source data, and captions
- no `figures/index.tsv` or `figures/README.md`
- using a blocked stage as if it were complete
- long-running execution with no progress messages
- executing a main script without first reporting path/hash/preflight status
- final summary contains only file paths and no scientific interpretation
- `run_pipeline.log` missing or empty
- placeholder `methods.md` / `figure_legend.md` presented as final delivery
- primary model dominated by route/meta/count proxy features without explicit failure labeling
- mechanism validation blocked but reported as a successful closed loop
