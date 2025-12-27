/**
 * Script to ensure 1, 2, and 3-star operators are always marked as globally available
 */

import * as fs from 'fs';
import * as path from 'path';

interface OperatorData {
  id: string;
  name: string;
  rarity: number;
  class: string;
  global: boolean;
  profileImage: string;
  niches?: string[];
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
  internalName?: string;
}

function fixGlobalStatus(): void {
  const dataDir = path.join(__dirname, '../data');
  const rarities = [1, 2, 3]; // Only fix 1, 2, and 3-star operators
  let totalFixed = 0;

  for (const rarity of rarities) {
    const filePath = path.join(dataDir, `operators-${rarity}star.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: operators-${rarity}star.json`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const operators: Record<string, OperatorData> = JSON.parse(content);
    let fileUpdated = false;
    let fixedCount = 0;

    for (const [id, operator] of Object.entries(operators)) {
      if (operator.rarity === rarity && operator.global === false) {
        operators[id] = {
          ...operator,
          global: true
        };
        fileUpdated = true;
        fixedCount++;
        totalFixed++;
        console.log(`  ✅ Fixed: ${operator.name} (${id}) - set global to true`);
      }
    }

    if (fileUpdated) {
      fs.writeFileSync(filePath, JSON.stringify(operators, null, 2));
      console.log(`✅ Updated operators-${rarity}star.json (fixed ${fixedCount} operators)`);
    } else {
      console.log(`✓ operators-${rarity}star.json already correct`);
    }
  }

  console.log(`\n🎉 Fixed ${totalFixed} total operators!`);
}

// Run the fix
fixGlobalStatus();

