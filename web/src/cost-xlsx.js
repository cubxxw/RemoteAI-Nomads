// Small bounded OOXML reader for the official e-Stat public workbook.
// Reads only shared strings and the first worksheet, with no formulas/macros/external links.
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const MAX_ENTRY = 5 * 1024 * 1024;
const xmlText = text => text.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textRuns = xml => [...xml.replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => xmlText(m[1])).join('');

async function zipEntry(bytes, path) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('ESTAT_INVALID_ZIP');
  let offset = v.getUint32(end + 16, true);
  const count = v.getUint16(end + 10, true), decoder = new TextDecoder();
  if (count > 2000) throw Error('ESTAT_ZIP_ENTRY_LIMIT');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || v.getUint32(offset, true) !== 0x02014b50) throw Error('ESTAT_INVALID_ZIP_DIRECTORY');
    const method = v.getUint16(offset + 10, true), compressed = v.getUint32(offset + 20, true), size = v.getUint32(offset + 24, true);
    const nameLen = v.getUint16(offset + 28, true), extraLen = v.getUint16(offset + 30, true), commentLen = v.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    if (name === path) {
      if (size > MAX_ENTRY || compressed > MAX_ENTRY) throw Error('ESTAT_XLSX_ENTRY_LIMIT');
      const local = v.getUint32(offset + 42, true);
      if (local + 30 > bytes.length || v.getUint32(local, true) !== 0x04034b50) throw Error('ESTAT_INVALID_ZIP_LOCAL');
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      if (start + compressed > bytes.length) throw Error('ESTAT_TRUNCATED_ZIP');
      const input = bytes.subarray(start, start + compressed);
      let output;
      if (method === 0) output = input;
      else if (method === 8) {
        const reader = new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks = []; let total = 0;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          total += value.length;
          if (total > MAX_ENTRY) { await reader.cancel(); throw Error('ESTAT_DECOMPRESS_LIMIT'); }
          chunks.push(value);
        }
        output = new Uint8Array(total); let cursor = 0;
        for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
      } else throw Error('ESTAT_UNSUPPORTED_ZIP_COMPRESSION');
      if (output.length !== size) throw Error('ESTAT_XLSX_SIZE_MISMATCH');
      return decoder.decode(output);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw Error('ESTAT_MISSING_XLSX_PART');
}

export async function readEstatWorkbook(bytes) {
  if (bytes.length > 8 * 1024 * 1024) throw Error('ESTAT_WORKBOOK_LIMIT');
  const stringsXml = await zipEntry(bytes, 'xl/sharedStrings.xml');
  const sheet = await zipEntry(bytes, 'xl/worksheets/sheet1.xml');
  if (!sheet.includes(NS) || !stringsXml.includes(NS)) throw Error('ESTAT_INVALID_OOXML');
  const strings = [...stringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textRuns(m[1]));
  const rows = [];
  for (const r of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = {};
    for (const c of (r[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1], type = /\bt="([^"]+)"/.exec(c[1])?.[1];
      const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1];
      if (!ref) continue;
      cells[ref] = type === 's' ? strings[Number(value)] : type === 'inlineStr' ? textRuns(c[2]) : value == null ? '' : xmlText(value);
    }
    rows.push(cells);
  }
  if (rows.length > 20000) throw Error('ESTAT_ROW_LIMIT');
  return rows;
}
