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
// source field is displayed in KPI tiles and insight responses.
const INDICATORS = {
  GDP:          { wb: 'NY.GDP.MKTP.CD',         label: 'GDP',               unit: 'USD',    format: 'trillions', source: 'WB'   },
  GDP_GROWTH:   { wb: 'NY.GDP.MKTP.KD.ZG',      label: 'GDP Growth',        unit: '%',      format: 'percent',   source: 'WB'   },
  INFLATION:    { wb: 'FP.CPI.TOTL.ZG',         label: 'Inflation (CPI)',   unit: '%',      format: 'percent',   source: 'WB'   },
  UNEMPLOYMENT: { wb: 'SL.UEM.TOTL.ZS',         label: 'Unemployment',      unit: '%',      format: 'percent',   source: 'WB'   },
  DEBT_GDP:     { imf: 'GGXWDG_NGDP',           label: 'Govt Debt / GDP',   unit: '%',      format: 'percent',   source: 'IMF'  },
  CURRENT_ACC:  { wb: 'BN.CAB.XOKA.GD.ZS',      label: 'Current Account',   unit: '% GDP',  format: 'percent',   source: 'WB'   },
  GDP_CAPITA:   { wb: 'NY.GDP.PCAP.CD',          label: 'GDP per Capita',    unit: 'USD',    format: 'thousands', source: 'WB'   },
  CO2_CAPITA:   { wb: 'EN.ATM.CO2E.PC',          label: 'CO₂ per Capita',   unit: 'tonnes', format: 'decimal',   source: 'WB'   },
  TRADE_GDP:    { wb: 'NE.TRD.GNFS.ZS',          label: 'Trade Openness',    unit: '% GDP',  format: 'percent',   source: 'WB'   },
  POPULATION:   { wb: 'SP.POP.TOTL',             label: 'Population',        unit: '',       format: 'millions',  source: 'WB'   },
  HEALTH_EXP:   { wb: 'SH.XPD.CHEX.GD.ZS',      label: 'Health Spending',   unit: '% GDP',  format: 'percent',   source: 'WB'   },
  RD_EXP:       { oecd: true,                    label: 'R&D Spending',      unit: '% GDP',  format: 'percent',   source: 'OECD' },
  GINI:         { wb: 'SI.POV.GINI',             label: 'Gini Index',        unit: '',       format: 'decimal',   source: 'WB'   },
  YOUTH_UNEMP:  { wb: 'SL.UEM.1524.ZS',          label: 'Youth Unemployment', unit: '%',     format: 'percent',   source: 'WB'   },
  CAPITAL_FORM: { wb: 'NE.GDI.TOTL.ZS',          label: 'Capital Formation', unit: '% GDP',  format: 'percent',   source: 'WB'   },
  FDI_INFLOWS:  { wb: 'BX.KLT.DINV.WD.GD.ZS',   label: 'FDI Inflows',       unit: '% GDP',  format: 'percent',   source: 'WB'   },
  EDUC_EXP:     { wb: 'SE.XPD.TOTL.GD.ZS',      label: 'Education Spending', unit: '% GDP', format: 'percent',   source: 'WB'   },
  EXPORTS_GDP:  { wb: 'NE.EXP.GNFS.ZS',          label: 'Exports',           unit: '% GDP',  format: 'percent',   source: 'WB'   },
  TAX_REVENUE:  { wb: 'GC.TAX.TOTL.GD.ZS',       label: 'Tax Revenue',       unit: '% GDP',  format: 'percent',   source: 'WB'   },
  MANUFACTURING:{ wb: 'NV.IND.MANF.ZS',          label: 'Manufacturing',     unit: '% GDP',  format: 'percent',   source: 'WB'   },
  FISCAL_BAL:   { imf: 'GGXCNL_NGDP',            label: 'Fiscal Balance',    unit: '% GDP',  format: 'percent',   source: 'IMF'  },
  LIFE_EXPECT:  { wb: 'SP.DYN.LE00.IN',          label: 'Life Expectancy',   unit: 'yrs',    format: 'number',    source: 'WB'   },
  FEMALE_LFP:   { wb: 'SL.TLF.CACT.FE.ZS',      label: 'Female LFP',        unit: '%',      format: 'percent',   source: 'WB'   },
  GDP_CAPITA_PPP: { wb: 'NY.GDP.PCAP.PP.CD',     label: 'GDP/capita PPP',    unit: '$',      format: 'thousands', source: 'WB'   },
  RESEARCHERS:  { wb: 'SP.POP.SCIE.RD.P6',       label: 'Researchers',       unit: '/mn pop',format: 'number',    source: 'WB+OECD' },
};

// Economic flag thresholds — mirrors the Holocene "Flag/Watch" concept.
const FLAGS_CONFIG = {
  highInflation:   { key: 'INFLATION',    threshold: 8,   dir: 'above', label: 'High Inflation',   severity: 'high'   },
  highDebt:        { key: 'DEBT_GDP',     threshold: 120, dir: 'above', label: 'High Debt',         severity: 'medium' },
  negativeGrowth:  { key: 'GDP_GROWTH',   threshold: 0,   dir: 'below', label: 'Contraction',       severity: 'high'   },
  highUnemploy:    { key: 'UNEMPLOYMENT', threshold: 10,  dir: 'above', label: 'High Unemployment', severity: 'medium' },
  currentAccDeficit:{ key: 'CURRENT_ACC', threshold: -5,  dir: 'below', label: 'Large CA Deficit',  severity: 'low'    },
  highYouthUnemp:   { key: 'YOUTH_UNEMP', threshold: 25,  dir: 'above', label: 'High Youth Unemp.', severity: 'medium' },
  fiscalDeficit:    { key: 'FISCAL_BAL',  threshold: -6,  dir: 'below', label: 'Large Fiscal Deficit', severity: 'medium' },
};

// Nav items for the sidebar.
const NAV_ITEMS = [
  { id: 'overview',  label: 'Overview',         icon: 'home',   key: 'O' },
  { id: 'countries', label: 'Countries',        icon: 'users',  key: 'C' },
  { id: 'compare',   label: 'Compare',          icon: 'chart',  key: 'P' },
  { id: 'flags',     label: 'Risk flags',       icon: 'flag',   key: 'F' },
  { id: 'news',      label: 'News',             icon: 'inbox',  key: 'N' },
];

// Expose globally for all components.
window.G20         = G20;
window.INDICATORS  = INDICATORS;
window.FLAGS_CONFIG = FLAGS_CONFIG;
window.NAV_ITEMS   = NAV_ITEMS;
