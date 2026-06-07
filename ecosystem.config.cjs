// ecosystem.config.cjs
// PM2 process configuration for Sabian Intelligence Platform
// Start all:    pm2 start ecosystem.config.cjs
// API only:     pm2 start ecosystem.config.cjs --only sabian-api
// Scanner only: pm2 start ecosystem.config.cjs --only sabian-scanner
// Status:       pm2 status
// Logs:         pm2 logs sabian-api

module.exports = {
  apps: [
    {
      // Unified Intelligence API — always running, serves dashboard + enterprise queries
      name: 'sabian-api',
      script: './sabian_api.cjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      error_file: './logs/api-error.log',
      out_file:   './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      // Daily global scan — 06:00 every day
      // Scores all 164 countries, persists to Supabase, fires threshold crossing alerts
      name: 'sabian-scanner',
      script: './global_scan.cjs',
      instances: 1,
      autorestart: false,
      cron_restart: '0 6 * * *',
      watch: false,
      env: { NODE_ENV: 'production' },
      error_file: './logs/scanner-error.log',
      out_file:   './logs/scanner-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
