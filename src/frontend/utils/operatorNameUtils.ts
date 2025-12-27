/**
 * Utility function to get operator name based on selected language
 */

export type Language = 'en' | 'cn' | 'tw' | 'jp' | 'kr';

export interface Operator {
  name: string;
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

/**
 * Gets the operator name in the specified language
 * Falls back to the default name if the language-specific name is not available
 * TW name falls back to CN name if unavailable
 */
export function getOperatorName(operator: Operator, language: Language): string {
  // Always fall back to default name if language-specific name is missing, empty, or null
  switch (language) {
    case 'cn':
      return (operator.cnName && operator.cnName.trim()) || operator.name;
    case 'tw':
      // TW name falls back to CN name, then to default name
      return (operator.twName && operator.twName.trim()) || (operator.cnName && operator.cnName.trim()) || operator.name;
    case 'jp':
      return (operator.jpName && operator.jpName.trim()) || operator.name;
    case 'kr':
      return (operator.krName && operator.krName.trim()) || operator.name;
    case 'en':
    default:
      return operator.name;
  }
}

