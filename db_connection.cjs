// Example: Users table
async function createUsersTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await db.query(query);
}

// Example: Agents table
async function createAgentsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS agents (
      id SERIAL PRIMARY KEY,
      type VARCHAR(255),
      status VARCHAR(255),
      last_active TIMESTAMP
    );
  `;
  await db.query(query);
}

// Example: Podcasts table
async function createPodcastsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS podcasts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      script TEXT,
      audio_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await db.query(query);
}

async function initDB() {
  await createUsersTable();
  await createAgentsTable();
  await createPodcastsTable();
}

module.exports = { initDB };
