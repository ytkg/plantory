import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "plantory-schedule-"));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

try {
  for (const project of ["soil-moisture-atom-s3", "weight-atom-s3", "weight-m5stickc-plus2"]) {
    const binary = join(output, project);
    run(process.env.CXX || "c++", ["-std=c++17", "-Wall", "-Wextra", "-Werror", `-I${project}/src`, "tests/metrics_schedule_test.cpp", "-o", binary]);
    console.log(project);
    run(binary, []);
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
