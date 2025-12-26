/**
 * TypeScript Types and Objects
 * Define your TypeScript objects, interfaces, types, and classes here
 */

// Example: Interface for a character
export interface Character {
  id: string;
  name: string;
  rarity: number;
  class: string;
  description?: string;
  profileImage: string; // URL to online profile image
}

// Example: Type alias
export type Rarity = 1 | 2 | 3 | 4 | 5 | 6;

// Example: Class
export class Operator {
  constructor(
    public id: string,
    public name: string,
    public rarity: Rarity,
    public classType: string,
    public profileImage: string, // URL to online profile image
    public global: boolean = false
  ) {}

  getInfo(): string {
    return `${this.name} (${this.classType}) - ${this.rarity}★`;
  }

  getImageUrl(): string {
    return this.profileImage;
  }
}

// Example: Enum
export enum OperatorClass {
  GUARD = 'Guard',
  CASTER = 'Caster',
  DEFENDER = 'Defender',
  SNIPER = 'Sniper',
  SUPPORT = 'Support',
  SPECIALIST = 'Specialist',
  VANGUARD = 'Vanguard',
  MEDIC = 'Medic'
}

// Example: Generic type
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Example: Union type
export type Status = 'active' | 'inactive' | 'pending';

// Example: Object with optional properties
export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  lastLogin?: Date;
  preferences?: {
    theme: 'light' | 'dark';
    language: string;
  };
}

// Add your own TypeScript objects, interfaces, types, and classes below:

