// Sets up a git worktree to run its own copy of the test environment: node scripts/setup-worktree.ts
// - puts this worktree's test-environment/.data back to the seed (the platform reloads the seed when .data is missing)
// - finds a free port
// - writes PORT and ROUTA_URL to .env.worktree
// Safe to run again: it ends in the same state each time and keeps the port while it is still free.
// It refuses to run in the main checkout, and it only touches files inside this worktree.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const envFile = join(root, ".env.worktree");

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function checkIsWorktree() {
  if (resolve(git("rev-parse", "--show-toplevel")) !== root) {
    throw new Error(`${root} is not the top of a git checkout.`);
  }
  const gitDir = resolve(root, git("rev-parse", "--git-dir"));
  const commonDir = resolve(root, git("rev-parse", "--git-common-dir"));
  if (gitDir === commonDir) {
    throw new Error("This is the main checkout, not a worktree. Run this inside a worktree.");
  }
}

// Not DATA_DIR: that could point at another checkout's data.
function resetData() {
  rmSync(join(root, "test-environment", ".data"), { recursive: true, force: true });
  rmSync(join(root, "test-environment", "collect.log"), { force: true });
}

function isFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.listen(port, () => probe.close(() => done(true)));
  });
}

async function pickFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
}

function previousPort(): number | undefined {
  if (!existsSync(envFile)) return undefined;
  const match = readFileSync(envFile, "utf8").match(/^PORT=(\d+)$/m);
  return match ? Number(match[1]) : undefined;
}

async function choosePort(): Promise<number> {
  const before = previousPort();
  if (before && (await isFree(before))) return before;
  return pickFreePort();
}

function writeEnv(port: number) {
  const text = `PORT=${port}\nROUTA_URL=http://localhost:${port}\n`;
  const temp = `${envFile}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, envFile);
}

async function main() {
  checkIsWorktree();
  resetData();
  const port = await choosePort();
  writeEnv(port);
  console.error(`Worktree ${root}`);
  console.error(`Test environment data reset to the seed. Port ${port} written to .env.worktree.`);
  console.error(`Start it with: PORT=${port} npm run test-environment`);
}

main().catch((err) => {
  console.error(`setup-worktree failed: ${(err as Error).message}`);
  process.exit(1);
});
