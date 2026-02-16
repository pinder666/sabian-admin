const buildLogger = require('./tracking_build_logger.py'); // Python, runs standalone
const supabaseTracker = require('./tracking_supabase.cjs');
const gptTracker = require('./tracking_gpt.cjs');
const n8nTracker = require('./tracking_n8n.cjs');

module.exports = {
  supabaseTracker,
  gptTracker,
  n8nTracker
  // tracking_build_logger is invoked separately
};
