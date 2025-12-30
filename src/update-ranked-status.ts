/**
 * Script to update the "niches" array of operators based on tier lists
 * Checks which tier lists each operator appears in and updates the niches array
 */

import { loadAllNicheLists } from './niche-list-utils';
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
}

function getTrashOperators(): Set<string> {
  const trashFilePath = path.join(__dirname, '../data/niche-lists', 'trash-operators.json');
  const trashOperators = new Set<string>();

  if (fs.existsSync(trashFilePath)) {
    try {
      const content = fs.readFileSync(trashFilePath, 'utf-8');
      const trashData = JSON.parse(content);
      if (trashData.operators && typeof trashData.operators === 'object' && !Array.isArray(trashData.operators)) {
        // Dictionary format
        for (const operatorId of Object.keys(trashData.operators)) {
          trashOperators.add(operatorId);
        }
      } else if (trashData.operators && Array.isArray(trashData.operators)) {
        // Legacy array format (for backwards compatibility)
        for (const op of trashData.operators) {
          if (typeof op === 'string') {
            trashOperators.add(op);
          } else if (op.operatorId) {
            trashOperators.add(op.operatorId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading trash operators:', error);
    }
  }

  return trashOperators;
}

function getOperatorNiches(): Map<string, string[]> {
  const operatorLists = loadAllNicheLists();
  const operatorNiches = new Map<string, string[]>();
  
  // Collection is now keyed by filename
  for (const [filename, operatorList] of Object.entries(operatorLists)) {
    // Skip if operatorList doesn't have operators dictionary
    if (!operatorList.operators || typeof operatorList.operators !== 'object') {
      continue;
    }
    
    for (const operatorId of Object.keys(operatorList.operators)) {
      if (!operatorNiches.has(operatorId)) {
        operatorNiches.set(operatorId, []);
      }
      const niches = operatorNiches.get(operatorId)!;
      // Store filename codes, not display names
      if (!niches.includes(filename)) {
        niches.push(filename);
      }
    }
  }

  // Add trash operators to niches (using internal code "trash-operators")
  const trashOperators = getTrashOperators();
  for (const operatorId of trashOperators) {
    if (!operatorNiches.has(operatorId)) {
      operatorNiches.set(operatorId, []);
    }
    const niches = operatorNiches.get(operatorId)!;
    if (!niches.includes('trash-operators')) {
      niches.push('trash-operators');
    }
  }

  // Apply build-time rules: fragile -> def-shred + res-shred, dual-dps -> arts-dps + physical-dps
  for (const [_operatorId, niches] of operatorNiches.entries()) {
    // If operator is in fragile niche, also add def-shred and res-shred
    if (niches.includes('fragile')) {
      if (!niches.includes('def-shred')) {
        niches.push('def-shred');
      }
      if (!niches.includes('res-shred')) {
        niches.push('res-shred');
      }
    }

    // If operator is in dual-dps niche, also add arts-dps and physical-dps
    if (niches.includes('dual-dps')) {
      if (!niches.includes('arts-dps')) {
        niches.push('arts-dps');
      }
      if (!niches.includes('physical-dps')) {
        niches.push('physical-dps');
      }
    }
  }

  return operatorNiches;
}

function updateOperatorFiles(operatorNiches: Map<string, string[]>): {
  updated: number;
  unranked: string[];
} {
  const dataDir = path.join(__dirname, '../data');
  const rarities = [1, 2, 3, 4, 5, 6];
  const unrankedOperators: string[] = [];
  let totalUpdated = 0;

  for (const rarity of rarities) {
    const filePath = path.join(dataDir, `operators-${rarity}star.json`);
    
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const operators: Record<string, OperatorData> = JSON.parse(content);
    let fileUpdated = false;

    for (const [id, operator] of Object.entries(operators)) {
      const niches = operatorNiches.get(id) || [];
      // Handle migration from old 'ranked' field
      const currentNiches = operator.niches || [];
      
      // Sort arrays for comparison
      const sortedNewNiches = [...niches].sort();
      const sortedCurrentNiches = [...currentNiches].sort();
      
      // Check if arrays are different
      const arraysEqual = sortedNewNiches.length === sortedCurrentNiches.length &&
        sortedNewNiches.every((val, idx) => val === sortedCurrentNiches[idx]);
      
      // Also check if we need to remove old 'ranked' field
      const hasOldRankedField = 'ranked' in operator;
      
      // 1, 2, and 3-star operators are always globally available
      const needsGlobalFix = (rarity === 1 || rarity === 2 || rarity === 3) && operator.global === false;
      
      if (!arraysEqual || hasOldRankedField || needsGlobalFix) {
        const updatedOperator: any = {
          ...operator,
          niches: sortedNewNiches
        };
        // Remove old 'ranked' field if it exists
        if (hasOldRankedField) {
          delete updatedOperator.ranked;
        }
        // Fix global status for 1, 2, and 3-star operators
        if (needsGlobalFix) {
          updatedOperator.global = true;
        }
        operators[id] = updatedOperator;
        fileUpdated = true;
        totalUpdated++;
      }

      // Only add to unranked if not in any niche (including trash)
      if (niches.length === 0) {
        unrankedOperators.push(`${id} (${operator.name})`);
      }
    }

    if (fileUpdated) {
      fs.writeFileSync(filePath, JSON.stringify(operators, null, 2));
      console.log(`✅ Updated operators-${rarity}star.json`);
    }
  }

  return {
    updated: totalUpdated,
    unranked: unrankedOperators.sort()
  };
}

function writeUnrankedLog(unrankedOperators: string[]): void {
  const logPath = path.join(__dirname, '../data/unranked-operators.txt');
  const content = unrankedOperators.length > 0
    ? `Unranked Operators (${unrankedOperators.length} total)\n` +
      `Generated: ${new Date().toISOString()}\n\n` +
      unrankedOperators.join('\n')
    : `All operators are ranked!\nGenerated: ${new Date().toISOString()}`;

  fs.writeFileSync(logPath, content);
  console.log(`📝 Wrote unranked operators log to: ${logPath}`);
}

async function main() {
  console.log('🔍 Checking operator niches...\n');

  // Get all operator IDs and their niches
  const operatorNiches = getOperatorNiches();
  const trashOperators = getTrashOperators();
  const rankedCount = operatorNiches.size;
  console.log(`Found ${rankedCount} unique operators in operator lists`);
  console.log(`Found ${trashOperators.size} operators in trash list\n`);

  // Update operator files
  const { updated, unranked } = updateOperatorFiles(operatorNiches);

  console.log(`\n📊 Summary:`);
  console.log(`   Updated operators: ${updated}`);
  console.log(`   Unranked operators: ${unranked.length}`);

  // Write unranked operators to log file
  writeUnrankedLog(unranked);

  if (unranked.length > 0) {
    console.log(`\n⚠️  ${unranked.length} operators are not in any operator list`);
    console.log(`   See data/unranked-operators.txt for details`);
  } else {
    console.log(`\n✅ All operators are listed in at least one operator list!`);
  }
}

main().catch(console.error);
