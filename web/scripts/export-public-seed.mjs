// Re-export only the reviewed publication snapshot, never a preview/Notion database.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { EMPTY_TABLES, PUBLIC_ORIGIN, PUBLIC_TABLES, publicSeedSql, publicSha256, validatePublicDatabase, validatePublicSeed } from './bootstrap-public.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function exportPublicSeed({ databasePath = join(ROOT, '.data/release/published.sqlite'), publicationPath = join(ROOT, '.data/release/publication.json'), outputPath = join(ROOT, 'data/public-catalog.json.gz') } = {}) {
  const [databaseBytes, publicationBytes, databaseStat] = await Promise.all([readFile(databasePath), readFile(publicationPath), stat(databasePath)]);
  const report = JSON.parse(publicationBytes), database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    validatePublicDatabase(database, report);
    const allowed = new Set([...PUBLIC_TABLES, ...EMPTY_TABLES]);
    const schema = database.prepare("SELECT type,name,tbl_name AS 'table',sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name").all().filter(item => allowed.has(item.table));
    const tables = PUBLIC_TABLES.map(name => {
      const columns = database.prepare('PRAGMA table_info("' + name + '")').all().map(column => column.name);
      const rows = database.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all().map(row => columns.map(column => row[column]));
      return { name, columns, rows };
    });
    const seed = {
      version: 1, origin: PUBLIC_ORIGIN,
      snapshot_date: report.snapshot_date || databaseStat.mtime.toISOString().slice(0, 10),
      snapshot_date_basis: 'reviewed public database file date; individual source observation dates remain in each record',
      license_notice: '代码许可证不替代第三方数据许可。各记录保留公开来源、日期及适用许可；价格、签证、网络与气候资料仅供参考，不能视为实时承诺。数据包不包含照片文件或任何第三方照片授权。',
      source_db_sha256: publicSha256(databaseBytes),
      source_publication_sha256: publicSha256(publicationBytes),
      publication: { origin: PUBLIC_ORIGIN, rows: Object.fromEntries(PUBLIC_TABLES.map(name => [name, report.rows[name]])), private_notes_exported: 0, notion_page_identifiers_exported: 0, excluded_tables: EMPTY_TABLES },
      payload_sha256: publicSha256(JSON.stringify({ schema, tables })),
      seed_sha256: publicSha256(publicSeedSql(tables)),
      schema, tables,
    };
    validatePublicSeed(seed);
    const encoded = Buffer.from(JSON.stringify(seed) + '\n'), compressed = gzipSync(encoded, { level: 9 });
    assert.ok(compressed.length < 1024 * 1024, 'Public catalog exceeded the 1 MiB distribution target');
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, compressed);
    return { version: seed.version, snapshot_date: seed.snapshot_date, compressed_bytes: compressed.length, uncompressed_bytes: encoded.length, artifact_sha256: publicSha256(compressed), seed_sha256: seed.seed_sha256, source_db_sha256: seed.source_db_sha256, private_notes_exported: 0, notion_page_identifiers_exported: 0, rows: seed.publication.rows };
  } finally { database.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await exportPublicSeed(), null, 2));
