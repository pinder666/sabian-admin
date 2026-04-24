/**
 * fitbit_reauth.cjs
 *
 * Re-authorizes the Fitbit connection when the refresh token has expired.
 * Starts a local server, opens the browser to Fitbit's OAuth page,
 * captures the redirect, exchanges the code for new tokens, and
 * writes FITBIT_ACCESS_TOKEN + FITBIT_REFRESH_TOKEN back to .env
 *
 * Run: node vrtx/connectors/fitbit_reauth.cjs
 */

const path    = require("path");
const fs      = require("fs");
const http    = require("http");
const { exec } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const axios = require("axios");

const CLIENT_ID     = process.env.FITBIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET;
const ENV_PATH      = path.join(__dirname, "..", "..", ".env");
const PORT          = 8088;
const REDIRECT_URI  = `http://localhost:${PORT}/callback`;

const SCOPES = [
  "profile",
  "sleep",
  "activity",
  "heartrate",
  "respiratory_rate",
  "oxygen_saturation"
].join("%20");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing FITBIT_CLIENT_ID or FITBIT_CLIENT_SECRET in .env");
  process.exit(1);
}

// Build the Fitbit authorization URL
const AUTH_URL =
  `https://www.fitbit.com/oauth2/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&response_type=code` +
  `&scope=${SCOPES}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&expires_in=604800`;

// Update a key in the .env file (preserves all other lines)
function updateEnv(key, value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    content = content.trimEnd() + "\n" + line + "\n";
  }
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

// Open URL in the default browser (Windows / Mac / Linux)
function openBrowser(url) {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` :
    process.platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log("Could not open browser automatically. Open this URL manually:\n", url);
  });
}

async function exchangeCode(code) {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await axios.post(
    "https://api.fitbit.com/oauth2/token",
    new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    }).toString(),
    {
      headers: {
        Authorization:  `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );
  return res.data;
}

// Start local callback server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code  = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h2>Authorization denied: ${error}</h2><p>Close this tab and try again.</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h2>No code received.</h2><p>Close this tab and try again.</p>");
    server.close();
    process.exit(1);
  }

  try {
    console.log("Authorization code received. Exchanging for tokens...");
    const tokens = await exchangeCode(code);

    // Save to .env
    updateEnv("FITBIT_ACCESS_TOKEN",  tokens.access_token);
    updateEnv("FITBIT_REFRESH_TOKEN", tokens.refresh_token);

    // Also update process.env for any same-session use
    process.env.FITBIT_ACCESS_TOKEN  = tokens.access_token;
    process.env.FITBIT_REFRESH_TOKEN = tokens.refresh_token;

    console.log("✅ Fitbit tokens refreshed and saved to .env");
    console.log("   Access token:  " + tokens.access_token.slice(0, 20) + "...");
    console.log("   Refresh token: " + tokens.refresh_token.slice(0, 20) + "...");
    console.log("\nYou can now run: node vrtx/connectors/fitbit_pull.cjs");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:500px">
        <h2 style="color:green">✅ Fitbit Connected</h2>
        <p>Tokens saved. Close this tab and return to the terminal.</p>
        <p style="color:#888;font-size:12px">Access token expires in ${Math.round(tokens.expires_in / 3600)} hours.</p>
      </body></html>
    `);

    server.close();
  } catch (err) {
    const detail = err?.response?.data || err.message;
    console.error("Token exchange failed:", detail);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h2>Token exchange failed</h2><pre>${JSON.stringify(detail, null, 2)}</pre>`);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("===========================================");
  console.log("  VRTX — Fitbit Re-Authorization");
  console.log("===========================================");
  console.log(`\nLocal callback server running on port ${PORT}`);
  console.log("Opening Fitbit authorization page in your browser...\n");
  openBrowser(AUTH_URL);
  console.log("If the browser did not open, go to this URL manually:");
  console.log(AUTH_URL);
  console.log("\nWaiting for Fitbit to redirect back...");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Kill that process and try again.`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
