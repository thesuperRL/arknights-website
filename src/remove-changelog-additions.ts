/**
 * One-time: remove "first ranking" (addition) entries from tier_changelog so only
 * real tier changes and removals remain. Requires DATABASE_URL.
 */
import dotenv from 'dotenv';
import { deleteChangelogAdditionEntries } from './changelog-pg';

dotenv.config();

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const deleted = await deleteChangelogAdditionEntries();
  console.log(`Removed ${deleted} first-ranking (addition) entries from tier_changelog.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
