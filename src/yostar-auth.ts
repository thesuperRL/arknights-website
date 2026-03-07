/**
 * Yostar/Hypergryph Arknights auth: send code to email, exchange for token, fetch game data.
 * Adapted from neeia/ak-roster (https://github.com/neeia/ak-roster) util/hgApi/yostarAuth.ts
 * Reference: https://github.com/thesadru/ArkPRTS/blob/master/arkprts/auth.py
 */

import * as crypto from 'crypto';
import {
  channelIds,
  type Distributor,
  type LoginSecret,
  networkConfigUrls,
  type PlayerData,
  type TokenData,
  type U8Token,
  type UserData,
  type VersionInfo,
  type YostarServer,
  type YostarToken,
  yostarDomains,
} from './arknights-api-types';

const sendCodeEndpoint = '/yostar/send-code';
const submitCodeEndpoint = '/yostar/get-auth';
const getYostarTokenEndpoint = '/user/login';
const getu8TokenEndpoint = '/user/v1/getToken';
const loginEndpoint = '/account/login';
const getDataEndpoint = '/account/syncData';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'X-Unity-Version': '2017.4.39f1',
  'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 11; KB2000 Build/RP1A.201005.001)',
  Connection: 'Keep-Alive',
};

function randomUUID(): string {
  return crypto.randomUUID();
}

function generateYostarplatHeaders(body: string, server: YostarServer = 'en'): Record<string, string> {
  const linkedHashMap: Record<string, string | number> = {
    PID: server === 'en' ? 'US-ARKNIGHTS' : server === 'jp' ? 'JP-AK' : 'KR-ARKNIGHTS',
    Channel: 'googleplay',
    Platform: 'android',
    Version: '4.10.0',
    GVersionNo: '2000112',
    GBuildNo: '',
    Lang: server === 'en' ? 'en' : server === 'jp' ? 'jp' : 'ko',
    DeviceID: randomUUID(),
    DeviceModel: 'F9',
    UID: '',
    Token: '',
    Time: Math.floor(Date.now() / 1000),
  };
  const jsonString = JSON.stringify(linkedHashMap, null, '');
  const md5Hash = crypto
    .createHash('md5')
    .update(jsonString + body + '886c085e4a8d30a703367b120dd8353948405ec2')
    .digest('hex');
  const headerAuth = { Head: linkedHashMap, Sign: md5Hash.toUpperCase() };
  return {
    ...defaultHeaders,
    Authorization: JSON.stringify(headerAuth, null, ''),
  };
}

export async function sendTokenToMail(mail: string, server: YostarServer): Promise<boolean> {
  const baseurl = yostarDomains[server];
  const body = { Account: mail, Randstr: '', Ticket: '' };
  const headers = generateYostarplatHeaders(JSON.stringify(body), server);
  const sendMail = await fetch(baseurl + sendCodeEndpoint, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
  return sendMail.ok;
}

async function getYostarAuthData(mail: string, code: string, server: YostarServer): Promise<YostarToken | null> {
  const baseurl = yostarDomains[server];
  const body = { Account: mail, Code: code };
  const headers = generateYostarplatHeaders(JSON.stringify(body), server);
  const codeAuthResponse = await fetch(baseurl + submitCodeEndpoint, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
  if (!codeAuthResponse.ok) return null;
  const codeAuthResult = (await codeAuthResponse.json()) as { Code?: number; Data?: { Token?: string } };
  if (codeAuthResult.Code !== 200 || !codeAuthResult.Data?.Token) return null;
  const token = codeAuthResult.Data.Token;
  const yostarTokenBody = {
    CheckAccount: 0,
    Geetest: {
      CaptchaID: null,
      CaptchaOutput: null,
      GenTime: null,
      LotNumber: null,
      PassToken: null,
    },
    OpenID: mail,
    Secret: '',
    Token: token,
    Type: 'yostar',
    UserName: mail,
  };
  const yostarTokenHeaders = generateYostarplatHeaders(JSON.stringify(yostarTokenBody), server);
  const yostarTokenResponse = await fetch(baseurl + getYostarTokenEndpoint, {
    method: 'POST',
    body: JSON.stringify(yostarTokenBody),
    headers: yostarTokenHeaders,
  });
  if (!yostarTokenResponse.ok) return null;
  const yostarTokenResult = (await yostarTokenResponse.json()) as {
    Code?: number;
    Data?: { UserInfo?: { ID?: string; Token?: string } };
  };
  if (yostarTokenResult.Code !== 200 || !yostarTokenResult.Data?.UserInfo) return null;
  return {
    result: 0,
    uid: yostarTokenResult.Data.UserInfo.ID ?? '',
    token: yostarTokenResult.Data.UserInfo.Token ?? '',
  };
}

async function getNetworkConfig(server: YostarServer): Promise<Record<string, string>> {
  const networkConfigUrl = networkConfigUrls[server];
  const networkResponse = (await fetch(networkConfigUrl, { headers: defaultHeaders }).then((res) =>
    res.json()
  )) as Record<string, unknown>;
  const content = networkResponse['content'] as string;
  const jsonContent = JSON.parse(content) as { configs: Record<string, { network: Record<string, string> }>; funcVer: string };
  return jsonContent['configs'][jsonContent['funcVer']]['network'] as Record<string, string>;
}

async function getVersionConfig(networkConfig: Record<string, string>): Promise<VersionInfo> {
  const hvUrl = networkConfig['hv']?.replace('{0}', 'Android') ?? '';
  const versionResponse = await fetch(hvUrl, { headers: defaultHeaders });
  return (await versionResponse.json()) as VersionInfo;
}

function generateU8Sign(data: Record<string, unknown>): string {
  const sorted = Object.keys(data)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = data[key];
      return acc;
    }, {});
  const query = new URLSearchParams(sorted as Record<string, string>).toString();
  const hmac = crypto.createHmac('sha1', '91240f70c09a08a6bc72af1a5c8d4670');
  return hmac.update(query).digest('hex').toLowerCase();
}

