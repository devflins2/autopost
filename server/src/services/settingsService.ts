import Settings, { ISettings } from '../models/Settings';

let cachedSettings: ISettings | null = null;

/**
 * Loads the singleton settings document from MongoDB.
 * Creates it if it doesn't already exist.
 */
export const loadSettings = async (): Promise<ISettings> => {
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
    const settings = await loadSettings();
    const dbValue = settings[field];
    if (dbValue && typeof dbValue === 'string' && dbValue.trim() !== '') {
      return dbValue.trim();
    }
  } catch (error) {
    console.error(`Error loading setting "${field}" from database:`, error);
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
  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) {
    settings = new Settings({ key: 'global' });
  }

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

  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      (settings as any)[key] = updates[key];
    }
  }

  await settings.save();
  cachedSettings = settings;
  return settings;
};
