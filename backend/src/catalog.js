'use strict';

const catalog = require('../../books.json');

function normalizeText(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function findCatalogItem({ bookId, bookTitle, volume }) {
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

  const book = catalog.find((entry) => normalizeText(entry.title)?.toLowerCase() === requestedTitle.toLowerCase());
  if (!book) {
    return null;
  }

  const matchedVolume = book.volumes.find((entry) => String(entry.volumeNumber) === requestedVolume);
  if (!matchedVolume) {
    return null;
  }

  return {
    bookId: `${book.title}::${matchedVolume.volumeNumber}`,
    bookTitle: book.title,
    volume: String(matchedVolume.volumeNumber),
    cover: matchedVolume.cover,
    price: Number(book.price),
  };
}

module.exports = {
  findCatalogItem,
};
