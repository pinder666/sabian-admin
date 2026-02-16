const { exec } = require('child_process');

function runScript(script) {
    exec(`node ${script}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error running ${script}:`, error.message);
            return;
        }
        console.log(`✅ Output from ${script}:\n${stdout}`);
    });
}

console.log("🧠 Sabian Deep Core Learning Engine Running...");

const scriptsToRun = [
    'sabian_self_evolution.cjs',
    'sabian_future_quest.cjs',
    // ➔ Add more scripts here (fetch_nasa_data.js, fetch_imf_data.js, etc)
];

// Initial run
scriptsToRun.forEach(script => {
    runScript(script);
});

// Repeat every 10 minutes
setInterval(() => {
    scriptsToRun.forEach(script => {
        runScript(script);
    });
}, 10 * 60 * 1000);
