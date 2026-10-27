// Adds to the Media tab the pictures in the repository's data/media.seed.csv that the tab does not yet hold
// (October 2026: the second round of pictures, a picture for every entry).
// A row is new when the tab has no row with the same id and the same picture address (site_url). Rows already
// in the tab, and any changes made to them in the sheet, are left exactly as they are. Run it again at any time:
// it adds nothing twice. Run from Extensions > Apps Script.
function addMediaRows() {
  var URL = 'https://raw.githubusercontent.com/szymonskalski/aggregation-gap/main/data/media.seed.csv';
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Media');
  if (!sh) throw new Error('No tab called "Media". Run addChronologyAndMediaTabs first.');
  var src = Utilities.parseCsv(UrlFetchApp.fetch(URL).getContentText());
  var srcHead = src[0].map(function (h) { return String(h).trim(); });
  var have = sh.getDataRange().getValues();
  var head = have[0].map(function (h) { return String(h).trim(); });
  var hi = head.indexOf('id'), hu = head.indexOf('site_url');
  if (hi < 0 || hu < 0) throw new Error('The Media tab needs an id and a site_url column.');
  var key = function (id, url) { return String(id).trim().toUpperCase() + ' ' + String(url).trim(); };
  var seen = {};
  have.slice(1).forEach(function (r) { seen[key(r[hi], r[hu])] = true; });
  var si = srcHead.indexOf('id'), su = srcHead.indexOf('site_url');
  var add = src.slice(1).filter(function (r) { return r.length === srcHead.length && r[si] && !seen[key(r[si], r[su])]; })
    // each new row is laid out in the tab's own column order
    .map(function (r) { return head.map(function (h) { var k = srcHead.indexOf(h); return k < 0 ? '' : r[k]; }); });
  if (!add.length) { console.log('Nothing to add: the Media tab already holds every picture in the file.'); return; }
  var range = sh.getRange(sh.getLastRow() + 1, 1, add.length, head.length);
  range.setNumberFormat('@');
  range.setValues(add);
  console.log(add.length + ' pictures added to the Media tab.');
}
