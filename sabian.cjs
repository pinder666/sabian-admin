// 📂 SABIAN IMMORTAL CORE SYSTEM: CONNECTION + LOOP + WIZARD INTEGRATION

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger.cjs');

// === 1. SMART CONNECTION PORT === //
function connectToExternalSystem({ userId, platform, authToken }) {
  const userFilePath = generateUserFilePath(userId);
  const isFirstConnection = !fs.existsSync(generateRoadmapFilePath(userId));

  const connectionMeta = {
    platform,
    status: 'connected',
    timestamp: new Date().toISOString(),
    auth_type: 'token'
  };

  const userData = loadOrCreateUser(userFilePath, userId);
  userData.last_connection = connectionMeta.timestamp;
  saveJSON(userFilePath, userData);

  logAction('USER_CONNECTED', { user_id: userId, platform });
  logger.log('event', 'USER_CONNECTED', { user_id: userId, platform });
  flagDelta('user_profile', userId);

  if (isFirstConnection) {
    runInitialRitual(userId);
  }

  console.log(`🔌 Connected ${userId} to ${platform}.`);
}

// === 2. SMART SABINA ONBOARDING === //
function onboardUser({ email }) {
  const userId = crypto.randomUUID().slice(0, 8);
  const userFilePath = generateUserFilePath(userId);

  const newUser = {
    user_id: userId,
    cc_token: null,
    problems_generated: [],
    billing_history: [],
    last_connection: null,
    plan: 'Starter',
    notes: 'New onboard via Smart Sabina'
  };

  saveJSON(userFilePath, newUser);
  updateIndex(userId, userFilePath);
  logAction('USER_ONBOARDED', { user_id: userId, email });
  logger.log('event', 'USER_ONBOARDED', { user_id: userId, email });

  console.log(`🤖 Smart Sabina onboarded user: ${userId}`);
  return userId;
}

// === 3. INITIAL RITUAL GENERATION === //
function runInitialRitual(userId) {
  const roadmap = {
    user_id: userId,
    journey_stage: 'Uncharted',
    focus_tags: [],
    problems: [],
    next_steps: ['Initial scan', 'Establish baseline metrics']
  };

  const filePath = generateRoadmapFilePath(userId);
  saveJSON(filePath, roadmap);
  logAction('INITIAL_RITUAL_TRIGGERED', { user_id: userId });
  logger.log('event', 'INITIAL_RITUAL_TRIGGERED', { user_id: userId });

  const reflection = {
    timestamp: new Date().toISOString(),
    user_id: userId,
    reflection: 'Initial connection established. Baseline insights queued.',
    next_action: 'Begin active monitoring'
  };
  appendReflection(reflection);

  console.log(`🌀 Initial Ritual launched for user: ${userId}`);
}

// === 4. SABIAN CONTINUOUS MONITOR LOOP === //
function startSabianLoop() {
  console.log("🧠 Sabian Core Activated");
  setInterval(() => {
    checkForTriggers();
  }, 5000);
}

function checkForTriggers() {
  // Placeholder for scanning sync queue, change flags, new users, etc.
  logger.log('event', 'SABIAN_LOOP_HEARTBEAT', { message: 'Heartbeat check at ' + new Date().toISOString() });
}

// === 5. HIVE ECOSYSTEM LAYER === //
function hiveBroadcast(problemSignature) {
  console.log(`📡 Hive broadcast: ${problemSignature.problem_id} tagged as valuable insight.`);
}

// === UTILITIES === //
function generateUserFilePath(userId) {
  const shard = userId.slice(0, 2);
  return path.join(__dirname, 'users', 'indexed', shard, `${userId}.json`);
}

function generateRoadmapFilePath(userId) {
  return path.join(__dirname, 'users', 'roadmap', `roadmap_${userId}.json`);
}

function loadOrCreateUser(filePath, userId) {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath));
  } else {
    const user = { user_id: userId, problems_generated: [], billing_history: [] };
    saveJSON(filePath, user);
    return user;
  }
}

function saveJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function updateIndex(userId, userFilePath) {
  const indexPath = path.join(__dirname, 'users', 'index.json');
  let index = {};
  if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath));
  index[userId] = userFilePath;
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

function logAction(action, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    ...data
  };
  const logPath = path.join(__dirname, 'users', 'activity.log');
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
}

function flagDelta(fileType, userId) {
  const deltaPath = path.join(__dirname, 'sabian_delta_map.json');
  const delta = {
    file: `${fileType}_${userId}`,
    reason: 'new_connection',
    timestamp: new Date().toISOString()
  };
  const existing = fs.existsSync(deltaPath) ? JSON.parse(fs.readFileSync(deltaPath)) : [];
  existing.push(delta);
  fs.writeFileSync(deltaPath, JSON.stringify(existing, null, 2));
}

function appendReflection(reflection) {
  const refPath = path.join(__dirname, 'sabian_reflections.jsonl');
  fs.appendFileSync(refPath, JSON.stringify(reflection) + '\n');
}

module.exports = {
  onboardUser,
  connectToExternalSystem,
  runInitialRitual,
  startSabianLoop
};
