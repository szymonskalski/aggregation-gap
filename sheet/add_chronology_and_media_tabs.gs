// One-time setup of two more tabs in the atlas sheet (October 2026).
//   Chronology: the dated moments of each entry's record, filled from data/chronology.seed.csv in the
//               GitHub repository. One row per moment; edit, add or delete rows here as with the Events tab.
//   Media:      column headings only, for the pictures to be added to entries later.
// A tab that already exists under either name is left as it is. Run from Extensions > Apps Script.
function addChronologyAndMediaTabs() {
  var ss = SpreadsheetApp.getActive();
  var URL = 'https://raw.githubusercontent.com/szymonskalski/aggregation-gap/main/data/chronology.seed.csv';
  var MEDIA = ['id', 'seq', 'kind', 'caption', 'credit', 'licence', 'licence_url', 'file_url', 'source_page', 'status'];
  var said = [];

  if (ss.getSheetByName('Chronology')) {
    said.push('A Chronology tab already exists and was left as it is.');
  } else {
    var rows = Utilities.parseCsv(UrlFetchApp.fetch(URL).getContentText());
    var width = rows[0].length;
    rows = rows.filter(function (r) { return r.length === width; });
    var sh = ss.insertSheet('Chronology');
    var range = sh.getRange(1, 1, rows.length, width);
    range.setNumberFormat('@');   // keeps 1987 and 1987-07-24 as text, the way the site reads them
    range.setValues(rows);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, width).setFontWeight('bold');
    said.push('Chronology tab added with ' + (rows.length - 1) + ' rows.');
  }

  if (ss.getSheetByName('Media')) {
    said.push('A Media tab already exists and was left as it is.');
  } else {
    var m = ss.insertSheet('Media');
    m.getRange(1, 1, 200, MEDIA.length).setNumberFormat('@');
    m.getRange(1, 1, 1, MEDIA.length).setValues([MEDIA]).setFontWeight('bold');
    m.setFrozenRows(1);
    said.push('Media tab added (headings only).');
  }
  console.log(said.join(' '));
}