async function getU8Token(
  yostarTokenUid: string,
  accessToken: string,
  deviceId1: string,
  deviceId2: string,
  deviceId3: string,
  distributor: Distributor,
  networkConfig: Record<string, string>
): Promise<U8Token | null> {
  const u8Url = networkConfig['u8'];
  const channelId = channelIds[distributor];
  const extension = { type: 1, uid: yostarTokenUid, token: accessToken };
  const u8Body: Record<string, unknown> = {
    appId: '1',
    platform: 1,
    channelId,
    subChannel: channelId,
    extension: JSON.stringify(extension),
    worldId: channelId,
    deviceId: deviceId1,
    deviceId2,
    deviceId3,
  };
  u8Body.sign = generateU8Sign(u8Body);
  const u8TokenResponse = await fetch(u8Url + getu8TokenEndpoint, {
    method: 'POST',
    body: JSON.stringify(u8Body),
    headers: defaultHeaders,
  });
  if (!u8TokenResponse.ok) return null;
  const u8Token = (await u8TokenResponse.json()) as U8Token;
  return u8Token.result === 0 ? u8Token : null;
}

async function getLoginSecret(
  u8Token: string,
  u8Uid: string,
  deviceId1: string,
  deviceId2: string,
  deviceId3: string,
  networkConfig: Record<string, string>
): Promise<LoginSecret | null> {
  const gsUrl = networkConfig['gs'];
  const versionConfig = await getVersionConfig(networkConfig);
  const getSecretBody = {
    platform: 1,
    networkVersion: '1',
    assetsVersion: versionConfig.resVersion,
    clientVersion: versionConfig.clientVersion,
    token: u8Token,
    uid: u8Uid,
    deviceId: deviceId1,
    deviceId2,
    deviceId3,
  };
  const headers = {
    ...defaultHeaders,
    secret: '',
    seqnum: '1',
    uid: u8Uid,
  };
  const loginResponse = await fetch(gsUrl + loginEndpoint, {
    method: 'POST',
    body: JSON.stringify(getSecretBody),
    headers,
  });
  if (!loginResponse.ok) return null;
  const loginSecret = (await loginResponse.json()) as LoginSecret;
  return loginSecret.result === 0 ? loginSecret : null;
}

async function getData(
  loginSecret: string,
  loginUid: string,
  networkConfig: Record<string, string>
): Promise<UserData | null> {
  const gsUrl = networkConfig['gs'];
  const dataBody = { platform: 1 };
  const dataHeaders = {
    ...defaultHeaders,
    secret: loginSecret,
    uid: loginUid,
    seqnum: '2',
  };
  const dataResponse = await fetch(gsUrl + getDataEndpoint, {
    method: 'POST',
    body: JSON.stringify(dataBody),
    headers: dataHeaders,
  });
  if (!dataResponse.ok) return null;
  const dataResult = (await dataResponse.json()) as PlayerData;
  return dataResult.result === 0 ? dataResult.user : null;
}

async function getGameDataWithTokenInternal(
  yostarToken: YostarToken,
  deviceId1: string,
  deviceId2: string,
  deviceId3: string,
  distributor: Distributor,
  _server: YostarServer,
  networkConfig: Record<string, string>
): Promise<UserData | null> {
  const u8Token = await getU8Token(
    yostarToken.uid,
    yostarToken.token,
    deviceId1,
    deviceId2,
    deviceId3,
    distributor,
    networkConfig
  );
  if (!u8Token) return null;
  const loginSecret = await getLoginSecret(
    u8Token.token,
    u8Token.uid,
    deviceId1,
    deviceId2,
    deviceId3,
    networkConfig
  );
  if (!loginSecret) return null;
  const data = await getData(loginSecret.secret, loginSecret.uid, networkConfig);
  if (data) {
    (data as UserData & { tokenData?: TokenData }).tokenData = {
      token: yostarToken,
      deviceId: deviceId1,
    };
  }
  return data;
}

export async function getGameData(
  mail: string,
  code: string,
  server: YostarServer
): Promise<UserData | null> {
  const deviceId1 = randomUUID();
  const deviceId2 = '';
  const deviceId3 = '';
  const distributor: Distributor = 'yostar';
  const networkConfig = await getNetworkConfig(server);
  const yostarToken = await getYostarAuthData(mail, code, server);
  if (!yostarToken) return null;
  return getGameDataWithTokenInternal(
    yostarToken,
    deviceId1,
    deviceId2,
    deviceId3,
    distributor,
    server,
    networkConfig
  );
}

export async function getGameDataWithToken(
  tokenData: TokenData,
  server: YostarServer
): Promise<UserData | null> {
  const deviceId2 = '';
  const deviceId3 = '';
  const distributor: Distributor = 'yostar';
  const networkConfig = await getNetworkConfig(server);
  return getGameDataWithTokenInternal(
    tokenData.token,
    tokenData.deviceId,
    deviceId2,
    deviceId3,
    distributor,
    server,
    networkConfig
  );
}
