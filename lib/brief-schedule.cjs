'use strict';

function isBriefDue(preference, now = new Date()) {
  if (now.getUTCHours() < Number(preference.delivery_hour)) return false;
  return preference.cadence === 'daily' || now.getUTCDay() === Number(preference.delivery_weekday);
}

function briefPeriodStart(cadence, now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (cadence === 'weekly') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

module.exports = { briefPeriodStart, isBriefDue };
