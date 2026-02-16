// SABIAN BRAIN - MILITARY-GRADE ORCHESTRATOR
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFile = path.join(logDir, `sabian_brain_${new Date().toISOString().split('T')[0]}.log`);

function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    fs.appendFileSync(logFile, line + "\n");
}

log('🚀 SABIAN BRAIN BOOTED → initializing core modules...');

// STEP A: Start Wizard’s auto-repair loop
log('🛡️ Launching sabian_wizard auto-repair loop...');
const wizardProcess = exec('node sabian_wizard.cjs', (err, stdout, stderr) => {
    if (err) log(`❌ Wizard Error: ${stderr}`);
    log(stdout);
});

// STEP B: Run Insight Engine (initial pass)
function runInsight() {
    log('🧠 Running insight_engine.cjs...');
    const insightProcess = exec('node insight_engine.cjs', (err, stdout, stderr) => {
        if (err) log(`❌ Insight Engine Error: ${stderr}`);
        log(stdout);
        log('✅ Insight engine completed.');
        runVoice();
    });
}

// STEP C: Run Voice Generator
function runVoice() {
    log('🔊 Running voice_generator.cjs...');
    const voiceProcess = exec('node voice_generator.cjs', (err, stdout, stderr) => {
        if (err) log(`❌ Voice Generator Error: ${stderr}`);
        log(stdout);
        log('✅ Voice generation completed.');
    });
}

// STEP D: Monitor `/data` folder for new input
const dataFolder = path.join(__dirname, 'data');
if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder);
log(`👁️ Watching ${dataFolder} for new user data...`);
fs.watch(dataFolder, (eventType, filename) => {
    if (filename && eventType === 'change') {
        log(`📥 New data detected: ${filename}`);
        runInsight();
    }
});

// STEP E: Scheduled insight + voice every hour
const intervalMinutes = 60;
setInterval(() => {
    log(`🕒 Scheduled insight+voice trigger.`);
    runInsight();
}, intervalMinutes * 60 * 1000);

// FINAL: initial boot insight pass
runInsight();
