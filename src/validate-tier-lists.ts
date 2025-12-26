/**
 * Script to validate tier lists against operator data
 */

import { loadAllTierLists, validateTierList } from './tier-list-utils';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const dataDir = path.join(__dirname, '../data');
  const tierListsDir = path.join(dataDir, 'tier-lists');
  
  // Load all operator data
  const operatorsData: Record<string, any> = {};
  const rarities = [1, 2, 3, 4, 5, 6];
  
  for (const rarity of rarities) {
    const filePath = path.join(dataDir, `operators-${rarity}star.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const operators = JSON.parse(content);
      Object.assign(operatorsData, operators);
    }
  }

  console.log(`Loaded ${Object.keys(operatorsData).length} operators\n`);

  // Load all tier lists
  const tierLists = loadAllTierLists(tierListsDir);
  const niches = Object.keys(tierLists);
  
  console.log(`Found ${niches.length} tier lists:\n`);

  let totalErrors = 0;
  let totalOperators = 0;

  for (const niche of niches) {
    const tierList = tierLists[niche];
    const validation = validateTierList(tierList, operatorsData);
    
    // Count operators in this tier list
    const tierRanks = ['EX', 'S', 'A', 'B', 'C', 'D', 'F'] as const;
    let operatorCount = 0;
    for (const rank of tierRanks) {
      operatorCount += (tierList.tiers[rank] || []).length;
    }
    totalOperators += operatorCount;

    console.log(`📊 ${niche}:`);
    console.log(`   Operators: ${operatorCount}`);
    console.log(`   Status: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`);
    
    if (!validation.valid) {
      totalErrors += validation.errors.length;
      console.log(`   Errors:`);
      for (const error of validation.errors) {
        console.log(`     - ${error}`);
      }
    }
    console.log('');
  }

  console.log(`\n📈 Summary:`);
  console.log(`   Total niches: ${niches.length}`);
  console.log(`   Total operators in tier lists: ${totalOperators}`);
  console.log(`   Total errors: ${totalErrors}`);
  
  if (totalErrors === 0) {
    console.log(`\n✅ All tier lists are valid!`);
    process.exit(0);
  } else {
    console.log(`\n❌ Please fix the errors above.`);
    process.exit(1);
  }
}

main().catch(console.error);

