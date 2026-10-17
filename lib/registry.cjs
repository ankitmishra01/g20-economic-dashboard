'use strict';

// Node access to the generated country registry (public/legacy/countries.json).
const registry = require('../public/legacy/countries.json');

const byIso3 = new Map(registry.countries.map((c) => [c.iso3, c]));
const g20Members = registry.collections.g20.members;

module.exports = {
  registry,
  countries: registry.countries,
  countryIso3: () => registry.countries.map((c) => c.iso3),
  byIso3: (iso3) => byIso3.get(iso3) || null,
  g20Members,
  // G20 economies used by the models and validation (the EU is an aggregate comparator).
  g20Iso3: ({ includeEU = false } = {}) => g20Members.filter((m) => includeEU || !m.aggregate).map((m) => m.iso3),
  advancedIso3: () => g20Members.filter((m) => m.advanced).map((m) => m.iso3),
  commodityExporterIso3: () => g20Members.filter((m) => m.commodityExporter).map((m) => m.iso3),
};
