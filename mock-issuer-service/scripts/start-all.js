#!/usr/bin/env node
/**
 * Single entry point that wires up and starts the full PDI (Presentation During
 * Issuance) demo stack from the mock-issuer-service:
 *
 *   1. Prompts for the two public tunnel URLs the flow needs (issuer + OVP
 *      verifier backend) and patches them into the relevant source files. Any
 *      tunnel that exposes a local port over public HTTPS works.
 *   2. Starts the OVP verifier backend (openid4vp-service, port 3000), which the
 *      issuer calls during PDI to build the verifier's authorization request.
 *   3. Starts this issuer service itself (port 4000). The PDI verifier request
 *      (spec version, client ID prefix, request mode, signing, presentation
 *      definition / DCQL query) is configured entirely on this service's own
 *      `/qr` page (select the "PDI" flow) - see src/as/verifier-config.js.
 *
 * The OVP verifier UI (ovp-client, port 3001) is only useful for standalone
 * testing of the verifier and is NOT started by default. Pass `--with-ui`
 * (or set START_OVP_UI=true) to start it alongside the rest.
 *
 * Run with: npm start (from mock-issuer-service)
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import http from "http";
import https from "https";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ISSUER_DIR = path.resolve(__dirname, "..");
const OVP_DIR = path.resolve(ISSUER_DIR, "..", "openid4vp-service");
const OVP_CLIENT_DIR = path.join(OVP_DIR, "ovp-client");

const ISSUER_PROFILE_FILE = path.join(ISSUER_DIR, "src", "issuer-profile.js");
const OVP_CONSTANTS_FILE = path.join(OVP_DIR, "constants.js");

const ISSUER_PORT = 4000;
const OVP_BACKEND_PORT = 3000;
const OVP_CLIENT_PORT = 3001;

// The OVP verifier UI is optional - only start it when explicitly requested,
// since the PDI flow itself does not depend on it.
const START_OVP_UI =
  process.argv.includes("--with-ui") || process.env.START_OVP_UI === "true";

function readCurrentIssuerUrl() {
  const data = fs.readFileSync(ISSUER_PROFILE_FILE, "utf8");
  const match = data.match(/export const ISSUER =[^"]*"([^"]+)"/);
  return match ? match[1] : "";
}

function readCurrentOvpBaseUrl() {
  const data = fs.readFileSync(OVP_CONSTANTS_FILE, "utf8");
  const match = data.match(/const baseUrl =[^"]*"([^"]+)"/);
  return match ? match[1] : "";
}

function writeIssuerUrl(url) {
  const data = fs.readFileSync(ISSUER_PROFILE_FILE, "utf8");
  const updated = data.replace(
    /(export const ISSUER =[^"]*")[^"]+(")/,
    `$1${url}$2`
  );
  fs.writeFileSync(ISSUER_PROFILE_FILE, updated, "utf8");
}

function writeOvpBaseUrl(url) {
  const data = fs.readFileSync(OVP_CONSTANTS_FILE, "utf8");
  const updated = data.replace(
    /(const baseUrl =[^"]*")[^"]+(")/,
    `$1${url}$2`
  );
  fs.writeFileSync(OVP_CONSTANTS_FILE, updated, "utf8");
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function stripTrailingSlash(url) {
  return url.trim().replace(/\/+$/, "");
}

async function promptForPublicUrls() {
  const currentIssuerUrl = readCurrentIssuerUrl();
  const currentOvpUrl = readCurrentOvpBaseUrl();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Use the readline stream directly (rather than nested rl.question calls) since
  // rl.question can silently drop the second prompt's answer when stdin is piped or
  // redirected rather than an interactive TTY (e.g. in automated test harnesses).
  const lines = rl[Symbol.asyncIterator]();

  console.log("\n=== PDI Flow Setup ===");
  console.log(
    "This flow needs both services exposed over public HTTPS so wallets can reach them."
  );
  console.log(
    `Expose port ${ISSUER_PORT} (issuer) and port ${OVP_BACKEND_PORT} (OVP verifier backend)`
  );
  console.log(
    "with the tunnel of your choice, then paste the resulting public URLs below.\n"
  );

  process.stdout.write(
    `Issuer public URL (port ${ISSUER_PORT}) [press Enter to keep "${currentIssuerUrl}"]: `
  );
  const issuerAnswer = (await lines.next()).value ?? "";

  process.stdout.write(
    `OVP verifier backend public URL (port ${OVP_BACKEND_PORT}) [press Enter to keep "${currentOvpUrl}"]: `
  );
  const ovpAnswer = (await lines.next()).value ?? "";

  rl.close();

  const issuerUrl = issuerAnswer.trim() ? stripTrailingSlash(issuerAnswer) : currentIssuerUrl;
  const ovpUrl = ovpAnswer.trim() ? stripTrailingSlash(ovpAnswer) : currentOvpUrl;

  if (issuerAnswer.trim()) {
    writeIssuerUrl(issuerUrl);
    console.log(`Updated issuer-profile.js ISSUER -> ${issuerUrl}`);
  }
  if (ovpAnswer.trim()) {
    writeOvpBaseUrl(ovpUrl);
    console.log(`Updated openid4vp-service/constants.js baseUrl -> ${ovpUrl}`);
  }

  return { issuerUrl, ovpUrl };
}

const children = [];

function spawnService({ label, command, args, cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
    // Run in its own process group (POSIX) so we can kill the whole tree on
    // shutdown - npm/react-scripts spawn grandchild processes that don't
    // always exit when only the direct child receives SIGTERM.
    detached: process.platform !== "win32",
  });

  const prefix = `[${label}]`;

  const pipe = (stream, target) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach((line) => target.write(`${prefix} ${line}\n`));
    });
  };

  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("exit", (code, signal) => {
    console.log(`${prefix} exited (code=${code}, signal=${signal})`);
  });

  children.push(child);
  return child;
}

function shutdown() {
  console.log("\nShutting down all services...");
  children.forEach((child) => {
    if (child.killed) return;
    try {
      // Negative PID targets the whole process group we created via `detached`,
      // so npm/react-scripts grandchild processes are also terminated.
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      child.kill("SIGTERM");
    }
  });
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function waitForPort(port, { timeoutMs = 20000, intervalMs = 500, useHttps = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  const client = useHttps ? https : http;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = client.get(
        { host: "localhost", port, path: "/", timeout: 1000, rejectUnauthorized: false },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.on("error", () => {
        if (Date.now() > deadline) return resolve(false);
        setTimeout(attempt, intervalMs);
      });
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() > deadline) return resolve(false);
        setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

async function main() {
  const { issuerUrl, ovpUrl } = await promptForPublicUrls();

  console.log("\nStarting services...\n");

  // OVP verifier backend - server-to-server calls from the issuer stay on
  // localhost even though the backend also exposes itself publicly (ovpUrl)
  // for wallet-facing endpoints such as request_uri/response_uri.
  spawnService({
    label: "OVP-BACKEND",
    command: "node",
    args: ["app.js"],
    cwd: OVP_DIR,
  });

  // OVP verifier UI - useful for standalone testing of the verifier itself,
  // but not required by the PDI flow, so only start it when requested.
  if (START_OVP_UI) {
    spawnService({
      label: "OVP-UI",
      command: "npm",
      args: ["start"],
      cwd: OVP_CLIENT_DIR,
    });
  }

  // Issuer service itself.
  spawnService({
    label: "ISSUER",
    command: "node",
    args: ["src/server.js"],
    cwd: ISSUER_DIR,
    env: {
      VERIFIER_BASE_URL: process.env.VERIFIER_BASE_URL || `http://localhost:${OVP_BACKEND_PORT}`,
    },
  });

  const [ovpUp, issuerUp, ovpUiUp] = await Promise.all([
    waitForPort(OVP_BACKEND_PORT),
    waitForPort(ISSUER_PORT, { useHttps: true }),
    START_OVP_UI ? waitForPort(OVP_CLIENT_PORT, { timeoutMs: 60000 }) : Promise.resolve(null),
  ]);

  console.log("\n=== PDI Flow Ready ===");
  console.log(`OVP verifier backend : http://localhost:${OVP_BACKEND_PORT} ${ovpUp ? "✅" : "⚠️  not responding yet"} (public: ${ovpUrl || "not set"})`);
  if (START_OVP_UI) {
    console.log(`OVP verifier UI      : http://localhost:${OVP_CLIENT_PORT} ${ovpUiUp ? "✅" : "⚠️  not responding yet"}`);
  }
  console.log(`Issuer service       : https://mock-issuer.local:${ISSUER_PORT} ${issuerUp ? "✅" : "⚠️  not responding yet"} (public: ${issuerUrl || "not set"})`);
  console.log("\nOpen the issuer's /qr page, select the \"PDI\" flow, and configure the verifier request there (spec version, client ID prefix, request mode, signing, presentation definition / DCQL query).");
  console.log("Press Ctrl+C to stop all services.\n");
}

main().catch((error) => {
  console.error("Failed to start PDI flow:", error);
  shutdown();
});
