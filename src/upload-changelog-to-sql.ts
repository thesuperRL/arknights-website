/**
 * One-time: upload data/tier-changelog.json to tier_changelog table, then delete the JSON file.
 * Requires DATABASE_URL.
 */
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { replaceChangelogWithJson } from './changelog-pg';

dotenv.config();

const DATA_DIR = path.join(__dirname, '../data');
const JSON_PATH = path.join(DATA_DIR, 'tier-changelog.json');

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Cannot upload changelog.');
    process.exit(1);
  }
  if (!fs.existsSync(JSON_PATH)) {
    console.error('File not found:', JSON_PATH);
    process.exit(1);
  }

  const count = await replaceChangelogWithJson(JSON_PATH);
  console.log(`Uploaded ${count} changelog entries to tier_changelog.`);

  fs.unlinkSync(JSON_PATH);
  console.log('Deleted data/tier-changelog.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
