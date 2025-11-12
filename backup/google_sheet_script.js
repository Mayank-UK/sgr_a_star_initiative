// use this if you loose app script to make it work with google sheet

function doGet(e) {
  const lock = LockService.getScriptLock();
  const sheet = SpreadsheetApp.openById('1dVcHfdu7WfSXrPUfr8Yt7Xyfga8Pci4nc6BraFTRgCA').getSheetByName('Sheet1');
  
  try {
    const action = e.parameter.action;

    // === SAVE ===
    if (action === 'save') {
      const record = JSON.parse(e.parameter.data);
      const id = record.id;
      const pageId = record.page_id;

      if (!lock.tryLock(10000)) {
        return createJsonResponse({ error: 'Server busy, retry later' });
      }

      try {
        const data = sheet.getDataRange().getValues();
        if (data.length === 0) throw new Error('No headers in sheet');

        const headers = data[0];
        const idIdx = headers.indexOf('id');
        const pageIdx = headers.indexOf('page_id');

        if (idIdx === -1 || pageIdx === -1) throw new Error('Missing id or page_id column');

        const exists = data.slice(1).some(row => row[idIdx] === id && row[pageIdx] === pageId);
        if (exists) {
          return createJsonResponse({ status: 'ok', message: 'Already exists', duplicate: true });
        }

        sheet.appendRow([
          id,
          pageId,
          record.pre_text || '',
          record.text || '',
          record.post_text || '',
          record.color || '#ffff88',
          new Date()  // Always add server timestamp
        ]);

        SpreadsheetApp.flush();  // Force immediate write
        Utilities.sleep(2000);   // Increase to 2s for reliable propagation

        Logger.log('Appended row for ID: ' + id + ' at ' + new Date());

        return createJsonResponse({ status: 'ok', created: true });
      } finally {
        lock.releaseLock();
      }
    }

    // === DELETE ===
    if (action === 'delete') {
      const id = e.parameter.id;
      const pageId = e.parameter.page_id || '';

      if (!lock.tryLock(10000)) {
        return createJsonResponse({ error: 'Server busy, retry later' });
      }

      try {
        const data = sheet.getDataRange().getValues();
        if (data.length === 0) return createJsonResponse({ status: 'ok', deleted: false });

        const headers = data[0];
        const idIdx = headers.indexOf('id');
        const pageIdx = headers.indexOf('page_id');

        if (idIdx === -1 || pageIdx === -1) throw new Error('Missing columns');

        for (let i = data.length - 1; i > 0; i--) {
          if (data[i][idIdx] === id && data[i][pageIdx] === pageId) {
            sheet.deleteRow(i + 1);
          }
        }
        return createJsonResponse({ status: 'ok', deleted: true });
      } finally {
        lock.releaseLock();
      }
    }

    // === LOAD (No lock needed, read-only) ===
    const pageId = e.parameter.page_id || '';
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) return createJsonResponse([]);

    const headers = data[0];
    const records = data.slice(1)
      .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])))
      .filter(r => r.page_id === pageId);

    return createJsonResponse(records);

  } catch (error) {
    if (lock.hasLock()) lock.releaseLock();
    return createJsonResponse({ error: error.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}