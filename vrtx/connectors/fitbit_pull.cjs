const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const fs = require("fs");
const axios = require("axios");

const OUT_DIR = path.join(__dirname, "..", "input");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function refreshAccessToken() {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const refreshToken = process.env.FITBIT_REFRESH_TOKEN;

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
      }
    }
  );

  process.env.FITBIT_ACCESS_TOKEN = res.data.access_token;
  process.env.FITBIT_REFRESH_TOKEN = res.data.refresh_token;

  console.log("Refreshed Fitbit token");

  return res.data.access_token;
}

async function fitbitGet(url) {
  let token = process.env.FITBIT_ACCESS_TOKEN;

  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  } catch (err) {
    const errors = err?.response?.data?.errors || [];
    const expired = errors.some(e =>
      e.errorType === "expired_token" || e.errorType === "invalid_token"
    );

    if (!expired) throw err;

    token = await refreshAccessToken();

    const retry = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return retry.data;
  }
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const today = ymd(d);

  const profile = await fitbitGet("https://api.fitbit.com/1/user/-/profile.json");
  const sleep = await fitbitGet(`https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`);
  const activity = await fitbitGet(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`);
  const heart = await fitbitGet(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`);
  const heartIntraday = await fitbitGet(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d/1min.json`);

  const payload = {
    pulled_at: new Date().toISOString(),
    source: "fitbit_api",
    date: today,
    profile,
    sleep,
    activity,
    heart,
    heartIntraday
  };

  const outPath = path.join(OUT_DIR, "fitbit_latest.json");
  writeJson(outPath, payload);

  console.log("Fitbit pull complete");
  console.log("Saved:", outPath);
}

main().catch(err => {
  console.error("Fitbit pull error:", err.response?.data || err.message);
});