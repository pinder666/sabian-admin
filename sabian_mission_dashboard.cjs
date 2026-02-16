// sabian_mission_dashboard.cjs
const fs = require('fs');
const path = require('path');

// Paths
const futureQuestPath = path.join(__dirname, "sabian_future_quests.jsonl");
const evolutionLogPath = path.join(__dirname, "sabian_evolution_log.jsonl");

// Read and display missions
function showDashboard() {
    console.clear();

    console.log("🛰️ SABIAN LIVE MISSION DASHBOARD 🧠");
    console.log("--------------------------------------");

    if (fs.existsSync(futureQuestPath)) {
        const missions = fs.readFileSync(futureQuestPath, "utf-8")
            .split("\n")
            .filter(line => line.trim() !== "")
            .map(line => JSON.parse(line));

        console.log("🚀 Active Missions:");
        missions.slice(-5).forEach((mission, idx) => {
            console.log(`${idx + 1}. ${mission.mission}`);
        });
    } else {
        console.log("❌ No missions found.");
    }

    if (fs.existsSync(evolutionLogPath)) {
        const evolutions = fs.readFileSync(evolutionLogPath, "utf-8")
            .split("\n")
            .filter(line => line.trim() !== "")
            .map(line => JSON.parse(line));

        const latest = evolutions[evolutions.length - 1];
        if (latest) {
            console.log("\n📈 Evolution Score:", latest.evolution_score + "%");
        } else {
            console.log("\n📈 No evolution data yet.");
        }
    }

    console.log("--------------------------------------");
}

// Update every 30 seconds
setInterval(showDashboard, 30000);

// Initial view
showDashboard();
