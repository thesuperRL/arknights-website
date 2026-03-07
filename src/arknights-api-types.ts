/**
 * Minimal types and constants for Arknights/Yostar auth and game data.
 * Adapted from neeia/ak-roster (https://github.com/neeia/ak-roster) types/arknightsApiTypes/apiTypes.ts
 */

export type YostarServer = 'en' | 'jp' | 'kr';
export type ArknightsServer = 'en' | 'jp' | 'kr' | 'cn' | 'bili' | 'tw';
export type Distributor = 'yostar' | 'hypergryph' | 'bilibili';

export const channelIds: { [K in Distributor]: string } = {
  hypergryph: '1',
  bilibili: '2',
  yostar: '3',
};

export const yostarDomains: Record<YostarServer, string> = {
  en: 'https://en-sdk-api.yostarplat.com',
  jp: 'https://jp-sdk-api.yostarplat.com',
  kr: 'https://jp-sdk-api.yostarplat.com',
};

export const networkConfigUrls: { [K in ArknightsServer]: string } = {
  en: 'https://ak-conf.arknights.global/config/prod/official/network_config',
  jp: 'https://ak-conf.arknights.jp/config/prod/official/network_config',
  kr: 'https://ak-conf.arknights.kr/config/prod/official/network_config',
  cn: 'https://ak-conf.hypergryph.com/config/prod/official/network_config',
  bili: 'https://ak-conf.hypergryph.com/config/prod/b/network_config',
  tw: 'https://ak-conf.txwy.tw/config/prod/official/network_config',
};

export interface YostarToken {
  result: number;
  uid: string;
  token: string;
}

export interface U8Token {
  result: number;
  uid: string;
  token: string;
}

export interface LoginSecret {
  result: number;
  uid: string;
  secret: string;
}

export interface VersionInfo {
  resVersion: string;
  clientVersion: string;
}

export interface PlayerData {
  result: number;
  user: UserData;
}

export interface TokenData {
  deviceId: string;
  token: YostarToken;
}

export interface UserData {
  status?: { level?: number };
  troop: RosterData;
  [key: string]: unknown;
}

export interface RosterData {
  chars: { [id: string]: CharacterData | undefined };
  [key: string]: unknown;
}

export interface CharacterData {
  charId: string;
  evolvePhase: number;
  level: number;
  equip: { [id: string]: ModuleData | undefined };
  tmpl?: { [id: string]: CharTemplateData };
  [key: string]: unknown;
}

export interface CharTemplateData {
  evolvePhase?: number;
  level?: number;
  equip?: { [id: string]: ModuleData | undefined };
  [key: string]: unknown;
}

export interface ModuleData {
  level: number;
  locked: number;
  hide?: number;
}
