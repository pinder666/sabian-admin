const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const fs = require("fs");
const axios = require("axios");

const OUT_DIR = path.join(__dirname, "..", "input", "vta");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sanitizeSlug(value) {
  return (
    String(value || "user")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "user"
  );
}

function readEnvFile() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  const env = {};
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }

  return { envPath, env };
}

function writeEnvFile(envPath, env) {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n"), "utf8");
}

async function refreshAccessToken() {
  const { envPath, env } = readEnvFile();
  const clientId = env.FITBIT_CLIENT_ID;
  const clientSecret = env.FITBIT_CLIENT_SECRET;
  const refreshToken = env.FITBIT_REFRESH_TOKEN;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await axios.post(
    "https://api.fitbit.com/oauth2/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 60000
    }
  );

  env.FITBIT_ACCESS_TOKEN = res.data.access_token;
  env.FITBIT_REFRESH_TOKEN = res.data.refresh_token;
  env.FITBIT_TOKEN_JASON = res.data.access_token;

  writeEnvFile(envPath, env);

  process.env.FITBIT_ACCESS_TOKEN = res.data.access_token;
  process.env.FITBIT_REFRESH_TOKEN = res.data.refresh_token;
  process.env.FITBIT_TOKEN_JASON = res.data.access_token;

  return res.data.access_token;
}

async function fitbitGet(url, accessToken) {
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 60000
    });
    return res.data;
  } catch (err) {
    const expired = err?.response?.data?.errors?.some(
      e => e.errorType === "expired_token"
    );

    if (!expired) throw err;

    const newToken = await refreshAccessToken();

    const retry = await axios.get(url, {
      headers: { Authorization: `Bearer ${newToken}` },
      timeout: 60000
    });

    return retry.data;
  }
}

async function pullOneMember(member) {
  const today = new Date().toISOString().slice(0, 10);

  let accessToken = process.env[member.token_env] || process.env.FITBIT_ACCESS_TOKEN;
  if (!accessToken) {
    accessToken = await refreshAccessToken();
  }

  const [profile, sleep, activity, heart, heartIntraday] = await Promise.all([
    fitbitGet("https://api.fitbit.com/1/user/-/profile.json", accessToken),
    fitbitGet(`https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`, accessToken),
    fitbitGet(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`, accessToken),
    fitbitGet(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`, accessToken),
    fitbitGet(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d/1min.json`, accessToken)
  ]);

  const payload = {
    pulled_at: new Date().toISOString(),
    source: "fitbit_api",
    date: today,
    vta_member: {
      name: member.name,
      slug: member.slug
    },
    profile,
    sleep,
    activity,
    heart,
    heartIntraday
  };

  const outPath = path.join(OUT_DIR, `${member.slug}.json`);
  writeJson(outPath, payload);

  return {
    name: member.name,
    slug: member.slug,
    file: outPath
  };
}

async function main() {
  const membersPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, "..", "input", "vta", "vta_members.json");

  if (!fs.existsSync(membersPath)) {
    throw new Error(`Missing members file: ${membersPath}`);
  }

  const membersRaw = JSON.parse(fs.readFileSync(membersPath, "utf8"));
  const members = Array.isArray(membersRaw.members) ? membersRaw.members : [];

  if (!members.length) {
    throw new Error("No members found in vta_members.json");
  }

  const normalizedMembers = members.map(member => ({
    name: member.name,
    slug: sanitizeSlug(member.slug || member.name),
    token_env: member.token_env
  }));

  const results = [];

  for (const member of normalizedMembers) {
    const result = await pullOneMember(member);
    results.push(result);
    console.log(`Pulled Fitbit data for ${member.name} -> ${result.file}`);
  }

  const manifestPath = path.join(OUT_DIR, "vta_manifest.json");
  writeJson(manifestPath, {
    generated_at: new Date().toISOString(),
    members: results
  });

  console.log("VTA pull complete");
  console.log("Manifest:", manifestPath);
}

main().catch(err => {
  console.error("VTA Fitbit pull error:", err.response?.data || err.message);
  process.exitCode = 1;
});