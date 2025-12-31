/**
 * Script to rename "characters" attribute to "internalName" in all operator JSON files
 */

import * as fs from 'fs';
import * as path from 'path';

function renameCharactersToInternalName(): void {
  const dataDir = path.join(__dirname, '../data');
  const rarities = [1, 2, 3, 4, 5, 6];
  let totalRenamed = 0;

  for (const rarity of rarities) {
    const filePath = path.join(dataDir, `operators-${rarity}star.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: operators-${rarity}star.json`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const operators: Record<string, any> = JSON.parse(content);
    let fileUpdated = false;
    let renamedCount = 0;

    for (const [id, operator] of Object.entries(operators)) {
      if ('characters' in operator && !('internalName' in operator)) {
        // Rename characters to internalName
        operators[id] = {
          ...operator,
          internalName: operator.characters,
        };
        delete operators[id].characters;
        fileUpdated = true;
        renamedCount++;
        totalRenamed++;
      }
    }

    if (fileUpdated) {
      fs.writeFileSync(filePath, JSON.stringify(operators, null, 2));
      console.log(`✅ Updated operators-${rarity}star.json (renamed ${renamedCount} operators)`);
    } else {
      console.log(`✓ operators-${rarity}star.json already updated`);
    }
  }

  // Also update operators-all.json if it exists
  const allOperatorsPath = path.join(dataDir, 'operators-all.json');
  if (fs.existsSync(allOperatorsPath)) {
    const content = fs.readFileSync(allOperatorsPath, 'utf-8');
    const operators: Record<string, any> = JSON.parse(content);
    let fileUpdated = false;
    let renamedCount = 0;

    for (const [id, operator] of Object.entries(operators)) {
      if ('characters' in operator && !('internalName' in operator)) {
        operators[id] = {
          ...operator,
          internalName: operator.characters,
        };
        delete operators[id].characters;
        fileUpdated = true;
        renamedCount++;
        totalRenamed++;
      }
    }

    if (fileUpdated) {
      fs.writeFileSync(allOperatorsPath, JSON.stringify(operators, null, 2));
      console.log(`✅ Updated operators-all.json (renamed ${renamedCount} operators)`);
    } else {
      console.log(`✓ operators-all.json already updated`);
    }
  }

  console.log(`\n🎉 Renamed ${totalRenamed} total operators!`);
}

// Run the rename
renameCharactersToInternalName();







