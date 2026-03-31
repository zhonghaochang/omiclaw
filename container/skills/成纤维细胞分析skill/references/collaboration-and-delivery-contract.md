# Shared Collaboration and Delivery Contract

This reference is the shared collaboration, progress-reporting, storage, traceability, and figure-delivery contract for `成纤维细胞分析skill`.

Use this file whenever a task is:
- longer than 30 seconds
- expected to generate structured result directories
- expected to produce formal figures rather than ad hoc screenshots
- executed in a repository that primarily relies on `成纤维细胞分析skill`

Legacy paths such as `omics-compute/` or `fibro-response-ml-comprehensive-zh/` may remain as compatibility aliases. The canonical entry is `成纤维细胞分析skill/SKILL.md`.

## Single-Skill Mode

Treat `成纤维细胞分析skill/SKILL.md` as the root environment guide.

In single-skill mode:
- Use `成纤维细胞分析skill/SKILL.md` for environment, package availability, runtime caveats, and the default fibro/ICB workflow
- Use `references/` for routing, validation, and delivery details

## Real-Time Progress Reporting

For any analysis that takes more than 30 seconds, you must use `mcp__omiclaw__send_message` to send real-time progress updates to the user. The user is on a web dashboard and cannot see internal work until a message is sent or the task finishes.

Minimum reporting rules:
- Send a plan message before starting multi-step work
- Send a checkpoint after each major stage with specific numbers and findings
- Send anomaly alerts immediately when you discover issues
- Send a final summary with scientific conclusions, not just file paths
- Never go silent for more than 60 seconds during a long-running task

### Mandatory Checkpoints

| Seq | Timing | Must include |
|---|---|---|
| 0 | task start | analysis plan, expected stages |
| 1 | before running main script | script path, whether regenerated or patched, script hash, whether preflight/compliance gate passed, whether run directory hygiene passed, any blocking ERROR items |
| 2 | after data loading | per-cohort sample counts, R/NR distribution |
| 3 | after manifest validation | validation results, excluded sample counts and reasons, WARN/ERROR items |
| 4 | after QC | retained cell counts and filter fractions per dataset |
| 5 | after annotation | detected major cell types, whether key compartments completed second-layer sub-clustering, coverage audit summary |
| 6 | after feature construction | total features, passed features, removed features and reasons, manifest rows vs patient-feature rows vs modeled rows by dataset, whether any forbidden meta/technical features remain |
| 7 | after communication | tool used, whether result is real communication or proxy, whether any all-zero or all-NaN matrix exists |
| 8 | after modeling | per-fold AUC, excluded folds, top features, ablation findings, whether any top features are dataset/context/count proxies |
| 9 | after figure generation | figure paths and one-line meaning of each figure |
| 10 | final summary | scientific conclusion, effect direction/strength, limitations, recommended next step |

### Message Content Rules

- Messages must contain numbers and specific findings; avoid empty status lines such as "QC done"
- Report abnormalities immediately instead of waiting until the end
- Final summaries must contain interpretation, not only file paths
- If a fold is near-random, if subtypes are all zero, if a communication matrix is blank, or if sub-clustering is incomplete, say so explicitly
- If a generated script was reused, hash-identical to a prior run, or failed the compliance gate, say so explicitly before any long run starts
- If the run directory is not clean, contains nested legacy result trees, or already contains proxy communication files, say so explicitly before any long run starts
- If the modeled cohort shrinks materially relative to `manifest.tsv`, say so explicitly and report the per-dataset attrition
- If `methods.md` / `figure_legend.md` / markers files are placeholder-like or empty, say so explicitly instead of calling the delivery complete
- If the primary model still contains `dataset_id_*`、`cancer_context_*`、`platform_*`、`n_cells` or absolute count features, report that immediately as a modeling failure
- If `primary_feature_audit.tsv` is missing, or if `features_used.tsv` disagrees with it, report that immediately instead of describing the model as finalized

### Prohibited Collaboration Behavior

- Running for 10+ minutes and then sending only "analysis complete"
- Listing file paths without explaining what they mean
- Omitting limitations or known problems
- Hiding anomalous results such as AUC close to random
- Downgrading deliverables because an optional helper skill is absent

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
- Never write formal outputs to `/tmp/`
- Keep analysis outputs in stable, replayable directory structures
- Every major stage should have either `README.md`, `index.tsv`, or an equivalent stage summary

## Process Traceability

Default to strong traceability mode:
- Every major stage should emit audit tables, parameter records, QC summaries, and figure source data
- Each major output directory should contain a short usage description and key input provenance
- Important intermediate tables should use explicit column names rather than unexplained abbreviations

At minimum, a new team member reading only `work/` should be able to answer:
- which samples entered main analysis and which did not
- what QC was performed per dataset
- how cell types and subtypes were annotated
- how patient-level features were aggregated
- which covariates and sensitivity analyses the model used
- which source data produced each figure

## Figure and Delivery Standards

Formal figures are mandatory unless the user explicitly says not to produce figures.

Per formal figure, save at least:
- vector output: `pdf` or `svg`
- bitmap output: high-resolution `png`
- source data: `*_source_data.tsv`
- caption/description: `*_caption.md`

Style defaults:
- white background, restrained palette, colorblind-safe hues
- editable vector text where possible
- consistent font hierarchy
- remove unnecessary top/right spines
- prefer direct labels or compact legends

### Figure Acceptance Floor

The final results directory must include at least:
- `figures/index.tsv`
- `figure_data/`
- `figures/README.md` or an equivalent figure guide

If only patient/sample aggregation is available, still deliver at least four figure classes:
- cohort composition or inclusion/exclusion figure
- key feature distribution figure
- cross-source effect or forest/meta figure
- model or ablation or calibration or other explanatory figure

If raw single-cell objects are unavailable and UMAP/marker figures cannot be generated:
- explain the reason in `README.md`
- explain the reason again in the final response

### Single-Cell Figure Pack Minimum

For genuine single-cell analyses, the minimum formal pack is:
- UMAP of major cell compartments
- UMAP of the focal lineage or subtype structure
- marker dotplot or heatmap for annotation evidence
- sample or response composition figure
- one response-associated effect/model summary figure

If only aggregate-layer analysis was completed, label the result explicitly as aggregate-layer output and do not present it as full single-cell figure coverage.

## Delivery Failure Conditions

Any of the following counts as incomplete delivery by default:
- only result tables with no formal figure directory
- only PNG files without vector files, source data, and captions
- figures exist but the final response does not enumerate them
- no figure index or equivalent figure manifest
- missing figure classes with no written reason
- long-running execution with no progress messages
- generated or patched main script was executed without first reporting path/hash/preflight status
- a non-clean run directory was used without first reporting hygiene status and clearing legacy payload
- final summary contains only file paths and no scientific interpretation
- `work/audit/run_pipeline.log` missing or empty at the end of the run
- placeholder `methods.md` / `figure_legend.md` presented as final delivery
- primary model dominated by dataset/context/count proxy features without explicit failure labeling
- sensitivity analysis reported only as a summary table without scenario-level `fold_metrics` / `heldout_predictions`
