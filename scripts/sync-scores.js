const fs = require("fs");
const path = require("path");

const UUID = "37108a0e-3c95-496a-89de-7df8123121e7";
const FILE = path.join(__dirname, "..", "scores.json");
const MAX = 50;
const MAX_SCORE = 9999;

function cleanName(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12) || "PILOT";
}

function merge(existing, incoming) {
  const map = new Map();
  for (const row of existing.concat(incoming)) {
    const name = cleanName(row.name);
    const score = Math.min(MAX_SCORE, Math.max(0, Number(row.score) || 0));
    const at = Number(row.at) || 0;
    if (!score) continue;
    const prev = map.get(name);
    if (!prev || score > prev.score || (score === prev.score && at < prev.at)) {
      map.set(name, { name, score, at: at || Date.now() });
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, MAX);
}

async function main() {
  let existing = { scores: [] };
  try { existing = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (_) {}

  let incoming = [];
  try {
    const res = await fetch(`https://webhook.site/token/${UUID}/requests?sorting=newest&per_page=100`);
    if (res.ok) {
      const json = await res.json();
      const rows = Array.isArray(json) ? json : (json.data || []);
      for (const req of rows) {
        if (!req || !req.content) continue;
        try {
          const body = typeof req.content === "string" ? JSON.parse(req.content) : req.content;
          incoming.push({
            name: body.name,
            score: body.score,
            at: Date.parse(req.created_at) || Date.now(),
          });
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error("webhook fetch failed", err.message);
  }

  const scores = merge(existing.scores || [], incoming);
  fs.writeFileSync(FILE, JSON.stringify({ scores }, null, 2) + "\n");
  console.log("wrote", scores.length, "scores");
}

main();
