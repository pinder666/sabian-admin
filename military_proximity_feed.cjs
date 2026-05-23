// military_proximity_feed.cjs
// Military Base Proximity Signal — foreign military footprint per country
// Source: curated-bases.json (World Monitor public dataset, worldmonitor/worldmonitor)
// Score 0–100: higher = greater foreign military presence / great-power competition
// Logic: foreign bases in a country indicate either protection OR flashpoint risk.
//   Adversarial power bases (Russia, China) in fragile states = HIGH risk
//   Contested/disputed bases = HIGHEST risk multiplier
//   US/NATO bases = moderate signal (stabilizing but also a target)
// Cadence: static dataset — update quarterly as bases open/close (168h window)

// Condensed active base list — country → array of {power, status, arm}
// Powers: 'russia','china','us-nato','uk','france','india','uae','italy','japan'
const BASE_ROSTER = {
  'Armenia':       [{ power:'russia', status:'active', arm:'combined arms' }, { power:'russia', status:'active', arm:'air force' }],
  'Azerbaijan':    [],
  'Bahrain':       [{ power:'us-nato', status:'active', arm:'navy' }, { power:'us-nato', status:'active', arm:'air force' }, { power:'uk', status:'active', arm:'navy' }],
  'Belarus':       [{ power:'russia', status:'active', arm:'navy' }, { power:'russia', status:'active', arm:'aerospace' }],
  'Belize':        [{ power:'uk', status:'active', arm:'air force' }],
  'Bulgaria':      [{ power:'us-nato', status:'active', arm:'air force' }, { power:'us-nato', status:'active', arm:'air force' }, { power:'us-nato', status:'active', arm:'air force' }],
  'Cambodia':      [{ power:'china', status:'controversial', arm:'navy' }],
  'Cameroon':      [{ power:'us-nato', status:'active', arm:'army' }],
  'Chad':          [{ power:'france', status:'active', arm:'air force' }],
  'Cuba':          [{ power:'us-nato', status:'active', arm:'navy' }],
  'Cyprus':        [{ power:'uk', status:'active', arm:'air force' }, { power:'uk', status:'active', arm:'air force' }, { power:'uk', status:'active', arm:'army' }],
  'Djibouti':      [{ power:'us-nato', status:'active', arm:'navy' }, { power:'china', status:'active', arm:'navy' }, { power:'france', status:'active', arm:'navy' }, { power:'italy', status:'active', arm:'combined arms' }, { power:'japan', status:'active', arm:'navy' }],
  'Eritrea':       [{ power:'uae', status:'controversial', arm:'combined arms' }],
  'Gabon':         [{ power:'france', status:'active', arm:'combined arms' }],
  'Georgia':       [{ power:'russia', status:'active', arm:'combined arms' }, { power:'russia', status:'active', arm:'combined arms' }],
  'Germany':       [{ power:'us-nato', status:'active', arm:'army' }, { power:'us-nato', status:'active', arm:'air force' }, { power:'uk', status:'active', arm:'army' }],
  'Iraq':          [{ power:'us-nato', status:'active', arm:'combined arms' }],
  'Israel':        [{ power:'us-nato', status:'active', arm:'radar' }],
  'Ivory Coast':   [{ power:'france', status:'active', arm:'combined arms' }],
  'Japan':         [{ power:'us-nato', status:'active', arm:'navy' }, { power:'us-nato', status:'active', arm:'marines' }, { power:'us-nato', status:'active', arm:'air force' }],
  'Kazakhstan':    [{ power:'russia', status:'active', arm:'spaceport' }, { power:'russia', status:'active', arm:'missile range' }, { power:'russia', status:'active', arm:'radar' }],
  'Kosovo':        [{ power:'us-nato', status:'active', arm:'army' }],
  'Kuwait':        [{ power:'us-nato', status:'active', arm:'air force' }, { power:'us-nato', status:'active', arm:'combined arms' }, { power:'italy', status:'active', arm:'air force' }],
  'Kyrgyzstan':    [{ power:'russia', status:'active', arm:'air base' }],
  'Lebanon':       [{ power:'france', status:'active', arm:'combined arms' }],
  'Libya':         [{ power:'uae', status:'controversial', arm:'air force' }, { power:'italy', status:'active', arm:'combined arms' }],
  'Moldova':       [{ power:'russia', status:'active', arm:'task force' }],
  'Myanmar':       [{ power:'china', status:'controversial', arm:'army' }, { power:'india', status:'planned', arm:'listening post' }],
  'Niger':         [{ power:'france', status:'active', arm:'air force' }, { power:'us-nato', status:'active', arm:'air force' }],
  'Oman':          [{ power:'uk', status:'active', arm:'navy' }, { power:'us-nato', status:'active', arm:'air force' }, { power:'india', status:'active', arm:'navy' }],
  'Philippines':   [{ power:'us-nato', status:'active', arm:'air force' }, { power:'us-nato', status:'active', arm:'army' }],
  'Qatar':         [{ power:'us-nato', status:'active', arm:'air force' }, { power:'uk', status:'active', arm:'air force' }, { power:'india', status:'active', arm:'combined arms' }],
  'Saudi Arabia':  [{ power:'us-nato', status:'active', arm:'air force' }],
  'Senegal':       [{ power:'france', status:'active', arm:'combined arms' }],
  'Singapore':     [{ power:'us-nato', status:'active', arm:'navy' }, { power:'uk', status:'active', arm:'navy' }],
  'South Korea':   [{ power:'us-nato', status:'active', arm:'army' }, { power:'us-nato', status:'active', arm:'air force' }, { power:'us-nato', status:'active', arm:'navy' }],
  'Syria':         [{ power:'russia', status:'active', arm:'air force' }, { power:'russia', status:'active', arm:'navy' }, { power:'russia', status:'active', arm:'air force' }, { power:'france', status:'active', arm:'combined arms' }],
  'Tajikistan':    [{ power:'russia', status:'active', arm:'combined arms' }, { power:'china', status:'controversial', arm:'army' }, { power:'india', status:'active', arm:'combined arms' }],
  'Turkey':        [{ power:'us-nato', status:'active', arm:'air force' }],
  'UAE':           [{ power:'france', status:'active', arm:'navy/air force' }, { power:'us-nato', status:'active', arm:'air force' }, { power:'italy', status:'active', arm:'air force' }],
  'Venezuela':     [{ power:'russia', status:'planned', arm:'combined arms' }],
  'Yemen':         [{ power:'uae', status:'active', arm:'combined arms' }]
};

