// Every source this app cites, "Author (Year)" or "(Author Year)", in its documents, pages, help and code, is in a
// bibliography: the design rules' (UA-SMARTLab/design-rules) for design principles, or this project's
// bibliography.json for its subject. The design rules' check reads each citation's authors and year against both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CHECK = process.env.DESIGN_RULES_CHECK
  ?? join(homedir(), ".claude", "skills", "web-app-design", "scripts", "check_citations.py");

test("every source the app cites is in a bibliography", (t) => {
  if (!existsSync(CHECK)) {
    t.skip(`the design rules are not installed here (${CHECK}): run python install.py in the design-rules repository`);
    return;
  }
  const run = spawnSync("python", [CHECK, ROOT], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (run.error) {
    t.skip(`Python could not be started (${run.error.message}): install Python 3 to run the citation check`);
    return;
  }
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
