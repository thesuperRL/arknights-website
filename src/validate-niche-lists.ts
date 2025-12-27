/**
 * Script to validate operator lists against operator data
 */

import { loadAllNicheLists, validateNicheList } from './niche-list-utils';
import * as fs from 'fs';
import * as path from 'path';

function main() {
  const dataDir = path.join(__dirname, '../data');
  const operatorListsDir = path.join(dataDir, 'niche-lists');
  
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

  // Load all niche lists (collection is now keyed by filename)
  const nicheLists = loadAllNicheLists(operatorListsDir);
  const niches = Object.keys(nicheLists);
  
  console.log(`Found ${niches.length} niche lists:\n`);

  let totalErrors = 0;
  let totalOperators = 0;

  for (const filename of niches) {
    const operatorList = nicheLists[filename];
    const validation = validateNicheList(operatorList, operatorsData);
    
    // Count operators in this operator list
    const operatorCount = operatorList.operators ? Object.keys(operatorList.operators).length : 0;
    totalOperators += operatorCount;

    console.log(`📊 ${operatorList.niche} (${filename}):`);
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
  console.log(`   Total operators in operator lists: ${totalOperators}`);
  console.log(`   Total errors: ${totalErrors}`);
  
  if (totalErrors === 0) {
    console.log(`\n✅ All operator lists are valid!`);
    process.exit(0);
  } else {
    console.log(`\n❌ Please fix the errors above.`);
    process.exit(1);
  }
}

main();

