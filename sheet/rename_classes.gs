// One-time change of the classification to the plain names (October 2026).
//   core -> missed, contrast -> obvious, control -> false-alarm, misattribution -> wrongly-blamed,
//   and a new class, still-open, for suspected attacks and attack claims that were never settled.
// Reads sheet/case_types_2026-10.json from the GitHub repository and writes the new code into the
// case_type column of the Events tab, matching rows by id. It also replaces the case_type list on the
// Lists tab, so that the drop-down offers the new names, and the note on the column header.
// Run from Extensions > Apps Script.
function renameClasses() {
  var URL = 'https://raw.githubusercontent.com/szymonskalski/aggregation-gap/main/sheet/case_types_2026-10.json';
  var NEW = ['missed', 'obvious', 'false-alarm', 'wrongly-blamed', 'still-open'];
  var codes = JSON.parse(UrlFetchApp.fetch(URL).getContentText());
  var ss = SpreadsheetApp.getActive();
  var ev = ss.getSheetByName('Events');
  if (!ev) throw new Error('No tab called "Events".');
  var values = ev.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var idCol = head.indexOf('id'), ctCol = head.indexOf('case_type');
  if (idCol < 0 || ctCol < 0) throw new Error('The Events tab needs an id and a case_type column.');
  var changed = 0, notFound = [];
  var column = values.slice(1).map(function (row) {
    var id = String(row[idCol]).trim().toUpperCase();
    if (!id) return [row[ctCol]];
    if (!codes[id]) { notFound.push(id); return [row[ctCol]]; }
    if (row[ctCol] !== codes[id]) changed++;
    return [codes[id]];
  });
  // the drop-down list on the Lists tab
  var lists = ss.getSheetByName('Lists'), rule = null;
  if (lists) {
    var lhead = lists.getRange(1, 1, 1, lists.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var lc = lhead.indexOf('case_type') + 1;
    if (lc > 0) {
      lists.getRange(2, lc, Math.max(lists.getLastRow() - 1, NEW.length), 1).clearContent();
      lists.getRange(2, lc, NEW.length, 1).setValues(NEW.map(function (v) { return [v]; }));
      rule = SpreadsheetApp.newDataValidation().requireValueInRange(lists.getRange(2, lc, NEW.length, 1), true)
        .setAllowInvalid(false).setHelpText('Choose a class from the Lists tab.').build();
    }
  }
  if (!rule) rule = SpreadsheetApp.newDataValidation().requireValueInList(NEW, true).setAllowInvalid(false).build();
  var target = ev.getRange(2, ctCol + 1, Math.max(ev.getMaxRows() - 1, column.length), 1);
  target.clearDataValidations();
  ev.getRange(2, ctCol + 1, column.length, 1).setValues(column);
  target.setDataValidation(rule);
  ev.getRange(1, ctCol + 1).setNote('missed, obvious, false-alarm, wrongly-blamed or still-open.\n' +
    'missed: the pieces existed, but no one put them together until late, or ever.\n' +
    'obvious: the attacker claimed it, or the target made it plain.\n' +
    'false-alarm: treated as a possible attack; turned out to be an accident or failure.\n' +
    'wrongly-blamed: joined into an attack claim that later fell apart.\n' +
    'still-open: suspected, never settled.');
  console.log(changed + ' rows changed.' + (notFound.length ? ' Not in the file, left as they were: ' + notFound.join(', ') : ''));
}
