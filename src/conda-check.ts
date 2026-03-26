export const REQUIRED_SINGLE_CELL_MODULES = [
  'scanpy',
  'scvi',
  'cellrank',
  'celltypist',
  'infercnvpy',
  'anndata',
];

export function buildPythonModuleCheckCommand(pythonPath: string): string {
  const pythonCode = [
    'import importlib.util, json, sys',
    `mods = ${JSON.stringify(REQUIRED_SINGLE_CELL_MODULES)}`,
    'missing = [m for m in mods if importlib.util.find_spec(m) is None]',
    "print(json.dumps({'missing': missing}))",
    'raise SystemExit(0 if not missing else 1)',
  ].join('; ');

  return `${JSON.stringify(pythonPath)} -c ${JSON.stringify(pythonCode)}`;
}

export function parseMissingModules(output: string | Buffer | null | undefined): string[] {
  if (!output) return [];

  try {
    const parsed = JSON.parse(String(output).trim()) as { missing?: unknown };
    return Array.isArray(parsed.missing)
      ? parsed.missing.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
