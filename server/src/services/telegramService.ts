import axios from 'axios';

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
export const sendTelegramNotification = async (message: string, attempts: number = 3): Promise<void> => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram config missing (Bot Token or Chat ID). Skipping notification.');
    return;
  }

  for (let i = 0; i < attempts; i++) {
    try {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      }, { 
        timeout: 60000 // Increase timeout to 60s
      });
      return; // Success, exit
    } catch (error: any) {
      const isLastAttempt = i === attempts - 1;
      const errorMessage = error.response?.data?.description || error.message;

      if (errorMessage.includes('400') && message.includes('<')) {
        // If HTML parsing error, try sending as plain text immediately
        try {
          const plainText = message.replace(/<[^>]*>/g, '');
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: `[Fallback] ${plainText}`
          }, { 
            timeout: 60000
          });
          return;
        } catch (innerError: any) {
          console.error('❌ Telegram Fallback Error:', innerError.message);
        }
      }

      if (isLastAttempt) {
        console.error('❌ Telegram Notification Error (Final Attempt):', errorMessage);
      } else {
        console.warn(`⚠️ Telegram Attempt ${i + 1} failed: ${errorMessage}. Retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
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
