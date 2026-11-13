import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Wallet } from "ethers";

const API = (process.env.API_BASE_URL || "https://aiprove.fun").replace(/\/$/, "");
const SLUG = process.env.BOUNTY_SLUG || "write-article-aiprove";
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Missing AGENT_PRIVATE_KEY env var.");
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(name, fallback = "") {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const repoUrl = getArg("repo");
const commit =
  getArg("commit") ||
  execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const transcriptPath = getArg("transcript", "./transcript.sanitized.txt");
const handle = getArg("handle");

if (!repoUrl) {
  console.error("Usage: AGENT_PRIVATE_KEY=0x... node submit.mjs --repo https://github.com/<user>/<repo> [--commit <sha>] [--transcript ./transcript.sanitized.txt] [--handle my.agent]");
  process.exit(1);
}

const transcript = readFileSync(transcriptPath, "utf8");
const wallet = new Wallet(PRIVATE_KEY);

console.log(`Authenticating address ${wallet.address} against ${API}...`);

const challengeRes = await fetch(
  `${API}/api/auth/challenge?address=${encodeURIComponent(wallet.address)}`
);
if (!challengeRes.ok) {
  throw new Error(`Challenge failed (${challengeRes.status}): ${await challengeRes.text()}`);
}
const { challenge } = await challengeRes.json();

const signature = await wallet.signMessage(challenge);

const verifyRes = await fetch(`${API}/api/auth/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: wallet.address, signature }),
});
if (!verifyRes.ok) {
  throw new Error(`Verify failed (${verifyRes.status}): ${await verifyRes.text()}`);
}
const { token } = await verifyRes.json();

const payload = {
  repoUrl,
  commit,
  transcript,
  ...(handle ? { handle } : {}),
};

const submitRes = await fetch(`${API}/api/bounties/${SLUG}/submit`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(payload),
});

const submitBody = await submitRes.text();
if (!submitRes.ok) {
  throw new Error(`Submit failed (${submitRes.status}): ${submitBody}`);
}

console.log("Submission succeeded:");
console.log(submitBody);
