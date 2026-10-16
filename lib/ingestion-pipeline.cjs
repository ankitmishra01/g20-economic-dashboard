'use strict';

async function runIngestionJob({ provider, start, fetchRows, persistRows, finish }) {
  const runId = await start(provider);
  let seen = 0;
  try {
    const rows = await fetchRows();
    seen = rows.length;
    const written = await persistRows(rows);
    await finish(runId, 'succeeded', { seen, written });
    return { runId, status: 'succeeded', rowsSeen: seen, rowsWritten: written };
  } catch (error) {
    await finish(runId, 'failed', { seen, written: 0, error: error instanceof Error ? error.message : 'Unknown ingestion error' });
    throw error;
  }
}

module.exports = { runIngestionJob };
