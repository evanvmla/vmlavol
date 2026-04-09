/**
 * Meta Ads Lead Sync — Google Apps Script
 *
 * Paste this into the Google Sheet's Apps Script editor:
 *   Extensions → Apps Script → replace Code.gs contents with this file.
 *
 * Then add a time-based trigger:
 *   Triggers (clock icon) → Add Trigger
 *     - Function: syncMetaAdsLeads
 *     - Event source: Time-driven
 *     - Type: Hour timer
 *     - Interval: Every hour
 *
 * Progress is tracked via PropertiesService.LAST_ROW so reruns don't re-import
 * rows. On failure, LAST_ROW is not advanced → next run retries the same
 * range.
 *
 * NOT wired into the Next.js runtime — this file lives in the repo for
 * version control only.
 */

const VMLA_WEBHOOK_URL = 'https://vmlavol.vercel.app/api/webhooks/meta-ads';
const VMLA_SECRET = 'PASTE_META_ADS_SYNC_SECRET_HERE'; // must match Vercel env var

function syncMetaAdsLeads() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const props = PropertiesService.getScriptProperties();
  const lastProcessedRow = parseInt(props.getProperty('LAST_ROW') || '1', 10);
  const lastRow = sheet.getLastRow();
  if (lastRow <= lastProcessedRow) {
    Logger.log('No new rows. lastProcessedRow=' + lastProcessedRow + ' lastRow=' + lastRow);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowCount = lastRow - lastProcessedRow;
  const values = sheet
    .getRange(lastProcessedRow + 1, 1, rowCount, headers.length)
    .getValues();

  const leads = values.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) {
      obj[h] = row[i];
    });
    return obj;
  });

  const response = UrlFetchApp.fetch(VMLA_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + VMLA_SECRET },
    payload: JSON.stringify({ leads: leads }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  Logger.log('Status: ' + code + ' Body: ' + body);

  if (code === 200) {
    props.setProperty('LAST_ROW', String(lastRow));
  } else {
    throw new Error('Sync failed: ' + code + ' ' + body);
  }
}

/**
 * Utility: reset the progress cursor so the next run reprocesses all rows.
 * Only run manually if you want a full re-sync (upserts are idempotent by
 * email, so this is safe but noisy).
 */
function resetSyncCursor() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_ROW');
  Logger.log('LAST_ROW cursor cleared.');
}
