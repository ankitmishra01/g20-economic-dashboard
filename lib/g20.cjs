'use strict';

// G20 members as shown in the dashboard, read from the generated country
// registry (sync/registry.js -> public/legacy/countries.json).
const { g20Members } = require('./registry.cjs');

module.exports = Object.freeze(g20Members.map((m) => Object.freeze({ code: m.iso2, iso3: m.iso3, name: m.name, region: m.region })));
