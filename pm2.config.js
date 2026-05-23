// pm2.config.js
// PM2 process config for VPS / dedicated server deployment
// Usage: pm2 start pm2.config.js
//        pm2 start pm2.config.js --env production
//
// On Railway: the start script uses node directly (Railway handles restarts)
// On VPS:     pm2-runtime handles the process lifecycle + cron scans

module.exports = {
  apps: [
    {
      // ── Sabian API ─────────────────────────────────────────────────────────────
      name:             'sabian-api',
      script:           'sabian_api.cjs',
      instances:        1,
      autorestart:      true,
      watch:            false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT:     process.env.PORT || '5000'
      }
    },
    {
      // ── Daily global scan — fires 0600 UTC ────────────────────────────────────
      name:         'sabian-scan',
      script:       'global_scan.cjs',
      cron_restart: '0 6 * * *',
      autorestart:  false,
      watch:        false,
      args:         '--save',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      // ── Grading pass — fires 0630 UTC, after scan persists to Supabase ────────
      name:         'sabian-grade',
      script:       'grading_pass.cjs',
      cron_restart: '30 6 * * *',
      autorestart:  false,
      watch:        false,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      // ── Weekly Supabase backup — fires every Sunday 0200 UTC ─────────────────
      name:         'sabian-backup',
      script:       'sabian_backup.cjs',
      cron_restart: '0 2 * * 0',
      autorestart:  false,
      watch:        false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
