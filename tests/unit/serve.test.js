// The development server answers this computer only (the user's rule: servers bind to 127.0.0.1). Right result by
// definition: a server listening on 127.0.0.1 answers there and refuses the computer's network addresses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const SERVE = fileURLToPath(new URL("../../scripts/serve.js", import.meta.url));

const reaches = (host, port) => new Promise(done => {
  const socket = connect({ host, port, timeout: 2000 }, () => { socket.destroy(); done(true); });
  socket.on("error", () => done(false));
  socket.on("timeout", () => { socket.destroy(); done(false); });
});

test("the development server listens on 127.0.0.1 only", async (t) => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, [SERVE, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  t.after(() => server.kill());
  const line = await new Promise(ok => server.stdout.once("data", d => ok(String(d))));
  assert.match(line, /http:\/\/127\.0\.0\.1:/);
  assert.equal(await reaches("127.0.0.1", port), true);
  const outside = Object.values(networkInterfaces()).flat().filter(a => a && a.family === "IPv4" && !a.internal).map(a => a.address);
  if (!outside.length) { t.diagnostic("no network address on this computer to try from"); return; }
  for (const address of outside) assert.equal(await reaches(address, port), false, `answers on ${address}`);
});
