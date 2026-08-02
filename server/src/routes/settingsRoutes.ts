import { Router } from 'express';
import axios from 'axios';
import Settings from '../models/Settings';
import { saveSettings } from '../services/settingsService';
import { diagnoseMetaConnection } from '../services/metaService';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const router = Router();

// Helper to mask sensitive keys
const maskSecret = (key: string | undefined): string => {
  if (!key) return '';
  if (key.length <= 10) return '**********';
  return `${key.substring(0, 6)}...${key.substring(key.length - 6)}`;
};

// GET /api/settings - Fetch current settings with masked secrets
router.get('/', async (req, res) => {
  try {
    let settings = await Settings.findOne({ key: 'global' });
    if (!settings) {
      settings = await Settings.create({ key: 'global' });
    }

    // Prepare response with masked secrets
    const responseData = {
      metaAccessToken: maskSecret(settings.metaAccessToken),
      instagramAccountId: settings.instagramAccountId || '',
      facebookPageId: settings.facebookPageId || '',
      telegramBotToken: maskSecret(settings.telegramBotToken),
      telegramChatId: settings.telegramChatId || '',
      hfToken: maskSecret(settings.hfToken),
      pexelsApiKey: maskSecret(settings.pexelsApiKey),
      pixabayApiKey: maskSecret(settings.pixabayApiKey),
      songLinks: settings.songLinks || '',
      proxyUrl: maskSecret(settings.proxyUrl),
      metaBaseUrl: settings.metaBaseUrl || 'https://graph.facebook.com',
      telegramBaseUrl: settings.telegramBaseUrl || 'https://api.telegram.org'
    };

    res.json({ success: true, data: responseData });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/settings - Save/Update settings
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const updates: any = {};
    
    const fieldsToProcess = [
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

    for (const key of fieldsToProcess) {
      if (body[key] !== undefined) {
        const val = body[key];
        // If the submitted value is empty or looks like a masked value, do not overwrite the secret
        if (typeof val === 'string' && (val.includes('...') || val.trim() === '**********')) {
          continue; 
        }
        updates[key] = val;
      }
    }

    const updated = await saveSettings(updates);
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/settings/test-meta - Run Meta diagnostic audit
router.post('/test-meta', async (req, res) => {
  try {
    const logs: string[] = [];
    const auditLogger = (msg: string) => {
      logs.push(msg);
    };

    // Run diagnostic connection
    await diagnoseMetaConnection(auditLogger);
    
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/settings/auto-proxy - Auto-find and save a working proxy
router.post('/auto-proxy', async (req, res) => {
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(msg); };

  try {
    log('📡 Fetching fresh proxy list from Geonode...');

    const geonodeRes = await axios.get('https://proxylist.geonode.com/api/proxy-list', {
      params: { limit: 100, page: 1, sort_by: 'responseTime', sort_type: 'asc', anonymityLevel: 'elite', speed: 'fast' },
      timeout: 12000
    });

    const proxies: any[] = geonodeRes.data?.data || [];
    log(`✅ Got ${proxies.length} elite proxies. Testing against Meta API...`);

    const testProxy = async (ip: string, port: string, protocol: string): Promise<string | null> => {
      let proxyUrl: string;
      if (protocol === 'socks5') proxyUrl = `socks5://${ip}:${port}`;
      else if (protocol === 'socks4') proxyUrl = `socks4://${ip}:${port}`;
      else proxyUrl = `http://${ip}:${port}`;

      const isSocks = proxyUrl.startsWith('socks');
      const agent = isSocks ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);

      try {
        const testRes = await axios.get('https://graph.facebook.com/v20.0/me', {
          httpsAgent: agent, timeout: 7000, validateStatus: () => true,
          proxy: false
        });
        if (testRes.status >= 100) return proxyUrl;
      } catch (_) {}
      return null;
    };

    // Test in parallel batches of 10
    const BATCH = 10;
    let found: string | null = null;

    for (let i = 0; i < proxies.length; i += BATCH) {
      const batch = proxies.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((p: any) => testProxy(p.ip, String(p.port), (p.protocols || [])[0] || 'http'))
      );
      const working = results.find(r => r !== null);
      if (working) { found = working; break; }
      log(`Tested batch ${Math.floor(i/BATCH) + 1}/${Math.ceil(proxies.length/BATCH)}...`);
    }

    if (!found) {
      log('❌ No working proxy found in this batch. Try again later.');
      return res.json({ success: false, logs, message: 'No working proxy found. Try again in a few minutes.' });
    }

    log(`✅ Working proxy found: ${found}`);
    log('💾 Saving to Settings...');
    await saveSettings({ proxyUrl: found });
    log('✅ Proxy saved successfully! Flora will now use this proxy for all outbound requests.');

    res.json({ success: true, logs, proxyUrl: found, message: `Working proxy found and saved: ${found}` });
  } catch (error: any) {
    log(`❌ Auto-proxy failed: ${error.message}`);
    res.status(500).json({ success: false, logs, error: error.message });
  }
});

export default router;
