// patch_tab_fix.cjs
// Removes the dead extraction handler that crashes on missing DOM elements
// Run from sabian_core: node patch_tab_fix.cjs

const fs   = require('fs');
const path = require('path');
const INTEL = path.join(__dirname, 'dashboard', 'intel.html');

let html = fs.readFileSync(INTEL, 'utf8');

// Remove the dead handler that crashes looking for 'extraction-locked' / 'extraction-content'
const OLD = `    // Extraction view requires buyer key
    if (btn.dataset.view === 'extraction') {
      const hasKey = localStorage.getItem('sabian_buyer_key') === 'cc77ec38601f82587e06dc4158df6e28ae22a84146f82b7279af5932bec9fd3f';
      document.getElementById('extraction-locked').style.display = hasKey ? 'none' : 'block';
      document.getElementById('extraction-content').style.display = hasKey ? 'block' : 'none';
      if (hasKey) loadExtractionEvents();
      return;
    }`;

const NEW = `    // extraction-live tab handled below`;

if (html.includes(OLD)) {
  html = html.replace(OLD, NEW);
  console.log('[ok] dead extraction handler removed');
} else {
  // Try to find it more loosely
  const idx = html.indexOf("document.getElementById('extraction-locked')");
  if (idx > 0) {
    // Find the enclosing if block
    const ifStart = html.lastIndexOf('if (btn.dataset.view', idx);
    const blockEnd = html.indexOf('return;\n    }', idx);
    if (ifStart > 0 && blockEnd > 0) {
      const oldBlock = html.slice(ifStart, blockEnd + 'return;\n    }'.length);
      html = html.replace(oldBlock, '// extraction handler removed');
      console.log('[ok] dead extraction handler removed (loose match)');
    } else {
      console.log('[warn] could not find block boundaries — manual fix needed');
      process.exit(1);
    }
  } else {
    console.log('[skip] handler already removed or not found');
  }
}

// Also wire extraction-live tab if not already wired
if (!html.includes("btn.dataset.view === 'extraction-live'")) {
  const PATTERNS_HANDLER = `if (btn.dataset.view === 'patterns') {
        if (!patternsLoaded) loadPatterns();
        return;
      }`;
  const WITH_EXTRACTION = `if (btn.dataset.view === 'patterns') {
        if (!patternsLoaded) loadPatterns();
        return;
      }
      if (btn.dataset.view === 'extraction-live') {
        if (!extractionLoaded) loadExtractionSignatures();
        return;
      }`;
  if (html.includes(PATTERNS_HANDLER)) {
    html = html.replace(PATTERNS_HANDLER, WITH_EXTRACTION);
    console.log('[ok] extraction-live tab wired');
  } else {
    console.log('[warn] patterns handler not found — extraction-live may not be wired');
  }
} else {
  console.log('[skip] extraction-live already wired');
}

fs.writeFileSync(INTEL, html, 'utf8');
console.log('\n✅ Patched. Deploy:');
console.log('   git add dashboard/intel.html');
console.log('   git commit -m "fix: remove dead extraction handler crashing on missing DOM elements"');
console.log('   git push');
