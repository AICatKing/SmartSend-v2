import { build as esbuild } from "esbuild";
import { createRequire } from "node:module";
import { readdir, rm, stat, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const tscBin = resolveTypeScriptBinary();

const packageDir = process.cwd();
const srcDir = path.join(packageDir, "src");
const distDir = path.join(packageDir, "dist");
const tempTsconfigPath = path.join(packageDir, "tsconfig.build.tmp.json");

const entryPoints = await collectTypeScriptFiles(srcDir);

if (entryPoints.length === 0) {
  throw new Error(`No TypeScript source files found under ${srcDir}`);
}

await rm(distDir, { force: true, recursive: true });

await esbuild({
  entryPoints,
  format: "esm",
  outbase: srcDir,
  outdir: distDir,
  packages: "external",
  platform: "node",
  target: "node22",
});

if (tscBin) {
  const tempTsconfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      noEmit: false,
      noEmitOnError: false,
      outDir: "./dist",
      rootDir: "./src",
    },
    include: ["src/**/*.ts"],
  };

  await writeFile(tempTsconfigPath, `${JSON.stringify(tempTsconfig, null, 2)}\n`);

  try {
    const result = spawnSync(process.execPath, [tscBin, "-p", tempTsconfigPath], {
      cwd: packageDir,
      encoding: "utf8",
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  } finally {
    await rm(tempTsconfigPath, { force: true });
  }
}

const indexDeclarationPath = path.join(distDir, "index.d.ts");

if (!(await fileExists(indexDeclarationPath))) {
  await writeFile(indexDeclarationPath, 'export * from "../src/index";\n');
}

async function collectTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(fullPath)));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    if (entry.name.endsWith(".d.ts")) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function resolveTypeScriptBinary() {
  try {
    return require.resolve("typescript/bin/tsc");
  } catch {
    return null;
  }
}
