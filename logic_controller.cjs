// 🧠 SABIAN LOGIC CONTROLLER
// Dynamically routes experience tier, injects templates, and logs to hive_logs.json

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { logToHive } = require("./logger.cjs");



const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// === ROUTING FUNCTION ===
async function routeUserLogic(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("experience_type, email")
    .eq("id", userId)

    .single();

  if (error || !data) {
    console.error("❌ User not found or Supabase error:", error?.message);
    return null;
  }

  const { experience_type, email } = data;
  const experienceTier = experience_type?.toLowerCase();

  console.log(`📡 Routing for: ${email} [${experienceTier}]`);
console.log("🔎 Looking up user with ID:", userId);

const templatePath =
  experienceTier === "boardroom"
    ? "./boardroom_template.json"
    : "./conversational_template.json";


  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Missing template: ${templatePath}`);
    return null;
  }

  const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  return { experienceTier, template };
}



// === MAIN EXECUTION + LOGGING ===
function generatePodcast(userId, businessData) {
  routeUserLogic(userId).then((routed) => {
    if (!routed) return;

    const { experienceTier } = routed;
    const scriptPath =
      experienceTier === "boardroom"
        ? "./boardroom_podcast.cjs"
        : "./conversational_podcast.cjs";

    const payload = JSON.stringify(businessData);

    try {
     const output = execSync(`node ${scriptPath} "${payload.replace(/"/g, '\\"')}"`, {
  encoding: "utf8",
});

      console.log("🎧 Podcast Output:\n", output);

      const transcriptOnly = extractTranscript(output);
      const hiveEntry = {
        source: "sabian_logic_controller",
        level: "insight",
        event: `Podcast generated (${experienceTier})`,
        data: {
          user_id: userId,
          timestamp: new Date().toISOString(),
          experience: experienceTier,
          transcript: transcriptOnly,
          summary: summarizeProblem(transcriptOnly),
          tags: ["problem", "podcast", experienceTier]
        }
      };

      logToHive(hiveEntry);
    } catch (err) {
      console.error("❌ Podcast script error:", err.message);
    }
  });
}

// === TRANSCRIPT FILTER ===
function extractTranscript(outputText) {
  const lines = outputText.split("\n").filter(Boolean);
  return lines
    .filter((line) => line.includes("Sabian:") || line.includes("Host A:"))
    .join("\n");
}

// === ROUGH PROBLEM SUMMARY ===
function summarizeProblem(text) {
  const firstLine = text.split("\n").find((l) => l.includes("Sabian:")) || "N/A";
  return firstLine.slice(0, 180);
}



