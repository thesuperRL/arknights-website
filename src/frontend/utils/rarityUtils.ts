/**
 * Utility function to get the CSS class for an operator's rarity
 */
export function getRarityClass(rarity: number): string {
  switch (rarity) {
    case 6: return 'rarity-6';
    case 5: return 'rarity-5';
    case 4: return 'rarity-4';
    case 3: return 'rarity-3';
    case 2: return 'rarity-2';
    case 1: return 'rarity-1';
    default: return '';
  }
}





