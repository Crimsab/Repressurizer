import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const binaryName = "repressurizer-sam-bridge";

type Options = {
  target: string;
  runner: "cargo" | "cargo-xwin";
  release: boolean;
};

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hostTriple(): string {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const match = output.match(/^host:\s*(.+)$/m);
  if (!match) throw new Error("Could not read rustc host triple");
  return match[1].trim();
}

function options(): Options {
  const target = readArg("--target") ?? hostTriple();
  const runner = (readArg("--runner") ?? "cargo") as Options["runner"];
  if (runner !== "cargo" && runner !== "cargo-xwin") {
    throw new Error(`Unsupported --runner ${runner}`);
  }
  return {
    target,
    runner,
    release: !process.argv.includes("--debug"),
  };
}

function buildBridge({ target, runner, release }: Options): void {
  const cargoArgs = [
    "build",
    "--manifest-path",
    join(root, "src-tauri/Cargo.toml"),
    "--bin",
    binaryName,
    "--target",
    target,
  ];
  if (release) cargoArgs.push("--release");

  const command = runner === "cargo-xwin" ? "cargo-xwin" : "cargo";
  execFileSync(command, cargoArgs, { cwd: root, stdio: "inherit" });
}

function bridgeExtension(target: string): string {
  return target.includes("windows") ? ".exe" : "";
}

function bridgeDestination(target: string): string {
  return join(
    root,
    "src-tauri/binaries",
    `${binaryName}-${target}${bridgeExtension(target)}`,
  );
}

function ensureBuildPlaceholder(target: string): void {
  const destination = bridgeDestination(target);
  if (existsSync(destination)) return;

  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, "# Repressurizer SAM bridge build placeholder\n");
  chmodSync(destination, 0o755);
}

function copyBridge({ target, release }: Options): void {
  const profile = release ? "release" : "debug";
  const extension = target.includes("windows") ? ".exe" : "";
  const source = join(root, "src-tauri/target", target, profile, `${binaryName}${extension}`);
  const destination = bridgeDestination(target);

  if (!existsSync(source)) {
    throw new Error(`Bridge build output not found: ${source}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  console.log(`SAM bridge ready: ${destination}`);
}

const opts = options();
ensureBuildPlaceholder(opts.target);
buildBridge(opts);
copyBridge(opts);
