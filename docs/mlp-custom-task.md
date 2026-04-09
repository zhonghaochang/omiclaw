# OmiClaw 自定义任务启动

OmiClaw 当前的本体是一个长期运行的 Node/TypeScript 服务，`npm run dev` 对应的是：

```bash
tsx src/index.ts
```

它不是 PyTorch 分布式训练脚本，所以不要把 `src/index.ts` 直接放到 `torch.distributed.launch` 后面。这个仓库里新增了一个适配入口：

```text
/vepfs-mlp2/mlp-public/250266/omiclaw/scripts/mlp_custom_task_entry.py
```

这个脚本会做两件事：

- 全局主进程启动 OmiClaw。
- 其他由分布式模板拉起的 rank 进入空闲等待，不会重复启动多个 Web 服务。

## 推荐启动命令

最推荐直接用 `bash` 或 `python` 启动，不依赖 PyTorch：

```bash
export OMICLAW_START_MODE=dev
bash /vepfs-mlp2/mlp-public/250266/omiclaw/scripts/mlp_custom_task_start.sh
```

或者：

```bash
export OMICLAW_START_MODE=dev
python /vepfs-mlp2/mlp-public/250266/omiclaw/scripts/mlp_custom_task_entry.py
```

如果你想用编译后的稳定模式：

```bash
export OMICLAW_START_MODE=start
bash /vepfs-mlp2/mlp-public/250266/omiclaw/scripts/mlp_custom_task_start.sh
```

## 兼容分布式模板的命令

只有当任务环境里已经安装了 `torch`，并且平台强制要求走分布式模板时，才使用下面这组命令。

如果你的平台要求沿用分布式模板，可以直接用下面这条：

```bash
export OMICLAW_START_MODE=dev
python -m torch.distributed.launch \
  --nproc_per_node $MLP_WORKER_GPU \
  --master_addr $MLP_WORKER_0_HOST \
  --node_rank $MLP_ROLE_INDEX \
  --master_port $MLP_WORKER_0_PORT \
  --nnodes $MLP_WORKER_NUM \
  /vepfs-mlp2/mlp-public/250266/omiclaw/scripts/mlp_custom_task_entry.py
```

如果你想用编译后的稳定模式，可以改成：

```bash
export OMICLAW_START_MODE=start
python -m torch.distributed.launch \
  --nproc_per_node $MLP_WORKER_GPU \
  --master_addr $MLP_WORKER_0_HOST \
  --node_rank $MLP_ROLE_INDEX \
  --master_port $MLP_WORKER_0_PORT \
  --nnodes $MLP_WORKER_NUM \
  /vepfs-mlp2/mlp-public/250266/omiclaw/scripts/mlp_custom_task_entry.py
```

`OMICLAW_START_MODE=start` 时会默认先执行一次 `npm run build`，再执行 `npm run start`。

## 脚本自动处理的环境变量

- `CONDA_ENV_PATH`
  默认值：`/vepfs-mlp2/mlp-public/250266/miniconda3/envs/omiclaw`
- `DASHBOARD_PORT`
  默认优先取 `PORT`，否则回落到 `3220`
- `MAX_CONCURRENT_AGENTS`
  默认自动设为 `$MLP_WORKER_GPU`
- `MAX_CONCURRENT_CONTAINERS`
  默认与 `MAX_CONCURRENT_AGENTS` 一致

## 可选开关

```bash
export OMICLAW_RUN_NPM_CI=1
```

启动前先执行 `npm ci`，适合依赖未安装完成的环境。

```bash
export OMICLAW_RUN_BUILD_FIRST=1
```

在 `OMICLAW_START_MODE=dev` 时，先执行一次 `npm run build` 再启动。

## 资源规格建议

- 推荐优先使用 `1` 个 worker。
- 如果只是让 OmiClaw 常驻提供 Web/消息入口，通常不需要多 worker 分布式。
- 如果你的分析流程会在 agent 内部调用 GPU 程序，优先给单个 worker 分配多张 GPU，而不是把 OmiClaw 自身做成多副本分布式服务。
