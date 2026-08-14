import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const inputPath = 'C:/Users/david/Downloads/NSIB Individual Development Plan Update(1) (1).xlsx';
const outDir = 'C:/Users/david/nsib-employee-system/workbook_analysis';
await fs.mkdir(outDir, { recursive: true });
console.log('starting');

const input = await FileBlob.load(inputPath);
console.log('loaded file');
const wb = await SpreadsheetFile.importXlsx(input);
console.log('imported workbook');

const summary = await wb.inspect({
  kind: 'workbook,sheet,table,definedName,drawing',
  maxChars: 12000,
  tableMaxRows: 10,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
console.log('inspected summary');
await fs.writeFile(`${outDir}/summary.ndjson`, summary.ndjson ?? String(summary));

const sheets = wb.worksheets.items;
let report = '';
for (const sheet of sheets) {
  const used = sheet.getUsedRange();
  report += `\n=== SHEET: ${sheet.name} ===\n`;
  report += `usedRange: ${used?.address ?? 'none'}\n`;
  if (used) {
    const table = await wb.inspect({
      kind: 'table',
      sheetId: sheet.name,
      range: used.address,
      include: 'values,formulas',
      tableMaxRows: 80,
      tableMaxCols: 40,
      tableMaxCellChars: 200,
      maxChars: 30000,
    });
    report += table.ndjson ?? String(table);
    report += '\n';
    const formulas = await wb.inspect({
      kind: 'formula',
      sheetId: sheet.name,
      range: used.address,
      options: { maxResults: 100 },
      maxChars: 10000,
    });
    report += 'FORMULAS\n' + (formulas.ndjson ?? String(formulas)) + '\n';
    const preview = await wb.render({ sheetName: sheet.name, autoCrop: 'all', scale: 1, format: 'png' });
    await fs.writeFile(`${outDir}/${sheet.name.replace(/[^a-z0-9]+/gi, '_')}.png`, new Uint8Array(await preview.arrayBuffer()));
  }
}
await fs.writeFile(`${outDir}/report.txt`, report);
console.log(JSON.stringify({ sheets: sheets.map(s => ({ name: s.name, usedRange: s.getUsedRange()?.address ?? null })), outDir }, null, 2));
