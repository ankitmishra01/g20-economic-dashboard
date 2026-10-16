'use strict';

async function collectPages(fetchPage, { pageSize = 1000, maxRows = 50000 } = {}) {
  const rows = [];
  while (rows.length < maxRows) {
    const page = await fetchPage(rows.length, Math.min(rows.length + pageSize - 1, maxRows - 1));
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

module.exports = { collectPages };
