import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getSetting } from './settingsService';

const escapeHTML = (str: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, (m) => map[m] || m);
};

/**
 * Sends a notification to the configured Telegram bot.
 */
export const sendTelegramNotification = async (message: string, attempts: number = 2): Promise<void> => {
  const telegramBotToken = await getSetting('telegramBotToken') || process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = await getSetting('telegramChatId') || process.env.TELEGRAM_CHAT_ID;
  const telegramBaseUrl = await getSetting('telegramBaseUrl') || process.env.TELEGRAM_BASE_URL || 'https://api.telegram.org';
  const proxyUrl = await getSetting('proxyUrl') || process.env.PROXY_URL || '';

  if (!telegramBotToken || !telegramChatId) {
    console.warn('⚠️ Telegram config missing (Bot Token or Chat ID). Skipping notification.');
    return;
  }

  const url = `${telegramBaseUrl}/bot${telegramBotToken}/sendMessage`;

  let agent: any = undefined;
  if (proxyUrl) {
    agent = new HttpsProxyAgent(proxyUrl);
  }

  for (let i = 0; i < attempts; i++) {
    try {
      await axios.post(url, {
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'HTML'
      }, { 
        timeout: 8000,
        httpsAgent: agent,
        proxy: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      return; // Success, exit
    } catch (error: any) {
      const isLastAttempt = i === attempts - 1;
      const errorMessage = error.response?.data?.description || error.message || 'Unknown error';

      if (errorMessage.includes('400') && message.includes('<')) {
        // If HTML parsing error, try sending as plain text immediately
        try {
          const plainText = message.replace(/<[^>]*>/g, '');
          await axios.post(url, {
            chat_id: telegramChatId,
            text: `[Fallback] ${plainText}`
          }, { 
            timeout: 8000,
            httpsAgent: agent,
            proxy: false,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          return;
        } catch (innerError: any) {
          const innerMsg = innerError.response?.data?.description || innerError.message;
          console.error('❌ Telegram Fallback Error:', innerMsg);
        }
      }

      if (isLastAttempt) {
        console.error('❌ Telegram Notification Error (Final Attempt):', errorMessage);
      } else {
        console.warn(`⚠️ Telegram Attempt ${i + 1} failed: ${errorMessage}. Retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
};

/**
 * Sends a success notification after a post is published.
 */
export const notifyPostSuccess = async (details: {
  keyword: string,
  igId?: string,
  fbId?: string,
  mediaUrl?: string,
  platform?: string
}) => {
  const { keyword, igId, fbId, mediaUrl, platform = 'Instagram + Facebook' } = details;
  
  const message = `
✅ <b>Flora: Reel Published!</b>

🌿 <b>Topic:</b> ${escapeHTML(keyword)}
📸 <b>Insta ID:</b> <code>${escapeHTML(igId || 'N/A')}</code>
📘 <b>FB ID:</b> <code>${escapeHTML(fbId || 'N/A')}</code>
🔗 <b>Media:</b> <a href="${mediaUrl}">View File</a>
🕐 <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

#Flora #AutoPost #Nature
  `.trim();

  await sendTelegramNotification(message);
};

/**
 * Sends a failure notification if a post fails.
 */
export const notifyPostFailure = async (errorMessage: string) => {
  const message = `
❌ <b>Flora Auto-Pilot</b> — Post Failed!

⚠️ <b>Error:</b> ${escapeHTML(errorMessage.substring(0, 200))}
🕐 <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Please check the Engine Logs dashboard.
  `.trim();

  await sendTelegramNotification(message);
};
