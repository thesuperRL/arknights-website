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
  operatorId: string;
  operatorName: string;
  niche: string;
  nicheFilename: string;
  oldTier: string | null;
  newTier: string | null;
  oldLevel: string;
  newLevel: string;
  justification: string;
}

interface Changelog {
  entries: ChangelogEntry[];
}

const NICHE_LISTS_DIR = path.join(__dirname, '../data/niche-lists');
const CHANGELOG_PATH = path.join(__dirname, '../data/tier-changelog.json');
const OPERATORS_FILES = [
  path.join(__dirname, '../data/operators-6star.json'),
  path.join(__dirname, '../data/operators-5star.json'),
  path.join(__dirname, '../data/operators-4star.json'),
  path.join(__dirname, '../data/operators-3star.json'),
];

function loadOperatorNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const filePath of OPERATORS_FILES) {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      for (const [id, op] of Object.entries(data)) {
        names[id] = (op as any).name || id;
      }
    }
  }
  return names;
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

function getCommittedFileContent(filePath: string): string | null {
  try {
    const relativePath = path.relative(process.cwd(), filePath);
    const result = execSync(`git show HEAD:"${relativePath}"`, { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result;
  } catch {
    return null;
  }
}

function detectChanges(): ChangelogEntry[] {
  const changes: ChangelogEntry[] = [];
  const operatorNames = loadOperatorNames();
  const today = new Date().toISOString().split('T')[0];
  
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
    
    // Find changes
    const allKeys = new Set([...currentTiers.keys(), ...committedTiers.keys()]);
    
    for (const key of allKeys) {
      const [operatorId] = key.split(':');
      const current = currentTiers.get(key);
      const committed = committedTiers.get(key);
      
      if (!current && committed) {
        // Operator removed from niche
        changes.push({
          date: today,
          operatorId,
          operatorName: operatorNames[operatorId] || operatorId,
          niche: currentList.niche,
          nicheFilename,
          oldTier: committed.tier,
          newTier: null,
          oldLevel: committed.level,
          newLevel: '',
          justification: ''
        });
      } else if (current && !committed) {
        // Operator added to niche
        changes.push({
          date: today,
          operatorId,
          operatorName: operatorNames[operatorId] || operatorId,
          niche: currentList.niche,
          nicheFilename,
          oldTier: null,
          newTier: current.tier,
          oldLevel: '',
          newLevel: current.level,
          justification: ''
        });
      } else if (current && committed && current.tier !== committed.tier) {
        // Tier changed
        changes.push({
          date: today,
          operatorId,
          operatorName: operatorNames[operatorId] || operatorId,
          niche: currentList.niche,
          nicheFilename,
          oldTier: committed.tier,
          newTier: current.tier,
          oldLevel: committed.level,
          newLevel: current.level,
          justification: ''
        });
      }
    }
  }
  
  return changes;
}

function loadChangelog(): Changelog {
  if (fs.existsSync(CHANGELOG_PATH)) {
    return JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf-8'));
  }
  return { entries: [] };
}

function saveChangelog(changelog: Changelog): void {
  fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2));
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
