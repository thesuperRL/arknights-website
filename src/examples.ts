/**
 * Examples of how to use the TypeScript objects from types.ts
 * This file demonstrates usage - you can delete it or use it as a reference
 */

import { Character, Operator, OperatorClass, ApiResponse, User } from './types';

// Example 1: Using an interface
const myCharacter: Character = {
  id: '001',
  name: 'Amiya',
  rarity: 5,
  class: 'Caster',
  description: 'A skilled Caster operator',
  profileImage: 'https://example.com/images/operators/amiya.png'
};

// Example 2: Using a class
const operator = new Operator(
  '002',
  'SilverAsh',
  6,
  OperatorClass.GUARD,
  'https://example.com/images/operators/silverash.png',
  true
);
console.log(operator.getInfo());

// Example 3: Using generic types
const response: ApiResponse<Character> = {
  success: true,
  data: myCharacter,
  message: 'Character retrieved successfully'
};

// Example 4: Creating a user object
const user: User = {
  id: 'user-123',
  username: 'player1',
  email: 'player@example.com',
  createdAt: new Date(),
  lastLogin: new Date(),
  preferences: {
    theme: 'dark',
    language: 'en'
  }
};

// Example 5: Array of objects
const characters: Character[] = [
  {
    id: '001',
    name: 'Amiya',
    rarity: 5,
    class: 'Caster',
    profileImage: 'https://example.com/images/operators/amiya.png'
  },
  {
    id: '002',
    name: 'SilverAsh',
    rarity: 6,
    class: 'Guard',
    profileImage: 'https://example.com/images/operators/silverash.png'
  },
  {
    id: '003',
    name: 'Exusiai',
    rarity: 6,
    class: 'Sniper',
    profileImage: 'https://example.com/images/operators/exusiai.png'
  }
];

// Export examples if needed
export { myCharacter, operator, response, user, characters };

