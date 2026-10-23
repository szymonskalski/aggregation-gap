// One-time setup of two more tabs in the atlas sheet (October 2026).
//   Chronology: the dated moments of each entry's record, one row per moment.
//   Media:      the pictures shown under the entries, one row per picture; only rows whose status is
//               "published" appear on the site.
// Both are filled from the copies in the GitHub repository (data/chronology.seed.csv, data/media.seed.csv).
// A tab that already exists under either name is left as it is. Run from Extensions > Apps Script.
function addChronologyAndMediaTabs() {
  var BASE = 'https://raw.githubusercontent.com/szymonskalski/aggregation-gap/main/data/';
  var said = [];
  [['Chronology', 'chronology.seed.csv'], ['Media', 'media.seed.csv']].forEach(function (t) {
    var ss = SpreadsheetApp.getActive();
    if (ss.getSheetByName(t[0])) { said.push('A ' + t[0] + ' tab already exists and was left as it is.'); return; }
    var rows = Utilities.parseCsv(UrlFetchApp.fetch(BASE + t[1]).getContentText());
    var width = rows[0].length;
    rows = rows.filter(function (r) { return r.length === width; });
    var sh = ss.insertSheet(t[0]);
    var range = sh.getRange(1, 1, rows.length, width);
    range.setNumberFormat('@');   // keeps 1987 and 1987-07-24 as text, the way the site reads them
    range.setValues(rows);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, width).setFontWeight('bold');
    said.push(t[0] + ' tab added with ' + (rows.length - 1) + ' rows.');
  });
  console.log(said.join(' '));
}
