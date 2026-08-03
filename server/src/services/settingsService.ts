import mongoose from 'mongoose';
import Settings, { ISettings } from '../models/Settings';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

let cachedSettings: ISettings | null = null;
let lastAutoProxyTime = 0;

const mockSettings: any = {
  metaAccessToken: process.env.META_ACCESS_TOKEN || '',
  instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
  facebookPageId: process.env.FACEBOOK_PAGE_ID || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  hfToken: process.env.HF_TOKEN || '',
  pexelsApiKey: process.env.PEXELS_API_KEY || '',
  pixabayApiKey: process.env.PIXABAY_API_KEY || '',
  songLinks: process.env.SONG_LINKS || '',
  proxyUrl: process.env.PROXY_URL || '',
  metaBaseUrl: process.env.META_BASE_URL || '',
  telegramBaseUrl: process.env.TELEGRAM_BASE_URL || ''
};

/**
 * Loads the singleton settings document from MongoDB.
 * Creates it if it doesn't already exist.
 */
export const loadSettings = async (): Promise<ISettings> => {
  if (mongoose.connection.readyState !== 1) {
    return mockSettings as ISettings;
  }
  if (cachedSettings) return cachedSettings;
  
  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) {
    settings = await Settings.create({ key: 'global' });
  }
  
  cachedSettings = settings;
  return settings;
};

/**
 * Gets a specific setting. If the setting is empty in the database,
 * it returns the provided fallback or checks the environment variables.
 */
export const getSetting = async (field: keyof ISettings): Promise<string> => {
  try {
    if (mongoose.connection.readyState === 1) {
      const settings = await loadSettings();
      const dbValue = settings[field];
      if (dbValue && typeof dbValue === 'string' && dbValue.trim() !== '') {
        return dbValue.trim();
      }
    } else {
      const val = mockSettings[field];
      if (val && typeof val === 'string' && val.trim() !== '') {
        return val.trim();
      }
    }
  } catch (error) {
    console.error(`Error loading setting "${field}":`, error);
  }

  // Fallback to environment variables
  const envMapping: Record<string, string[]> = {
    metaAccessToken: ['META_ACCESS_TOKEN'],
    instagramAccountId: ['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_BUSINESS_ID'],
    facebookPageId: ['FACEBOOK_PAGE_ID'],
    telegramBotToken: ['TELEGRAM_BOT_TOKEN'],
    telegramChatId: ['TELEGRAM_CHAT_ID'],
    hfToken: ['HF_TOKEN'],
    pexelsApiKey: ['PEXELS_API_KEY'],
    pixabayApiKey: ['PIXABAY_API_KEY'],
    songLinks: ['SONG_LINKS'],
    proxyUrl: ['PROXY_URL'],
    metaBaseUrl: ['META_BASE_URL'],
    telegramBaseUrl: ['TELEGRAM_BASE_URL']
  };

  const envKeys = envMapping[field] || [];
  for (const envKey of envKeys) {
    const val = process.env[envKey];
    if (val && typeof val === 'string' && val.trim() !== '') {
      return val.trim();
    }
  }

  // Hardcoded defaults
  if (field === 'metaBaseUrl') return 'https://graph.facebook.com';
  if (field === 'telegramBaseUrl') return 'https://api.telegram.org';

  return '';
};

/**
 * Saves/updates settings and clears the current in-memory cache.
 */
export const saveSettings = async (updates: Partial<ISettings>): Promise<ISettings> => {
  const allowedKeys: (keyof ISettings)[] = [
    'metaAccessToken',
    'instagramAccountId',
    'facebookPageId',
    'telegramBotToken',
    'telegramChatId',
    'hfToken',
    'pexelsApiKey',
    'pixabayApiKey',
    'songLinks',
    'proxyUrl',
    'metaBaseUrl',
    'telegramBaseUrl'
  ];

  if (mongoose.connection.readyState !== 1) {
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        mockSettings[key] = updates[key];
      }
    }
    return mockSettings as ISettings;
  }

  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) {
    settings = new Settings({ key: 'global' });
  }

  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      (settings as any)[key] = updates[key];
    }
  }

  await settings.save();
  cachedSettings = settings;
  return settings;
};

/**
 * Automatically fetches fresh elite proxies from Geonode, tests them against
 * the Meta Graph API, and saves the first working proxy to settings.
 * Returns the working proxy URL on success, or null on failure.
 */
export const autoConfigureProxy = async (logger?: (msg: string) => void): Promise<string | null> => {
  const log = (msg: string) => {
    if (logger) logger(msg);
    console.log(msg);
  };

  const now = Date.now();
  if (now - lastAutoProxyTime < 120000) { // 2 minutes cooldown
    log('⏳ Auto-Proxy: Cooldown active. Skipping fresh fetch to prevent spam.');
    return getSetting('proxyUrl');
  }
  lastAutoProxyTime = now;

  try {
    log('📡 Auto-Proxy: Fetching elite proxy list from Geonode...');
    const geonodeRes = await axios.get('https://proxylist.geonode.com/api/proxy-list', {
      params: { limit: 100, page: 1, sort_by: 'responseTime', sort_type: 'asc', anonymityLevel: 'elite', speed: 'fast' },
      timeout: 15000
    });

    const proxies: any[] = geonodeRes.data?.data || [];
    log(`✅ Auto-Proxy: Got ${proxies.length} elite proxies. Testing against Meta API...`);

    const testProxy = async (ip: string, port: string, protocol: string): Promise<string | null> => {
      let proxyUrl: string;
      if (protocol === 'socks5') proxyUrl = `socks5://${ip}:${port}`;
      else if (protocol === 'socks4') proxyUrl = `socks4://${ip}:${port}`;
      else proxyUrl = `http://${ip}:${port}`;

      const isSocks = proxyUrl.startsWith('socks');
      const agent = isSocks ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);

      try {
        const testRes = await axios.get('https://graph.facebook.com/v20.0/me', {
          httpsAgent: agent,
          timeout: 6000,
          validateStatus: () => true,
          proxy: false
        });
        
        const data = testRes.data;
        const isFacebook = data && (typeof data === 'object') && (data.id !== undefined || data.error !== undefined);
        if (isFacebook) return proxyUrl;
      } catch (_) {}
      return null;
    };

    const BATCH = 10;
    let found: string | null = null;

    const timeoutPromise = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

    for (let i = 0; i < proxies.length; i += BATCH) {
      const batch = proxies.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((p: any) => Promise.race([
          testProxy(p.ip, String(p.port), (p.protocols || [])[0] || 'http').catch(() => null),
          timeoutPromise(8000)
        ]))
      );
      const working = results.find(r => r !== null);
      if (working) {
        found = working;
        break;
      }
      log(`Auto-Proxy: Tested batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(proxies.length / BATCH)}...`);
    }

    if (found) {
      log(`✅ Auto-Proxy: Found working proxy: ${found}`);
      await saveSettings({ proxyUrl: found });
      return found;
    }
  } catch (err: any) {
    log(`❌ Auto-Proxy Error: ${err.message}`);
  }
  return null;
};
