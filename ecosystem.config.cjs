// Sabian Ecosystem Config + Execution Hybrid — Hertzner Ready
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const masterLogPath = path.join(__dirname, 'recon_logs', 'master_loop_ping.log');
if (!fs.existsSync(path.dirname(masterLogPath))) fs.mkdirSync(path.dirname(masterLogPath), { recursive: true });

function logToMasterLoop(name, status) {
  const entry = `[${new Date().toISOString()}] [${name}] ${status}\n`;
  fs.appendFileSync(masterLogPath, entry);
  console.log(entry.trim());
}

module.exports = {
  apps: [
    { name: "sabian_brain", script: "sabian_brain.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_master_loop", script: "sabian_master_loop.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "continuous_learning", script: "continuous_learning.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_self_evolve", script: "sabian_self_evolve.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_learning_log", script: "sabian_learning_log.jsonl", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_learn", script: "sabian_learn.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "hive_backend", script: "hive_backend.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "hive_connector", script: "hive_connector.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "hive_orchestrator", script: "hive_orchestrator.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "hive_sync", script: "hive_sync.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_wizard", script: "sabian_wizard.cjs", args: "--admin", interpreter: "node", autorestart: true, restart_delay: 10000, out_file: "NUL", error_file: "NUL" },
    { name: "sabian_updater", script: "sabian_updater.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_reset_module", script: "sabian_reset_module.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "core_hash_validator", script: "generate_core_hash.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "smart_sabian", script: "smart_sabian.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "master_smart_sabian", script: "master_smart_sabian.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "generate_sabians", script: "generate_sabians.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "insight_engine", script: "insight_engine.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "insight_engine_py", script: "insight_engine.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_internal_recon", script: "sabian_internal_operational_recon.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_delta", script: "sabian_delta.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "elon_data_orbit", script: "elon_data_orbit.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_twitter_scan", script: "sabian_twitter_scan.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_multilang_podcast_builder", script: "sabian_multilang_podcast_builder.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_tweet", script: "sabian_tweet.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_orbit_scan", script: "sabian_orbit_scan.mjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_voice", script: "sabian_voice.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "voice_trainer", script: "voice_trainer.js", out_file: "NUL", error_file: "NUL" },
    { name: "voice_generator", script: "voice_generator.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_command_api", script: "sabian_command_api.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_grid_sync", script: "sabian_grid_sync.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "open_port", script: "open_port.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "logger", script: "logger.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "telemetryreceiver", script: "telemetryreceiver.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_executor", script: "mission_executor_military.cjs", interpreter: "node", autorestart: true, restart_delay: 15000, out_file: "NUL", error_file: "NUL" },
    { name: "sabian_mission_dashboard", script: "sabian_mission_dashboard.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_mission_feed", script: "sabian_mission_feed.js", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_memory_resolver", script: "sabian_memory_resolver.cjs", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_vertex", script: "sabian_vertex.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "smart_advisor", script: "smart_advisor.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_brain_manager", script: "sabian_brain_manager.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_evolve", script: "sabian_evolve.py", interpreter: "python", out_file: "NUL", error_file: "NUL" },
    { name: "sabian_global_governor", script: "sabian_global_governor.py", interpreter: "python", out_file: "NUL", error_file: "NUL" }
  ]
};

// Launcher logic with ping to Master Loop
function launch(name, command, args = []) {
  const proc = spawn(command, args);
  logToMasterLoop(name, 'STARTED');
  proc.stdout.on('data', data => logToMasterLoop(name, `OUT: ${data}`));
  proc.stderr.on('data', data => logToMasterLoop(name, `ERR: ${data}`));
  proc.on('exit', code => logToMasterLoop(name, `EXIT CODE: ${code}`));
}

module.exports.apps.forEach(app => {
  const isPython = app.interpreter === 'python';
  const command = isPython ? 'python' : 'node';
  const args = [app.script];
  launch(app.name, command, args);
});
