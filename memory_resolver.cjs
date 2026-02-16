// memory_resolver.cjs

const fs = require('fs');
const path = require('path');

const gridPath = path.join(__dirname, 'memory_grid.json');

/**
 * Load and parse the memory grid.
 * @returns {Array<Object>}
 */
function loadMemoryGrid() {
  try {
    const rawData = fs.readFileSync(gridPath, 'utf8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error('❌ Failed to load memory grid:', err.message);
    return [];
  }
}

/**
 * Find all entries with a specific tag.
 * @param {string} tag
 * @returns {Array<Object>}
 */
function findByTag(tag) {
  const grid = loadMemoryGrid();
  return grid.filter(entry => entry.tags && entry.tags.includes(tag));
}

/**
 * Find an entry by its unique ID.
 * @param {string} id
 * @returns {Object|null}
 */
function findById(id) {
  const grid = loadMemoryGrid();
  return grid.find(entry => entry.id === id) || null;
}

/**
 * Find an entry by a partial or full filename match.
 * @param {string} filename
 * @returns {Object|null}
 */
function findByFilename(filename) {
  const grid = loadMemoryGrid();
  return grid.find(entry => entry.filename === filename || entry.filename?.includes(filename)) || null;
}

module.exports = {
  loadMemoryGrid,
  findByTag,
  findById,
  findByFilename
};