// Power risk weights — how destabilising is a foreign base of this power in a fragile state?
const POWER_WEIGHTS = {
  'russia':   { active: 18, controversial: 25, planned: 8  },
  'china':    { active: 16, controversial: 22, planned: 10 },
  'uae':      { active: 12, controversial: 20, planned: 6  },
  'us-nato':  { active: 8,  controversial: 12, planned: 4  },
  'uk':       { active: 6,  controversial: 10, planned: 3  },
  'france':   { active: 7,  controversial: 11, planned: 3  },
  'india':    { active: 5,  controversial: 8,  planned: 3  },
  'italy':    { active: 5,  controversial: 8,  planned: 2  },
  'japan':    { active: 4,  controversial: 6,  planned: 2  }
};

async function fetchMilitaryProximityData(country) {
  const bases = BASE_ROSTER[country];
  if (!bases || bases.length === 0) {
    return { score: 0, base_count: 0, powers_present: [], reason: 'no_foreign_bases' };
  }

  let rawScore = 0;
  const powers = new Set();

  for (const base of bases) {
    const pw = POWER_WEIGHTS[base.power] || { active: 5, controversial: 10, planned: 2 };
    rawScore += pw[base.status] || pw.active;
    powers.add(base.power);
  }

  // Multi-power presence bonus — great-power competition = higher risk
  const powerCount = powers.size;
  const competitionBonus = powerCount >= 4 ? 20 : powerCount === 3 ? 12 : powerCount === 2 ? 6 : 0;

  const score = Math.min(100, rawScore + competitionBonus);

  return {
    score,
    base_count:     bases.length,
    powers_present: [...powers],
    competition_bonus: competitionBonus,
    raw_score: rawScore
  };
}

module.exports = { fetchMilitaryProximityData };
