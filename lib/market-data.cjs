function parseEcbDailyXml(xml) {
  const dated = xml.match(/<Cube\s+time=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/Cube>/i);
  if (!dated) throw new Error('ECB response did not include a dated rate set');
  const rates = {};
  for (const match of dated[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/gi)) rates[match[1].toUpperCase()] = Number(match[2]);
  if (!Object.keys(rates).length) throw new Error('ECB response did not include rates');
  return { date: dated[1], rates };
}

function parseFredCsv(csv) {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const [date, raw] = lines[index].split(','); const value = Number(raw);
    if (date && raw && raw !== '.' && Number.isFinite(value)) return { date, value };
  }
  throw new Error('FRED response did not include an observation');
}

module.exports = { parseEcbDailyXml, parseFredCsv };
