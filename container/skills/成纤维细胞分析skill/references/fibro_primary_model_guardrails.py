"""Reference helpers for skill-aligned fibro primary modeling.

This module is a normative template for generated scripts. It encodes the
primary-model guardrails that were repeatedly violated in prior runs:

1. Do not let the primary model learn dataset/context metadata.
2. Do not let the primary model learn count-like technical proxies.
3. Reconcile manifest -> patient features -> modeled table before fitting.
4. Re-run LODO separately for each sensitivity scenario.
5. Run an output-integrity gate after the pipeline finishes.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


PRIMARY_META_COLS = {
    "dataset_id",
    "patient_id",
    "response_binary",
    "response_semantics",
    "response_tier",
    "annotation_method",
    "cancer_context",
    "cancer_type",
    "subtype_unified",
    "treatment_group",
    "platform",
}

FORBIDDEN_PRIMARY_FEATURES_EXACT = {
    "n_cells",
    "total_cells",
    "fibro_count",
    "fibro_subtype_n",
    "cells_post_qc",
    "cell_count",
    "total_counts",
    "nCount_RNA",
    "nFeature_RNA",
}

FORBIDDEN_PRIMARY_PREFIXES = (
    "dataset_id_",
    "cancer_context_",
    "cancer_type_",
    "platform_",
    "response_tier_",
    "annotation_method_",
)

FORBIDDEN_PRIMARY_SUFFIXES = (
    "_count",
)

PLACEHOLDER_PHRASES = (
    "methods are encoded in scripts/",
    "figure captions are stored alongside each figure",
    "see script for methods",
    "see figure files",
)


def write_tsv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, sep="\t", index=False)


def _read_tabular(path: Path) -> pd.DataFrame:
    if path.suffix == ".gz":
        return pd.read_csv(path, sep="\t", compression="gzip")
    return pd.read_csv(path, sep="\t")


def _line_count(path: Path) -> int:
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for _ in handle)


def _is_placeholder_text(text: str) -> bool:
    normalized = " ".join(text.lower().split())
    return any(phrase in normalized for phrase in PLACEHOLDER_PHRASES)


def build_modeling_coverage_report(
    manifest: pd.DataFrame,
    patient_features: pd.DataFrame,
    modeled_df: pd.DataFrame,
) -> pd.DataFrame:
    main = manifest.loc[manifest["include_main_analysis"].fillna(False)].copy()
    main = main.drop_duplicates(subset=["dataset_id", "patient_id"])

    coverage = (
        main.groupby("dataset_id")["patient_id"].nunique().rename("manifest_patients").to_frame()
        .join(
            patient_features.groupby("dataset_id")["patient_id"].nunique().rename("patient_feature_rows"),
            how="left",
        )
        .join(
            modeled_df.groupby("dataset_id")["patient_id"].nunique().rename("modeled_rows"),
            how="left",
        )
        .fillna(0)
        .reset_index()
    )
    coverage["patient_feature_rows"] = coverage["patient_feature_rows"].astype(int)
    coverage["modeled_rows"] = coverage["modeled_rows"].astype(int)
    coverage["loss_manifest_to_features"] = coverage["manifest_patients"] - coverage["patient_feature_rows"]
    coverage["loss_features_to_modeled"] = coverage["patient_feature_rows"] - coverage["modeled_rows"]
    coverage["status"] = "ok"

    total_manifest = int(coverage["manifest_patients"].sum())
    total_modeled = int(coverage["modeled_rows"].sum())
    if total_manifest == 0:
        raise RuntimeError("ERROR: no_main_manifest_rows")
    if total_modeled < 0.9 * total_manifest:
        raise RuntimeError("ERROR: modeling_coverage_mismatch")

    for idx, row in coverage.iterrows():
        if row["manifest_patients"] == 0:
            continue
        feature_loss = row["loss_manifest_to_features"] / row["manifest_patients"]
        if feature_loss > 0.20:
            coverage.loc[idx, "status"] = "ERROR: dataset_feature_coverage_mismatch"
        if int(row["modeled_rows"]) == 0:
            coverage.loc[idx, "status"] = "ERROR: dropped_main_dataset_from_model"

    if coverage["status"].str.startswith("ERROR").any():
        raise RuntimeError("ERROR: modeling_coverage_mismatch")
    return coverage


def audit_primary_feature_candidates(
    modeled_df: pd.DataFrame,
    feature_gate_log: pd.DataFrame,
) -> pd.DataFrame:
    blocked = set(
        feature_gate_log.loc[
            feature_gate_log["gate"].astype(str).str.startswith("GATE"),
            "feature_name",
        ].astype(str)
    )

    rows = []
    for column in modeled_df.columns:
        reason = "use_in_primary"
        include = True
        if column in PRIMARY_META_COLS:
            include = False
            reason = "metadata"
        elif column in blocked:
            include = False
            reason = "feature_gate_blocked"
        elif column in FORBIDDEN_PRIMARY_FEATURES_EXACT:
            include = False
            reason = "forbidden_exact"
        elif any(column.startswith(prefix) for prefix in FORBIDDEN_PRIMARY_PREFIXES):
            include = False
            reason = "forbidden_prefix"
        elif any(column.endswith(suffix) for suffix in FORBIDDEN_PRIMARY_SUFFIXES):
            include = False
            reason = "forbidden_suffix"
        else:
            values = pd.to_numeric(modeled_df[column], errors="coerce")
            if values.notna().sum() <= 2:
                include = False
                reason = "too_sparse"
            elif float(values.var(skipna=True) or 0.0) <= 0:
                include = False
                reason = "zero_variance"

        rows.append(
            {
                "feature_name": column,
                "include_in_primary": bool(include),
                "reason": reason,
            }
        )

    audit = pd.DataFrame(rows)
    bad = audit.loc[
        audit["include_in_primary"]
        & (
            audit["feature_name"].isin(FORBIDDEN_PRIMARY_FEATURES_EXACT)
            | audit["feature_name"].astype(str).str.startswith(FORBIDDEN_PRIMARY_PREFIXES)
            | audit["feature_name"].astype(str).str.endswith(FORBIDDEN_PRIMARY_SUFFIXES)
        )
    ]
    if not bad.empty:
        raise RuntimeError("ERROR: forbidden_primary_feature")
    return audit


def build_primary_design_matrix(
    patient_features: pd.DataFrame,
    manifest: pd.DataFrame,
    feature_gate_log: pd.DataFrame,
) -> tuple[pd.DataFrame, list[str], pd.DataFrame, pd.DataFrame]:
    main = manifest.loc[manifest["include_main_analysis"].fillna(False)].copy()
    main = main.loc[main["response_binary"].isin(["Response", "Non-response"])].copy()
    keep = main.drop_duplicates(subset=["dataset_id", "patient_id"])

    modeled_df = patient_features.merge(
        keep[
            [
                "dataset_id",
                "patient_id",
                "response_binary",
                "response_tier",
                "cancer_context",
                "annotation_method",
            ]
        ],
        on=["dataset_id", "patient_id"],
        how="inner",
    )
    coverage = build_modeling_coverage_report(main, patient_features, modeled_df)
    audit = audit_primary_feature_candidates(modeled_df, feature_gate_log)
    feature_cols = audit.loc[audit["include_in_primary"], "feature_name"].tolist()
    if len(feature_cols) < 3:
        raise RuntimeError("ERROR: insufficient_primary_features")
    return modeled_df, feature_cols, coverage, audit


def lodo_eval_primary(
    modeled_df: pd.DataFrame,
    feature_cols: list[str],
    *,
    seed: int = 42,
    group_col: str = "dataset_id",
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    use = modeled_df.loc[modeled_df["response_binary"].isin(["Response", "Non-response"])].copy()
    X = use[feature_cols].apply(pd.to_numeric, errors="coerce")
    y = (use["response_binary"] == "Response").astype(int).to_numpy()
    groups = use[group_col].astype(str).to_numpy()

    fold_rows = []
    pred_rows = []
    assign_rows = []

    for held_out in sorted(np.unique(groups)):
        test_idx = np.where(groups == held_out)[0]
        train_idx = np.where(groups != held_out)[0]
        if len(test_idx) == 0 or len(np.unique(y[train_idx])) < 2:
            fold_rows.append(
                {
                    "fold": held_out,
                    "n_train": len(train_idx),
                    "n_test": len(test_idx),
                    "roc_auc": np.nan,
                    "pr_auc": np.nan,
                    "validity": "excluded",
                    "excluded_reason": "single_class_or_empty_train",
                }
            )
            continue

        model = Pipeline(
            steps=[
                ("imp", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                (
                    "clf",
                    LogisticRegression(
                        penalty="l2",
                        solver="liblinear",
                        max_iter=4000,
                        class_weight="balanced",
                        random_state=seed,
                    ),
                ),
            ]
        )
        model.fit(X.iloc[train_idx], y[train_idx])
        prob = model.predict_proba(X.iloc[test_idx])[:, 1]
        auc = roc_auc_score(y[test_idx], prob) if len(np.unique(y[test_idx])) > 1 else np.nan
        pr_auc = average_precision_score(y[test_idx], prob)

        fold_rows.append(
            {
                "fold": held_out,
                "n_train": len(train_idx),
                "n_test": len(test_idx),
                "roc_auc": auc,
                "pr_auc": pr_auc,
                "validity": "near_random" if pd.notna(auc) and auc <= 0.55 else "valid",
                "excluded_reason": "",
            }
        )

        for idx, probability in zip(test_idx, prob):
            pred_rows.append(
                {
                    "dataset_id": use.iloc[idx]["dataset_id"],
                    "patient_id": use.iloc[idx]["patient_id"],
                    "fold": held_out,
                    "y_true": int(y[idx]),
                    "y_prob": float(probability),
                }
            )

        for idx in train_idx:
            assign_rows.append(
                {
                    "dataset_id": use.iloc[idx]["dataset_id"],
                    "patient_id": use.iloc[idx]["patient_id"],
                    "fold": held_out,
                    "role": "train",
                }
            )
        for idx in test_idx:
            assign_rows.append(
                {
                    "dataset_id": use.iloc[idx]["dataset_id"],
                    "patient_id": use.iloc[idx]["patient_id"],
                    "fold": held_out,
                    "role": "test",
                }
            )

    return (
        pd.DataFrame(fold_rows),
        pd.DataFrame(pred_rows),
        pd.DataFrame(assign_rows),
    )


def run_sensitivity_scenario(
    scenario_name: str,
    scenario_df: pd.DataFrame,
    feature_cols: list[str],
    output_dir: Path,
) -> dict[str, object]:
    fold_df, pred_df, assign_df = lodo_eval_primary(scenario_df, feature_cols)
    scenario_dir = output_dir / "sensitivity"
    write_tsv(fold_df, scenario_dir / f"{scenario_name}__fold_metrics.tsv")
    write_tsv(pred_df, scenario_dir / f"{scenario_name}__heldout_predictions.tsv")
    write_tsv(assign_df, scenario_dir / f"{scenario_name}__cv_fold_assignments.tsv")
    return {
        "scenario": scenario_name,
        "mean_lodo_auc": float(pd.to_numeric(fold_df["roc_auc"], errors="coerce").mean()),
        "n_rows": int(len(scenario_df)),
    }


def validate_main_source_scope(source_df: pd.DataFrame, manifest: pd.DataFrame) -> None:
    main_keys = set(
        manifest.loc[manifest["include_main_analysis"].fillna(False), ["dataset_id", "patient_id"]]
        .drop_duplicates()
        .itertuples(index=False, name=None)
    )
    source_keys = set(
        source_df.loc[:, ["dataset_id", "patient_id"]]
        .drop_duplicates()
        .itertuples(index=False, name=None)
    )
    if not source_keys.issubset(main_keys):
        raise RuntimeError("ERROR: main_figure_scope_mismatch")


def run_output_integrity_gate(run_dir: Path) -> pd.DataFrame:
    rows = []

    def record(check: str, status: str, detail: str) -> None:
        rows.append({"check": check, "status": status, "detail": detail})

    work_dir = run_dir / "work"
    reports_dir = work_dir / "reports"
    audit_dir = work_dir / "audit"

    pipeline_log = audit_dir / "run_pipeline.log"
    if not pipeline_log.exists() or pipeline_log.stat().st_size == 0:
        record("pipeline_log", "ERROR", "missing_or_empty")
    else:
        record("pipeline_log", "PASS", f"bytes={pipeline_log.stat().st_size}")

    for name in ("methods.md", "figure_legend.md"):
        path = reports_dir / name
        if not path.exists():
            record(name, "ERROR", "missing")
            continue
        text = path.read_text(encoding="utf-8").strip()
        if len(text.split()) < 30 or _is_placeholder_text(text):
            record(name, "ERROR", "placeholder_or_too_short")
        else:
            record(name, "PASS", "non_placeholder")

    for pattern in ("**/*cluster_markers.tsv", "**/*subtype_marker_scores.tsv"):
        matched = sorted((work_dir / "annotation").glob(pattern))
        if not matched:
            record(pattern, "ERROR", "missing")
            continue
        bad = [str(path) for path in matched if _line_count(path) <= 1]
        if bad:
            record(pattern, "ERROR", "empty_files=" + ";".join(bad))
        else:
            record(pattern, "PASS", f"n_files={len(matched)}")

    modeling_root = work_dir / "modeling"
    run_dirs = sorted([path for path in modeling_root.glob("run_*") if path.is_dir()])
    if not run_dirs:
        record("modeling_dir", "ERROR", "missing")
        return pd.DataFrame(rows)

    latest = run_dirs[-1]
    feature_audit = latest / "primary_feature_audit.tsv"
    features_used = latest / "features_used.tsv"
    coverage_report = latest / "modeling_coverage_report.tsv"

    if not feature_audit.exists():
        record("primary_feature_audit", "ERROR", "missing")
    else:
        audit_df = _read_tabular(feature_audit)
        bad = audit_df.loc[
            audit_df["include_in_primary"].astype(str).isin(["True", "true", "1"])
            & (
                audit_df["feature_name"].isin(FORBIDDEN_PRIMARY_FEATURES_EXACT)
                | audit_df["feature_name"].astype(str).str.startswith(FORBIDDEN_PRIMARY_PREFIXES)
                | audit_df["feature_name"].astype(str).str.endswith(FORBIDDEN_PRIMARY_SUFFIXES)
            )
        ]
        if not bad.empty:
            record("primary_feature_audit", "ERROR", "forbidden_primary_feature_present")
        else:
            record("primary_feature_audit", "PASS", "ok")

    if not coverage_report.exists():
        record("modeling_coverage_report", "ERROR", "missing")
    else:
        coverage_df = _read_tabular(coverage_report)
        if coverage_df["status"].astype(str).str.startswith("ERROR").any():
            record("modeling_coverage_report", "ERROR", "coverage_status_error")
        else:
            record("modeling_coverage_report", "PASS", "ok")

    if feature_audit.exists() and features_used.exists():
        audit_df = _read_tabular(feature_audit)
        used_df = _read_tabular(features_used)
        expected = set(audit_df.loc[audit_df["include_in_primary"].astype(str).isin(["True", "true", "1"]), "feature_name"])
        actual = set(used_df["feature_name"].astype(str))
        if expected != actual:
            record("features_used_consistency", "ERROR", "mismatch_with_primary_feature_audit")
        else:
            record("features_used_consistency", "PASS", "ok")

    sensitivity_dir = latest / "sensitivity"
    sensitivity_summary = latest / "sensitivity_results.tsv"
    if sensitivity_summary.exists():
        summary_df = _read_tabular(sensitivity_summary)
        missing_artifacts = []
        for scenario in summary_df["scenario"].astype(str).tolist():
            fold_path = sensitivity_dir / f"{scenario}__fold_metrics.tsv"
            pred_path = sensitivity_dir / f"{scenario}__heldout_predictions.tsv"
            if not fold_path.exists() or not pred_path.exists():
                missing_artifacts.append(scenario)
        if missing_artifacts:
            record("sensitivity_artifacts", "ERROR", "missing=" + ",".join(missing_artifacts))
        else:
            record("sensitivity_artifacts", "PASS", "ok")

    return pd.DataFrame(rows)
