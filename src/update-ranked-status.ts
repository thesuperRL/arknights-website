/**
 * Script to update the "niches" array of operators based on tier lists
 * Checks which tier lists each operator appears in and updates the niches array
 */

import { loadAllNicheLists, loadNicheList } from './niche-list-utils';
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

function loadAllOperators(): Record<string, OperatorData> {
  const dataDir = path.join(__dirname, '../data');
  const operators: Record<string, OperatorData> = {};
  const rarities = [1, 2, 3, 4, 5, 6];
  
  for (const rarity of rarities) {
    const filePath = path.join(dataDir, `operators-${rarity}star.json`);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        Object.assign(operators, data);
      } catch (error) {
        console.error(`Error loading operators-${rarity}star.json:`, error);
      }
    }
  }
  
  return operators;
}

function getOperatorNiches(allOperators: Record<string, OperatorData>): Map<string, string[]> {
  const operatorLists = loadAllNicheLists();
  const operatorNiches = new Map<string, string[]>();
  const unrecognizedOperators: Array<{ operatorId: string; niche: string }> = [];
  
  // Collection is now keyed by filename
  for (const [filename, operatorList] of Object.entries(operatorLists)) {
    // Skip if operatorList doesn't have operators dictionary
    if (!operatorList.operators || typeof operatorList.operators !== 'object') {
      continue;
    }
    
    // Iterate through rating groups
    for (const operatorsInRating of Object.values(operatorList.operators)) {
      if (operatorsInRating) {
        for (const operatorId of Object.keys(operatorsInRating)) {
          // Validate that operator ID exists
          if (!allOperators[operatorId]) {
            unrecognizedOperators.push({ operatorId, niche: operatorList.niche });
            continue; // Skip unrecognized operators
          }
          
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
    }
  }
  
  // Report unrecognized operators
  if (unrecognizedOperators.length > 0) {
    console.error('\n❌ Unrecognized operator IDs found in niche lists:');
    for (const { operatorId, niche } of unrecognizedOperators) {
      console.error(`   - ${operatorId} in "${niche}"`);
    }
    console.error('\nPlease fix these errors before building.');
    process.exit(1);
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
  
  if (unrankedOperators.length === 0) {
    const content = `All operators are ranked!\nGenerated: ${new Date().toISOString()}`;
    fs.writeFileSync(logPath, content);
    console.log(`📝 Wrote unranked operators log to: ${logPath}`);
    return;
  }

  // Load all operators to get global and class information
  const allOperators = loadAllOperators();
  
  // Parse operator IDs from the unranked list (format: "id (name)")
  const operatorIds: string[] = [];
  for (const entry of unrankedOperators) {
    const match = entry.match(/^(\S+)\s/);
    if (match) {
      operatorIds.push(match[1]);
    }
  }
  
  // Group operators by global availability, then by class
  const globalOperators: { [className: string]: Array<{ id: string; name: string }> } = {};
  const nonGlobalOperators: { [className: string]: Array<{ id: string; name: string }> } = {};
  
  for (const operatorId of operatorIds) {
    const operator = allOperators[operatorId];
    if (!operator) {
      console.warn(`Warning: Operator ${operatorId} not found in operators data`);
      continue;
    }
    
    const operatorInfo = {
      id: operatorId,
      name: operator.name
    };
    
    if (operator.global) {
      if (!globalOperators[operator.class]) {
        globalOperators[operator.class] = [];
      }
      globalOperators[operator.class].push(operatorInfo);
    } else {
      if (!nonGlobalOperators[operator.class]) {
        nonGlobalOperators[operator.class] = [];
      }
      nonGlobalOperators[operator.class].push(operatorInfo);
    }
  }
  
  // Sort classes alphabetically
  const sortedGlobalClasses = Object.keys(globalOperators).sort();
  const sortedNonGlobalClasses = Object.keys(nonGlobalOperators).sort();
  
  // Sort operators within each class by name
  for (const className of sortedGlobalClasses) {
    globalOperators[className].sort((a, b) => a.name.localeCompare(b.name));
  }
  for (const className of sortedNonGlobalClasses) {
    nonGlobalOperators[className].sort((a, b) => a.name.localeCompare(b.name));
  }
  
  // Build the new content
  const newLines: string[] = [];
  
  // Add header
  newLines.push(`Unranked Operators (${operatorIds.length} total)`);
  newLines.push(`Generated: ${new Date().toISOString()}`);
  newLines.push('');
  
  // Add Global operators section
  if (sortedGlobalClasses.length > 0) {
    newLines.push('=== GLOBAL OPERATORS ===');
    newLines.push('');
    
    for (const className of sortedGlobalClasses) {
      newLines.push(`--- ${className} ---`);
      for (const op of globalOperators[className]) {
        newLines.push(`${op.id} (${op.name})`);
      }
      newLines.push('');
    }
  }
  
  // Add Non-Global operators section
  if (sortedNonGlobalClasses.length > 0) {
    newLines.push('=== NON-GLOBAL OPERATORS ===');
    newLines.push('');
    
    for (const className of sortedNonGlobalClasses) {
      newLines.push(`--- ${className} ---`);
      for (const op of nonGlobalOperators[className]) {
        newLines.push(`${op.id} (${op.name})`);
      }
      newLines.push('');
    }
  }
  
  // Write the reorganized content
  fs.writeFileSync(logPath, newLines.join('\n'), 'utf-8');
  console.log(`📝 Wrote unranked operators log to: ${logPath}`);
}

/**
 * Capitalizes the first character of a string if it's not empty and capitalizable
 */
function capitalizeFirst(str: string): string {
  if (!str || str.length === 0) {
    return str;
  }
  const firstChar = str.charAt(0);
  // Only capitalize if it's a lowercase letter
  if (firstChar >= 'a' && firstChar <= 'z') {
    return firstChar.toUpperCase() + str.slice(1);
  }
  return str;
}

/**
 * Capitalizes the first character of all notes in all niche lists
 */
function capitalizeAllNotes(): void {
  const nicheListsDir = path.join(__dirname, '../data/niche-lists');
  const nicheLists = loadAllNicheLists(nicheListsDir);
  let updatedFiles = 0;

  for (const [filename, operatorList] of Object.entries(nicheLists)) {
    if (!operatorList.operators) continue;

    let fileUpdated = false;
    const updatedOperators: Partial<Record<string, Record<string, string>>> = {};

    // Process each rating group
    for (const [rating, operatorsInRating] of Object.entries(operatorList.operators)) {
      if (operatorsInRating) {
        const updatedOperatorsInRating: Record<string, string> = {};
        for (const [operatorId, description] of Object.entries(operatorsInRating)) {
          const capitalizedDescription = capitalizeFirst(description || '');
          if (capitalizedDescription !== description) {
            fileUpdated = true;
            updatedOperatorsInRating[operatorId] = capitalizedDescription;
          } else {
            updatedOperatorsInRating[operatorId] = description;
          }
        }
        updatedOperators[rating] = updatedOperatorsInRating;
      }
    }

    if (fileUpdated) {
      operatorList.operators = updatedOperators;
      const filePath = path.join(nicheListsDir, `${filename}.json`);
      fs.writeFileSync(filePath, JSON.stringify(operatorList, null, 2));
      updatedFiles++;
    }
  }

  if (updatedFiles > 0) {
    console.log(`✅ Capitalized notes in ${updatedFiles} niche list file(s)`);
  }
}

/**
 * Copies dual-dps operators to arts-dps and physical-dps lists at build time
 */
function copyOperatorsToDerivedNiches(): void {
  const nicheListsDir = path.join(__dirname, '../data/niche-lists');
  let updatedFiles = 0;


  if (updatedFiles > 0) {
    console.log(`\n📋 Updated ${updatedFiles} niche list file(s) with derived operators`);
  }
}

async function main() {
  console.log('🔍 Checking operator niches...\n');

  // Capitalize first letter of all notes in all niche lists
  console.log('📝 Capitalizing notes in niche lists...\n');
  capitalizeAllNotes();
  console.log('');

  // Copy fragile operators to their derived niches at build time
  console.log('📋 Copying operators to derived niches...\n');
  copyOperatorsToDerivedNiches();
  console.log('');

  // Load all operators first for validation
  const allOperators = loadAllOperators();
  console.log(`Loaded ${Object.keys(allOperators).length} operators from data files\n`);

  // Get all operator IDs and their niches (with validation)
  const operatorNiches = getOperatorNiches(allOperators);
  const trashOperators = getTrashOperators();
  
  // Validate trash operators too
  const unrecognizedTrash: string[] = [];
  for (const operatorId of trashOperators) {
    if (!allOperators[operatorId]) {
      unrecognizedTrash.push(operatorId);
    }
  }
  
  if (unrecognizedTrash.length > 0) {
    console.error('\n❌ Unrecognized operator IDs found in trash-operators.json:');
    for (const operatorId of unrecognizedTrash) {
      console.error(`   - ${operatorId}`);
    }
    console.error('\nPlease fix these errors before building.');
    process.exit(1);
  }
  
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
