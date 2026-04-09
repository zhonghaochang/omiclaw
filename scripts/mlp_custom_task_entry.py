#!/usr/bin/env python3
from __future__ import annotations

import os
import signal
import shutil
import subprocess
import sys
import time
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONDA_ENV_PATH = (
    "/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw"
)
DEFAULT_NODE_BIN_PATH = "/vepfs-mlp2/mlp-public/250266/nodejs/current/bin"
DEFAULT_NPM_GLOBAL_BIN_PATH = "/vepfs-mlp2/mlp-public/250266/.npm-global/bin"


def int_env(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def is_primary_process() -> bool:
    if "RANK" in os.environ:
        return int_env("RANK", 0) == 0
    if "MLP_ROLE_INDEX" in os.environ:
        return int_env("MLP_ROLE_INDEX", 0) == 0 and int_env("LOCAL_RANK", 0) == 0
    if "LOCAL_RANK" in os.environ:
        return int_env("LOCAL_RANK", 0) == 0
    return True


def build_env() -> dict[str, str]:
    env = os.environ.copy()
    gpu_count = max(1, int_env("MLP_WORKER_GPU", 1))

    env.setdefault("CONDA_ENV_PATH", DEFAULT_CONDA_ENV_PATH)
    env.setdefault("TZ", "Etc/UTC")
    env.setdefault("DASHBOARD_PORT", env.get("PORT", "3220"))
    env.setdefault("MAX_CONCURRENT_AGENTS", str(gpu_count))
    env.setdefault("MAX_CONCURRENT_CONTAINERS", env["MAX_CONCURRENT_AGENTS"])
    extra_paths = [
        env.get("OMICLAW_NODE_BIN", "").strip(),
        DEFAULT_NODE_BIN_PATH,
        DEFAULT_NPM_GLOBAL_BIN_PATH,
    ]
    current_path = env.get("PATH", "")
    path_parts = [part for part in current_path.split(os.pathsep) if part]
    for extra_path in reversed(extra_paths):
        if not extra_path:
            continue
        if not Path(extra_path).is_dir():
            continue
        if extra_path in path_parts:
            path_parts.remove(extra_path)
        path_parts.insert(0, extra_path)
    env["PATH"] = os.pathsep.join(path_parts)
    return env


def resolve_npm(env: dict[str, str]) -> str:
    npm_override = env.get("OMICLAW_NPM_BIN", "").strip()
    if npm_override:
        if Path(npm_override).is_file():
            return npm_override
        raise RuntimeError(
            "[mlp-custom-task] OMICLAW_NPM_BIN is set but does not exist: "
            f"{npm_override}"
        )

    npm_path = shutil.which("npm", path=env.get("PATH"))
    if npm_path:
        return npm_path

    searched_path = env.get("PATH", "")
    raise RuntimeError(
        "[mlp-custom-task] npm was not found in PATH. "
        "Set OMICLAW_NODE_BIN or OMICLAW_NPM_BIN for the custom task "
        f"environment. PATH={searched_path}"
    )


def run_checked(cmd: list[str], env: dict[str, str]) -> None:
    print(f"[mlp-custom-task] running: {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, cwd=PROJECT_ROOT, env=env, check=True)


def wait_as_idle_worker() -> int:
    rank = os.environ.get("RANK", "")
    local_rank = os.environ.get("LOCAL_RANK", "")
    role_index = os.environ.get("MLP_ROLE_INDEX", "")
    stop = False

    def handle_stop(signum: int, _frame: object) -> None:
        nonlocal stop
        print(
            f"[mlp-custom-task] received signal {signum}, idle worker exiting",
            flush=True,
        )
        stop = True

    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)

    print(
        "[mlp-custom-task] idle worker detected; "
        f"rank={rank or '-'} local_rank={local_rank or '-'} "
        f"node_rank={role_index or '-'}",
        flush=True,
    )
    print(
        "[mlp-custom-task] OmiClaw only starts on the primary process.",
        flush=True,
    )

    while not stop:
        time.sleep(1)
    return 0


def run_primary() -> int:
    env = build_env()
    npm_bin = resolve_npm(env)
    start_mode = env.get("OMICLAW_START_MODE", "dev").strip().lower()
    run_npm_ci = env.get("OMICLAW_RUN_NPM_CI", "0") == "1"
    run_build_first = env.get("OMICLAW_RUN_BUILD_FIRST", "")

    if run_npm_ci:
        run_checked([npm_bin, "ci"], env)

    if start_mode == "start":
        if run_build_first != "0":
            run_checked([npm_bin, "run", "build"], env)
        cmd = [npm_bin, "run", "start"]
    elif start_mode == "dev":
        if run_build_first == "1":
            run_checked([npm_bin, "run", "build"], env)
        cmd = [npm_bin, "run", "dev"]
    else:
        print(
            f"[mlp-custom-task] unsupported OMICLAW_START_MODE: {start_mode}",
            file=sys.stderr,
            flush=True,
        )
        return 2

    print("[mlp-custom-task] project_root:", PROJECT_ROOT, flush=True)
    print("[mlp-custom-task] npm:", npm_bin, flush=True)
    print(
        "[mlp-custom-task] dashboard_port:",
        env.get("DASHBOARD_PORT"),
        "max_concurrent_agents:",
        env.get("MAX_CONCURRENT_AGENTS"),
        flush=True,
    )

    proc = subprocess.Popen(cmd, cwd=PROJECT_ROOT, env=env)

    def forward_signal(signum: int, _frame: object) -> None:
        if proc.poll() is None:
            print(
                f"[mlp-custom-task] forwarding signal {signum} to child process",
                flush=True,
            )
            proc.send_signal(signum)

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)
    return proc.wait()


def main() -> int:
    if is_primary_process():
        return run_primary()
    return wait_as_idle_worker()


if __name__ == "__main__":
    raise SystemExit(main())
