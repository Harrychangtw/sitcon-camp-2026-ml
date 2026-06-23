# precompute (`camp-precompute`)

The Python side of the project, managed with [uv](https://docs.astral.sh/uv/).
It does the **heavy compute ahead of time** and exports small artifacts the
browser apps load. The browser never trains.

## Run

```bash
cd precompute
uv sync                              # create .venv, install deps + this package
uv run camp-precompute make-data     # writes apps/course2/public/data/course2/manifest.json
```

`make-data` finds the repo root (the folder with `pnpm-workspace.yaml`) and
writes into `apps/course2/public/data/course2/`. Override the target with
`--out <dir>`.

## Layout

```
pyproject.toml                 project + [project.scripts] camp-precompute
src/camp_precompute/
  __init__.py
  cli.py                       argparse CLI; subcommand make-data
```

## Where this is going

`make-data` currently writes a hello manifest. The real pipeline will add
subcommands (e.g. `train-rnn`, `export-onnx`) that train small models and export
ONNX + JSON into `apps/<course>/public/data/<course>/`, listed in that course's
`manifest.json`. Heavy deps (torch, onnx, transformers) get added to
`pyproject.toml` then — kept out for now to keep `uv sync` fast.

## What does NOT belong here

- Anything that needs to run in the browser → the web apps + `@camp/*` packages.
- Large committed binaries → keep `*.onnx` / `*.bin` out of git (see
  `.gitignore`); ship them via deploy/storage, commit only small JSON.
