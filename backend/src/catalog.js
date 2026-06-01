'use strict';

const db = require('./db');

function normalizeText(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

async function findCatalogItem({ bookId, bookTitle, volume }) {
  const normalizedBookId = normalizeText(bookId);
  let requestedTitle = normalizeText(bookTitle);
  let requestedVolume = normalizeText(volume);

  if (normalizedBookId && normalizedBookId.includes('::')) {
    const [idTitle, idVolume] = normalizedBookId.split('::');
    requestedTitle = normalizeText(idTitle);
    if (!requestedVolume) {
      requestedVolume = normalizeText(idVolume);
    }
  }

  if (!requestedTitle || !requestedVolume) {
    return null;
  }

  const volNumber = requestedVolume.replace('Vol ', '');

  const result = await db.queryRead(
    `SELECT book_id, title, volume, cover, price
     FROM books
     WHERE LOWER(title) = LOWER($1) AND volume = $2
     LIMIT 1`,
    [requestedTitle, 'Vol ' + volNumber]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const rowBookId = normalizeText(row.book_id);
  if (!rowBookId) {
    return null;
  }

  return {
    bookId: rowBookId,
    bookTitle: row.title,
    volume: row.volume.replace('Vol ', ''),
    cover: normalizeText(row.cover) || '',
    price: Number(row.price),
  };
}

module.exports = {
  findCatalogItem,
};
