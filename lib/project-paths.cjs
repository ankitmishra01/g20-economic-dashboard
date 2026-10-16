'use strict';

const path = require('node:path');

function snapshotDestination(syncDirectory) {
  return path.join(syncDirectory, '..', 'public', 'legacy', 'data-snapshot.json');
}

module.exports = { snapshotDestination };
