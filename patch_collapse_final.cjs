// patch_collapse_final.cjs
// Replaces the single return/sort line in getLatestScores with:
//  1. canonical collapse (Ivory Coast fragments -> one country)
//  2. defunct drop (Yugoslavia, Czechoslovakia etc. off the LIVE board)
//  3. live-first sort (today's countries rank above old foundation rows)
// Matches the exact current line. Read-layer only.
// Run: node patch_collapse_final.cjs

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'sabian_persistence.cjs');
let src = fs.readFileSync(FILE, 'utf8');

const OLD = `    return Object.values(latest).sort((a, b) => (b.convergence_score || 0) - (a.convergence_score || 0));
  } catch (err) {
    console.error('[getLatestScores]', err.message);
    return { error: err.message };
  }
}`;

const NEW = `    // 1. CANONICAL COLLAPSE: fold name fragments into one country (Ivory Coast etc.)
    const collapsed = {};
    for (const row of Object.values(latest)) {
      const canon = (typeof resolveCanonical === 'function') ? resolveCanonical(row.country) : row.country;
      const def = (typeof isDefunct === 'function') ? isDefunct(row.country) : false;
      const cur = collapsed[canon];
      const rowYear = row.year || 0;
      const better = !cur
        || (row.is_live && !cur.is_live)
        || (row.is_live === cur.is_live && rowYear > (cur.year || 0));
      if (better) collapsed[canon] = { ...row, country: canon, defunct: def };
    }

    // 2. DEFUNCT DROP: defunct states never appear on the LIVE board (still searchable in archive endpoint)
    const liveBoard = Object.values(collapsed).filter(r => !r.defunct);

    // 3. LIVE-FIRST SORT: today's eyes rank above historical foundation, then by score
    return liveBoard.sort((a, b) => {
      const aLive = a.is_live ? 1 : 0;
      const bLive = b.is_live ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return (b.convergence_score || 0) - (a.convergence_score || 0);
    });
  } catch (err) {
    console.error('[getLatestScores]', err.message);
    return { error: err.message };
  }
}`;

if (src.includes(OLD)) {
  src = src.replace(OLD, NEW);
  fs.writeFileSync(FILE, src, 'utf8');
  console.log('[ok] getLatestScores: collapse + defunct drop + live-first sort wired');
  console.log('');
  console.log('Deploy:');
  console.log('   git add sabian_persistence.cjs');
  console.log('   git commit -m "fix: collapse fragments, drop defunct from live board, live-first sort"');
  console.log('   git push');
} else {
  console.log('[FAIL] exact return line not found — nothing changed. Paste current tail again.');
  process.exit(1);
}
