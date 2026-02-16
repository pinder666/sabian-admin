// sabian_master_loop.cjs
const { exec } = require('child_process');

// Helper to run a script
function runScript(script) {
    exec(`node ${script}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error running ${script}:\n`, error.message);
            return;
        }
        console.log(`✅ Output from ${script}:\n${stdout}`);
    });
}

// MAIN AUTO-LOOP
console.log("🚀 Sabian Master Loop Running...");

// First launch: Self-Evolution
runScript('sabian_self_evolution.cjs');

// Wait 5 seconds ➔ Then Future Quest
setTimeout(() => {
    runScript('sabian_future_quest.cjs');
}, 5000);

// Every 5 minutes: Loop both again
setInterval(() => {
    runScript('sabian_self_evolution.cjs');

    setTimeout(() => {
        runScript('sabian_future_quest.cjs');
    }, 5000);
}, 5 * 60 * 1000); // 5 minutes
