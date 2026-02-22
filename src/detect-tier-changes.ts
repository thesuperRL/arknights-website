import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface NicheList {
  niche: string;
  description: string;
  lastUpdated: string;
  operators: Record<string, Record<string, [string, string]>>;
}

interface ChangelogEntry {
  date: string;
  time?: string; // HH:mm (24h); missing = assume 20:00 for past entries
  operatorId: string;
  operatorName: string;
  niche: string;
  nicheFilename: string;
  oldTier: string | null;
  newTier: string | null;
  oldLevel: string;
  newLevel: string;
  justification: string;
  global?: boolean;
}

interface Changelog {
  entries: ChangelogEntry[];
}

const DATA_DIR = path.join(__dirname, '../data');
const NICHE_LISTS_DIR = path.join(DATA_DIR, 'niche-lists');
const CHANGELOG_PATH = path.join(DATA_DIR, 'tier-changelog.json');
const OPERATORS_FILES = [1, 2, 3, 4, 5, 6].map(r => path.join(DATA_DIR, `operators-${r}star.json`));

function loadOperatorData(): { names: Record<string, string>; global: Record<string, boolean> } {
  const names: Record<string, string> = {};
  const global: Record<string, boolean> = {};
  for (const filePath of OPERATORS_FILES) {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, { name?: string; global?: boolean }>;
      for (const [id, op] of Object.entries(data)) {
        names[id] = op?.name || id;
        global[id] = op?.global ?? true;
      }
    }
  }
  return { names, global };
}

function parseNicheList(content: string): NicheList | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractTiers(nicheList: NicheList): Map<string, { tier: string; level: string }> {
  const tiers = new Map<string, { tier: string; level: string }>();
  
  for (const [tier, operators] of Object.entries(nicheList.operators)) {
    for (const [operatorId, details] of Object.entries(operators)) {
      const level = details[1] || '';
      const key = `${operatorId}:${level}`;
      tiers.set(key, { tier, level });
    }
  }
  
  return tiers;
}

function getRepoRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return path.resolve(__dirname, '..');
  }
}

function getCommittedFileContent(filePath: string): string | null {
  try {
    const repoRoot = getRepoRoot();
    const relativePath = path.relative(repoRoot, filePath);
    if (relativePath.startsWith('..')) return null;
    const result = execSync(`git show HEAD:"${relativePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: repoRoot,
    });
    return result;
  } catch {
    return null;
  }
}

function detectChanges(): ChangelogEntry[] {
  const changes: ChangelogEntry[] = [];
  const { names: operatorNames, global: operatorGlobal } = loadOperatorData();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  const nicheFiles = fs.readdirSync(NICHE_LISTS_DIR)
    .filter(f => f.endsWith('.json'));

  for (const filename of nicheFiles) {
    const filePath = path.join(NICHE_LISTS_DIR, filename);
    const nicheFilename = filename.replace('.json', '');

    const currentContent = fs.readFileSync(filePath, 'utf-8');
    const currentList = parseNicheList(currentContent);
    if (!currentList) continue;

    const committedContent = getCommittedFileContent(filePath);
    const committedList = committedContent ? parseNicheList(committedContent) : null;

    const currentTiers = extractTiers(currentList);
    const committedTiers = committedList ? extractTiers(committedList) : new Map();

    const allKeys = new Set([...currentTiers.keys(), ...committedTiers.keys()]);

    for (const key of allKeys) {
      const [operatorId] = key.split(':');
      const current = currentTiers.get(key);
      const committed = committedTiers.get(key);
      const isGlobal = operatorGlobal[operatorId] ?? true;

      if (!current && committed) {
        changes.push({
          date: today,
          time: timeStr,
          operatorId,
          operatorName: operatorNames[operatorId] || operatorId,
          niche: currentList.niche,
          nicheFilename,
          oldTier: committed.tier,
          newTier: null,
          oldLevel: committed.level,
          newLevel: '',
          justification: '',
          global: isGlobal,
        });
      } else if (current && !committed) {
        changes.push({
          date: today,
          time: timeStr,
          operatorId,
          operatorName: operatorNames[operatorId] || operatorId,
          niche: currentList.niche,
          nicheFilename,
          oldTier: null,
          newTier: current.tier,
          oldLevel: '',
          newLevel: current.level,
          justification: '',
          global: isGlobal,
        });
      } else if (current && committed && current.tier !== committed.tier) {
        changes.push({
          date: today,
          time: timeStr,
          operatorId,
          operatorName: operatorNames[operatorId] || operatorId,
          niche: currentList.niche,
          nicheFilename,
          oldTier: committed.tier,
          newTier: current.tier,
          oldLevel: committed.level,
          newLevel: current.level,
          justification: '',
          global: isGlobal,
        });
      }
    }
  }

  return changes;
}

function loadChangelog(): Changelog {
  if (fs.existsSync(CHANGELOG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf-8'));
      return Array.isArray(data.entries) ? data : { entries: [] };
    } catch {
      return { entries: [] };
    }
  }
  return { entries: [] };
}

function saveChangelog(changelog: Changelog): void {
  const dir = path.dirname(CHANGELOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2), 'utf-8');
}

function main(): void {
  const changes = detectChanges();
  
  if (changes.length === 0) {
    console.log('No tier changes detected.');
    return;
  }
  
  console.log(`\n📋 Detected ${changes.length} tier change(s):\n`);
  
  const changelog = loadChangelog();
  
  for (const change of changes) {
    const tierChange = change.oldTier && change.newTier 
      ? `${change.oldTier} → ${change.newTier}`
      : change.newTier 
        ? `Added as ${change.newTier}`
        : `Removed (was ${change.oldTier})`;
    
    const levelInfo = change.newLevel || change.oldLevel 
      ? ` [${change.newLevel || change.oldLevel}]` 
      : '';
    
    console.log(`  • ${change.operatorName}: ${tierChange}${levelInfo} in ${change.nicheFilename}`);
    
    // Check if this exact change already exists (avoid duplicates)
    const exists = changelog.entries.some(e => 
      e.date === change.date &&
      e.operatorId === change.operatorId &&
      e.nicheFilename === change.nicheFilename &&
      e.oldTier === change.oldTier &&
      e.newTier === change.newTier &&
      e.oldLevel === change.oldLevel &&
      e.newLevel === change.newLevel
    );
    
    if (!exists) {
      changelog.entries.unshift(change);
    }
  }
  
  saveChangelog(changelog);
  console.log('\n✅ Changelog updated at data/tier-changelog.json');
  console.log('💡 Add justifications by editing the changelog file before committing.\n');
}

main();
