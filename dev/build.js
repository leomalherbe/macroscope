/* Builds macroscope/Code.gs = core.js + service.js + gas-adapter.js */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const parts = [
  ['macroscope/core.js', 'SHARED CORE (identical to macroscope/core.js on the site)'],
  ['dev/service.js', 'BACKEND SERVICE'],
  ['dev/gas-adapter.js', 'GOOGLE SHEETS ADAPTER + WEB ENTRY POINTS']
];
let out = `/* =====================================================================
   OPEN-MU policy desk — Google Apps Script backend
   Generated file: do not edit by hand (see dev/build.js).
   Setup: paste into Extensions > Apps Script of a blank Google Sheet,
   run setup() once, then Deploy > New deployment > Web app
   (Execute as: Me · Who has access: Anyone) and copy the /exec URL.
   ===================================================================== */
`;
for (const [file, title] of parts) {
  let src = fs.readFileSync(path.join(root, file), 'utf8');
  src = src.replace(/\nif \(typeof module !== 'undefined' && module\.exports\) module\.exports = \w+;\n?/g, '\n');
  out += `\n/* ===================== ${title} ===================== */\n` + src;
}
fs.writeFileSync(path.join(root, 'macroscope/Code.gs'), out);
console.log('Code.gs written:', out.length, 'chars');
