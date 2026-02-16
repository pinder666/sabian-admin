const fs = require("fs");
const path = require("path");

const report = JSON.parse(fs.readFileSync("Defense_Report.json", "utf-8"));
const targetLang = "fr"; // Change to "es", "ar", "sw", etc.

function fakeTranslate(text, lang) {
  return `[${lang.toUpperCase()}] ${text}`; // Placeholder for real translation engine
}

const translated = {};
for (let key in report) {
  translated[key] = fakeTranslate(report[key], targetLang);
}

fs.writeFileSync(`Defense_Report_${targetLang}.json`, JSON.stringify(translated, null, 2));
console.log(`🌍 Report translated to ${targetLang.toUpperCase()} and saved as Defense_Report_${targetLang}.json`);
