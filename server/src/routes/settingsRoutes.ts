import { Router } from 'express';
import Settings from '../models/Settings';
import { saveSettings } from '../services/settingsService';
import { diagnoseMetaConnection } from '../services/metaService';

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

export default router;
