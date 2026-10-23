// One-time update of the Events tab with the revised entry text (October 2026).
// Reads sheet/revised_text_2026-10.json from the GitHub repository and writes the five prose
// columns (summary, records, gap, joining, harm_found_later), matching rows by id.
// Nothing else in the sheet is touched. Run from Extensions > Apps Script.
function applyRevisedText() {
  var URL = 'https://raw.githubusercontent.com/szymonskalski/aggregation-gap/main/sheet/revised_text_2026-10.json';
  var FIELDS = ['summary', 'records', 'gap', 'joining', 'harm_found_later'];
  var data = JSON.parse(UrlFetchApp.fetch(URL).getContentText());
  var sheet = SpreadsheetApp.getActive().getSheetByName('Events');
  if (!sheet) throw new Error('No tab called "Events".');
  var values = sheet.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var idCol = head.indexOf('id');
  var cols = FIELDS.map(function (f) { return head.indexOf(f); });
  if (idCol < 0 || cols.indexOf(-1) >= 0) throw new Error('A column header is missing: id, ' + FIELDS.join(', '));
  var updated = 0, notFound = [];
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][idCol]).trim().toUpperCase();
    if (!id) continue;
    var rec = data[id];
    if (!rec) { notFound.push(id); continue; }
    FIELDS.forEach(function (f, i) { values[r][cols[i]] = rec[f]; });
    updated++;
  }
  cols.forEach(function (c) {
    var column = values.slice(1).map(function (row) { return [row[c]]; });
    sheet.getRange(2, c + 1, column.length, 1).setValues(column);
  });
  console.log(updated + ' entries updated.' + (notFound.length ? ' Not in the revised file, left as they were: ' + notFound.join(', ') : ''));
}
