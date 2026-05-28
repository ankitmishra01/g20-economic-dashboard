// G20 country registry, indicator codes, and threshold config.

const G20 = [
  { code: 'US', iso3: 'USA', name: 'United States',   flag: '🇺🇸', region: 'Americas' },
  { code: 'GB', iso3: 'GBR', name: 'United Kingdom',  flag: '🇬🇧', region: 'Europe'   },
  { code: 'CA', iso3: 'CAN', name: 'Canada',          flag: '🇨🇦', region: 'Americas' },
  { code: 'DE', iso3: 'DEU', name: 'Germany',         flag: '🇩🇪', region: 'Europe'   },
  { code: 'FR', iso3: 'FRA', name: 'France',          flag: '🇫🇷', region: 'Europe'   },
  { code: 'IT', iso3: 'ITA', name: 'Italy',           flag: '🇮🇹', region: 'Europe'   },
  { code: 'JP', iso3: 'JPN', name: 'Japan',           flag: '🇯🇵', region: 'Asia'     },
  { code: 'AU', iso3: 'AUS', name: 'Australia',       flag: '🇦🇺', region: 'Asia'     },
  { code: 'KR', iso3: 'KOR', name: 'South Korea',     flag: '🇰🇷', region: 'Asia'     },
  { code: 'CN', iso3: 'CHN', name: 'China',           flag: '🇨🇳', region: 'Asia'     },
  { code: 'IN', iso3: 'IND', name: 'India',           flag: '🇮🇳', region: 'Asia'     },
  { code: 'BR', iso3: 'BRA', name: 'Brazil',          flag: '🇧🇷', region: 'Americas' },
  { code: 'MX', iso3: 'MEX', name: 'Mexico',          flag: '🇲🇽', region: 'Americas' },
  { code: 'AR', iso3: 'ARG', name: 'Argentina',       flag: '🇦🇷', region: 'Americas' },
  { code: 'RU', iso3: 'RUS', name: 'Russia',          flag: '🇷🇺', region: 'Europe'   },
  { code: 'SA', iso3: 'SAU', name: 'Saudi Arabia',    flag: '🇸🇦', region: 'Middle East' },
  { code: 'ZA', iso3: 'ZAF', name: 'South Africa',   flag: '🇿🇦', region: 'Africa'   },
  { code: 'ID', iso3: 'IDN', name: 'Indonesia',       flag: '🇮🇩', region: 'Asia'     },
  { code: 'TR', iso3: 'TUR', name: 'Turkey',          flag: '🇹🇷', region: 'Europe'   },
  { code: 'EU', iso3: 'EUU', name: 'European Union',  flag: '🇪🇺', region: 'Europe'   },
];

// World Bank indicator codes + display metadata.
const INDICATORS = {
  GDP:          { wb: 'NY.GDP.MKTP.CD',     label: 'GDP',               unit: 'USD',    format: 'trillions' },
  GDP_GROWTH:   { wb: 'NY.GDP.MKTP.KD.ZG', label: 'GDP Growth',        unit: '%',      format: 'percent'   },
  INFLATION:    { wb: 'FP.CPI.TOTL.ZG',    label: 'Inflation (CPI)',   unit: '%',      format: 'percent'   },
  UNEMPLOYMENT: { wb: 'SL.UEM.TOTL.ZS',    label: 'Unemployment',      unit: '%',      format: 'percent'   },
  DEBT_GDP:     { imf: 'GGXWDG_NGDP',      label: 'Govt Debt / GDP',   unit: '%',      format: 'percent'   },
  CURRENT_ACC:  { wb: 'BN.CAB.XOKA.GD.ZS', label: 'Current Account',  unit: '% GDP',  format: 'percent'   },
  GDP_CAPITA:   { wb: 'NY.GDP.PCAP.CD',    label: 'GDP per Capita',    unit: 'USD',    format: 'thousands' },
  CO2_CAPITA:   { wb: 'EN.ATM.CO2E.PC',    label: 'CO₂ per Capita',   unit: 'tonnes', format: 'decimal'   },
  TRADE_GDP:    { wb: 'NE.TRD.GNFS.ZS',    label: 'Trade',             unit: '% GDP',  format: 'percent'   },
  POPULATION:   { wb: 'SP.POP.TOTL',       label: 'Population',        unit: '',       format: 'millions'  },
};

// Economic flag thresholds — mirrors the Holocene "Flag/Watch" concept.
const FLAGS_CONFIG = {
  highInflation:   { key: 'INFLATION',    threshold: 8,   dir: 'above', label: 'High Inflation',   severity: 'high'   },
  highDebt:        { key: 'DEBT_GDP',     threshold: 120, dir: 'above', label: 'High Debt',         severity: 'medium' },
  negativeGrowth:  { key: 'GDP_GROWTH',   threshold: 0,   dir: 'below', label: 'Contraction',       severity: 'high'   },
  highUnemploy:    { key: 'UNEMPLOYMENT', threshold: 10,  dir: 'above', label: 'High Unemployment', severity: 'medium' },
  currentAccDeficit:{ key: 'CURRENT_ACC', threshold: -5,  dir: 'below', label: 'Large CA Deficit',  severity: 'low'    },
};

// Nav items for the sidebar.
const NAV_ITEMS = [
  { id: 'overview',  label: 'Overview',         icon: 'home'    },
  { id: 'countries', label: 'All Countries',    icon: 'users'   },
  { id: 'compare',   label: 'Compare',          icon: 'chart'   },
  { id: 'flags',     label: 'Economic Flags',   icon: 'flag'    },
  { id: 'news',      label: 'News',             icon: 'inbox'   },
];

// Expose globally for all components.
window.G20         = G20;
window.INDICATORS  = INDICATORS;
window.FLAGS_CONFIG = FLAGS_CONFIG;
window.NAV_ITEMS   = NAV_ITEMS;
