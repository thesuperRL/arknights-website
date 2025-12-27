/**
 * Script to validate operator lists against operator data
 * Now validates against SQL database instead of JSON files
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { loadAllNicheLists, validateNicheList, closeDbConnection } from './niche-list-utils';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const dataDir = path.join(__dirname, '../data');
  
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

  // Load all niche lists
  const nicheLists = await loadAllNicheLists();
  const niches = Object.keys(nicheLists);
  
  console.log(`Found ${niches.length} niche lists:\n`);

  let totalErrors = 0;
  let totalOperators = 0;

  for (const niche of niches) {
    const operatorList = nicheLists[niche];
    const validation = validateNicheList(operatorList, operatorsData);
    
    // Count operators in this operator list
    const operatorCount = operatorList.operators ? Object.keys(operatorList.operators).length : 0;
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
  console.log(`   Total operators in operator lists: ${totalOperators}`);
  console.log(`   Total errors: ${totalErrors}`);
  
  if (totalErrors === 0) {
    console.log(`\n✅ All operator lists are valid!`);
    await closeDbConnection();
    process.exit(0);
  } else {
    console.log(`\n❌ Please fix the errors above.`);
    await closeDbConnection();
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  await closeDbConnection();
  process.exit(1);
});

