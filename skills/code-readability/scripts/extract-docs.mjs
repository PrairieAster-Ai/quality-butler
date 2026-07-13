#!/usr/bin/env node
//
// Extract component documentation via react-docgen-typescript, as JSON on
// stdout. Drives the deterministic "tool layer" of `/code-readability generate`
// (props tables + descriptions, straight from the TSDoc).
//
//   node extract-docs.mjs [--tsconfig <path>] <glob|dir|file> [more...]
//
// A glob like "src/components/<star><star>/<star>.tsx" is expanded to a file
// list (the script does the walking — no shell glob needed). Output is a JSON
// array of { filePath, displayName, description, props[], tags }.
//
// Config: the tsconfig defaults to `process.env.CR_TSCONFIG || 'tsconfig.json'`
// and can be overridden per-run with `--tsconfig <path>`.
//
import fs from 'node:fs';
import path from 'node:path';

let tsconfig = process.env.CR_TSCONFIG || 'tsconfig.json';
const inputs = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--tsconfig') { tsconfig = process.argv[++i]; continue; }
  inputs.push(a);
}
if (inputs.length === 0) {
  console.error('usage: extract-docs.mjs [--tsconfig <path>] <glob|dir|file>...');
  process.exit(2);
}

// Minimal glob: a plain file, a directory (walked), or "<base>/**/*.<ext>".
function collect(spec) {
  const star = spec.indexOf('*');
  if (star === -1) {
    if (!fs.existsSync(spec)) return [];
    const st = fs.statSync(spec);
    if (st.isFile()) return [spec];
    if (st.isDirectory()) return walk(spec, ['.ts', '.tsx']);
    return [];
  }
  const base = spec.slice(0, star).replace(/\/+$/, '') || '.';
  const ext = path.extname(spec) || '.tsx';
  return fs.existsSync(base) ? walk(base, [ext]) : [];
}

function walk(dir, exts) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      out.push(...walk(p, exts));
    } else if (exts.includes(path.extname(e.name)) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = [...new Set(inputs.flatMap(collect))];
if (files.length === 0) { console.error('no files matched'); process.exit(1); }

let rdt;
try {
  rdt = await import('react-docgen-typescript');
} catch {
  console.error('react-docgen-typescript not installed. Run:\n'
    + '  npm i -D react-docgen-typescript');
  process.exit(3);
}

const parserOpts = {
  savePropValueAsString: true,
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  // Keep the tables about *our* props — drop props inherited from MUI/DOM.
  propFilter: (prop) => !(prop.parent && /node_modules/.test(prop.parent.fileName)),
};

// react-docgen-typescript resolves a tsconfig's `include` relative to CWD, not
// the config's own directory — so run from the tsconfig dir and pass absolute
// file paths. Fall back to default compiler options if the config can't load.
const origCwd = process.cwd();
const tsconfigAbs = path.resolve(tsconfig);
const filesAbs = files.map((f) => path.resolve(f));
let parser;
try {
  process.chdir(path.dirname(tsconfigAbs));
  parser = rdt.withCustomConfig(path.basename(tsconfigAbs), parserOpts);
} catch (e) {
  process.chdir(origCwd);
  console.error(`tsconfig "${tsconfig}" unusable (${e.message}); falling back to default compiler options.`);
  parser = rdt.withDefaultConfig(parserOpts);
}

const docs = parser.parse(filesAbs).map((c) => ({
  filePath: c.filePath ? path.relative(origCwd, c.filePath) : null,
  displayName: c.displayName,
  description: c.description || '',
  tags: c.tags ?? {},
  props: Object.values(c.props || {}).map((p) => ({
    name: p.name,
    type: p.type?.name ?? '',
    required: !!p.required,
    defaultValue: p.defaultValue?.value ?? null,
    description: p.description ?? '',
  })),
}));

process.stdout.write(`${JSON.stringify(docs, null, 2)}\n`);
