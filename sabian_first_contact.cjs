// sabian_first_contact.cjs — First Integration Ritual (Dept-Aware)

const fs = require('fs');
const path = require('path');
const { logToHive } = require('./logger.cjs');
const { hiveBroadcast } = require('./sabian.cjs');

const userId = process.argv[2] || 'unknown_user';
const departments = process.argv.slice(3); // Pass departments as args
const userFilePath = path.join(__dirname, 'users', 'indexed', userId.slice(0, 2), `${userId}.json`);

function generateInitialInsight(department) {
  return {
    department,
    first_insight: `${department} shows room for automated optimization and pattern insight discovery.`,
    confidence_score: 0.82,
    roadmap: {
      short_term: [
        'Run delay monitor',
        'Log user friction',
        'Setup ritual prompts'
      ],
      long_term: `Model ${department} for AI-driven improvement.`
    },
    tags: ['onboarding', 'automation', department]
  };
}

function writeReflection(departmentInsight) {
  const reflectionLine = JSON.stringify({
    timestamp: new Date().toISOString(),
    user_id: userId,
    ...departmentInsight
  }) + '\n';
  fs.appendFileSync(path.join(__dirname, 'sabian_reflections.jsonl'), reflectionLine);
}

function pushDeltaMap(departmentInsight) {
  const deltaPath = path.join(__dirname, 'sabian_delta_map.json');
  let deltas = [];
  try {
    if (fs.existsSync(deltaPath)) deltas = JSON.parse(fs.readFileSync(deltaPath, 'utf8'));
  } catch {}

  deltas.push({
    file: `users/indexed/${userId.slice(0, 2)}/${userId}.json`,
    reason: 'initial_ritual_trigger',
    tags: departmentInsight.tags,
    timestamp: new Date().toISOString(),
    confidence: departmentInsight.confidence_score
  });

  fs.writeFileSync(deltaPath, JSON.stringify(deltas, null, 2));
}

function updateUserFile(departmentInsight) {
  if (!fs.existsSync(userFilePath)) return;
  const userData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
  userData.departments = userData.departments || {};
  userData.departments[departmentInsight.department] = departmentInsight.roadmap;
  userData.connection_history = userData.connection_history || [];
  userData.connection_history.push({
    connected_to: departmentInsight.department,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
}

function run() {
  if (!departments.length) {
    console.log('❗ No departments provided.');
    return;
  }

  departments.forEach((dept) => {
    const insight = generateInitialInsight(dept);

    logToHive({
      source: 'sabian_first_contact',
      level: 'info',
      event: `Initial ritual for ${dept}`,
      data: { userId, ...insight },
      tags: insight.tags
    });

    writeReflection(insight);
    pushDeltaMap(insight);
    updateUserFile(insight);
    hiveBroadcast({ problem_id: `${userId}_${dept}_${Date.now()}` });
  });

  console.log(`✅ Sabian completed initial ritual for: ${departments.join(', ')}`);
}

run();
