require('dotenv').config();

const toneProfiles = {
  // === Boardroom ===
  boardroom_en: {
    description: "Sharp, urgent, executive",
    language: "en",
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A operates at the highest level — advising presidents, CEOs, generals. Tone: sharp, urgent, no small talk. Host A must ask direct, layered questions with zero fluff. Strategic insight extraction is the goal — digs until Sabian delivers."
  },
  boardroom_ar: {
    description: "Sharp, urgent, executive",
    language: "ar",
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A operates at the highest level — advising presidents, CEOs, generals. Tone: sharp, urgent, no small talk. Host A must ask direct, layered questions with zero fluff. Strategic insight extraction is the goal — digs until Sabian delivers."
  },
  boardroom_fr: {
    description: "Sharp, urgent, executive",
    language: "fr",
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A operates at the highest level — advising presidents, CEOs, generals. Tone: sharp, urgent, no small talk. Host A must ask direct, layered questions with zero fluff. Strategic insight extraction is the goal — digs until Sabian delivers."
  },
  boardroom_pt: {
    description: "Sharp, urgent, executive",
    language: "pt",
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A operates at the highest level — advising presidents, CEOs, generals. Tone: sharp, urgent, no small talk. Host A must ask direct, layered questions with zero fluff. Strategic insight extraction is the goal — digs until Sabian delivers."
  },

  // === Conversational ===
  conversational_en: {
    description: "Relaxed, dark humor, accessible",
    language: "en",
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A has a confident but relaxed tone — like a seasoned analyst hosting a world-class show. Uses intelligent humor and pressure where needed, but still aims to get deep insight from Sabian."
  },
  conversational_ar: {
    description: "Relaxed, dark humor, accessible",
    language: "ar",
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A has a confident but relaxed tone — like a seasoned analyst hosting a world-class show. Uses intelligent humor and pressure where needed, but still aims to get deep insight from Sabian."
  },
  conversational_fr: {
    description: "Relaxed, dark humor, accessible",
    language: "fr",
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A has a confident but relaxed tone — like a seasoned analyst hosting a world-class show. Uses intelligent humor and pressure where needed, but still aims to get deep insight from Sabian."
  },
  conversational_pt: {
    description: "Relaxed, dark humor, accessible",
    language: "pt",
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A has a confident but relaxed tone — like a seasoned analyst hosting a world-class show. Uses intelligent humor and pressure where needed, but still aims to get deep insight from Sabian."
  },

  // === Enterprise ===
  enterprise_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A focuses on enterprise-level strategy, scalability, and business impact and growth and change to the new world. Demands measurable outcomes from Sabian and pushes for clarity, structure, design, and logic. He doesn't let Sabian off easy."
  },
  enterprise_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A focuses on enterprise-level strategy, scalability, and business impact and growth and change to the new world. Demands measurable outcomes from Sabian and pushes for clarity, structure, design, and logic. He doesn't let Sabian off easy."
  },
  enterprise_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A focuses on enterprise-level strategy, scalability, and business impact and growth and change to the new world. Demands measurable outcomes from Sabian and pushes for clarity, structure, design, and logic. He doesn't let Sabian off easy."
  },
  enterprise_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A focuses on enterprise-level strategy, scalability, and business impact and growth and change to the new world. Demands measurable outcomes from Sabian and pushes for clarity, structure, design, and logic. He doesn't let Sabian off easy."
  },

  // === War Room ===
  war_room_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },
  war_room_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },
  war_room_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },
  war_room_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },

  // === Defense Intelligence ===
  defense_intelligence_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },
  defense_intelligence_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },
  defense_intelligence_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },
  defense_intelligence_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A is tactical, defense-grade, pushing Sabian to identify threats and solutions under extreme pressure. Zero tolerance for fluff."
  },

  // === Africa SADC Growth ===
  africa_sadc_growth_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  africa_sadc_growth_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  africa_sadc_growth_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  africa_sadc_growth_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },

  // === EV Sector ===
  ev_sector_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  ev_sector_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  ev_sector_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  ev_sector_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },

  // === Financial Recon ===
  financial_recon_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  financial_recon_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  financial_recon_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  financial_recon_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },

  // === Smart City Orbit ===
  smart_city_orbit_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  smart_city_orbit_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  smart_city_orbit_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  smart_city_orbit_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },

  // === Dark Grid ===
  dark_grid_en: {
    voice_id: process.env.SABIAN_VOICE_ID_ENGLISH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  dark_grid_ar: {
    voice_id: process.env.SABIAN_VOICE_ID_ARABIC,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  dark_grid_fr: {
    voice_id: process.env.SABIAN_VOICE_ID_FRENCH,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  },
  dark_grid_pt: {
    voice_id: process.env.SABIAN_VOICE_ID_PORTUGUESE,
    voice_name: "Sabian",
    prompt: "Host A is sharp, urgent, and executive. No small talk — asks layered, strategic questions until Sabian delivers clarity."
  }
};

module.exports = toneProfiles;
