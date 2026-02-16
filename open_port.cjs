/**
 * SABIAN.AI :: OPEN PORT INTERFACE
 * Military-Grade Data Intake System
 * v1.0 - Phoenix Protocol
 *
 * Accepts incoming JSON payloads from any external source
 * Normalizes input to Sabian core schema
 * Stores normalized data into local JSON storage
 *
 * Future-Proof: designed to expand with API keys, auth tokens, adapters, DB connectors
 */

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 3000;

// Middleware security hardening
app.use(helmet());
app.use(express.json({ limit: '5mb' })); // Restrict payload size
app.use(morgan('combined')); // Logging HTTP access

// Basic API Key auth (placeholder - upgrade later)
const API_KEY = process.env.SABIAN_API_KEY || 'DEMO_KEY';

app.post('/uploadData', async (req, res) => {
  const clientApiKey = req.headers['x-api-key'];

  if (clientApiKey !== API_KEY) {
    console.warn('Unauthorized access attempt detected.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const rawData = req.body;

    if (!rawData || typeof rawData !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    logEvent('Incoming data received.');

    // Save raw input log (timestamped)
    const rawFilename = `./logs/raw_${Date.now()}.json`;
    await fs.writeFile(rawFilename, JSON.stringify(rawData, null, 2));

    // Normalize input
    const normalizedData = normalizeData(rawData);

    // Validate normalized output
    const validationErrors = validateNormalized(normalizedData);
    if (validationErrors.length > 0) {
      logEvent('Normalization failed: ' + validationErrors.join('; '));
      return res.status(422).json({ error: 'Normalization failed', details: validationErrors });
    }

    // Write normalized data to central storage
    const dataFile = path.resolve(__dirname, 'user_data.json');
    await fs.writeFile(dataFile, JSON.stringify(normalizedData, null, 2));

    logEvent('Normalized data saved.');

    res.json({ status: 'success', saved: true });
  } catch (err) {
    logEvent('Exception: ' + err.message);
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Normalize raw incoming data into Sabian's internal schema.
 * This function should be expanded per integration needs.
 */
function normalizeData(data) {
  return {
    business_name: data.name || data.businessName || 'Unknown Business',
    revenue: parseNumeric(data.revenue) || 0,
    expenses: parseNumeric(data.expenses) || 0,
    growth_goal: Array.isArray(data.goals) ? data.goals : [],
    insights: '',
    strategy_ideas: '',
    podcast_script: '',
    audio_file: '',
    metadata: {
      source: data.source || 'unknown',
      ingested_at: new Date().toISOString(),
      hash: generateHash(JSON.stringify(data))
    }
  };
}

/**
 * Validate normalized schema fields
 */
function validateNormalized(record) {
  const errors = [];
  if (!record.business_name || record.business_name.trim() === '') {
    errors.push('Missing business_name');
  }
  if (typeof record.revenue !== 'number') {
    errors.push('Invalid revenue');
  }
  if (typeof record.expenses !== 'number') {
    errors.push('Invalid expenses');
  }
  return errors;
}

/**
 * Parse numeric input safely
 */
function parseNumeric(value) {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Generate hash for input traceability
 */
function generateHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Log internal event to console + append to log file
 */
async function logEvent(message) {
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  console.log(logMessage.trim());
  await fs.appendFile('./logs/sabian_port.log', logMessage);
}

// Ensure logs directory exists
fs.mkdir('./logs', { recursive: true }).catch(() => {});

app.listen(port, () => {
  console.log(`SABIAN OPEN PORT listening at http://localhost:${port}`);
});
