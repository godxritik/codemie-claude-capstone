// CSV export of one day (pure; RFC 4180 quoting plus spreadsheet-formula neutralisation).

const HEADER = ['date', 'title', 'start', 'end', 'category', 'done'];

// A leading = + - @ tab or CR makes spreadsheets treat the cell as a formula; a single quote defuses it.
const neutralise = (v) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

const quote = (v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** @param {{date: string, title: string, start: string, end: string, category: string, done: boolean}[]} entries */
export function toCsv(entries) {
  const lines = [HEADER.join(',')];
  for (const e of entries) {
    const cells = [e.date, neutralise(e.title), e.start, e.end, e.category, e.done ? 'true' : 'false'];
    lines.push(cells.map(quote).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
