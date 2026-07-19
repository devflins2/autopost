import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getSetting } from './settingsService';

const API_VERSION = 'v20.0';

// Global variable to track rate limit suspension globally across the app
export let rateLimitResetTime: Date | null = null;

// Helper to check if we are currently rate-limited
export const checkRateLimit = () => {
  if (rateLimitResetTime && new Date() < rateLimitResetTime) {
    const waitMins = Math.ceil((rateLimitResetTime.getTime() - Date.now()) / 60000);
    throw new Error(`(#80002) Rate limit active. Waiting ${waitMins} more minutes before trying again.`);
  }
};

/**
 * Resolves Meta Credentials dynamically at runtime
 */
export const getMetaCredentials = async () => {
  const token = await getSetting('metaAccessToken') || process.env.META_ACCESS_TOKEN || '';
  const igId = await getSetting('instagramAccountId') || process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_BUSINESS_ID || '';
  const fbId = await getSetting('facebookPageId') || process.env.FACEBOOK_PAGE_ID || '';
  return { token, igId, fbId };
};

// Check environment variables fail-fast
const checkMetaEnv = (platform: 'instagram' | 'facebook' | 'both', token: string, igId: string, fbId: string) => {
  if (!token) {
    throw new Error('Meta Integration Error: META_ACCESS_TOKEN environment variable is missing.');
  }
  if ((platform === 'instagram' || platform === 'both') && !igId) {
    throw new Error('Meta Integration Error: INSTAGRAM_ACCOUNT_ID (or INSTAGRAM_BUSINESS_ID) environment variable is missing.');
  }
  if ((platform === 'facebook' || platform === 'both') && !fbId) {
    throw new Error('Meta Integration Error: FACEBOOK_PAGE_ID environment variable is missing.');
  }
};

const handleAxiosError = (error: any, defaultMessage: string) => {
  let errorData = defaultMessage;
  let rateLimitInfo = null;

  if (error.response) {
    rateLimitInfo = error.response.headers['x-business-use-case-usage'] || error.response.headers['x-app-usage'];
    if (error.response.data && error.response.data.error) {
      const metaError = error.response.data.error;
      errorData = metaError.message || defaultMessage;
      // Add detailed Graph API metrics to the error message so they are captured by logs/scheduler
      errorData += ` (Meta Code: ${metaError.code || 'N/A'}, Subcode: ${metaError.error_subcode || 'N/A'}, Type: ${metaError.type || 'N/A'}, Trace ID: ${metaError.fbtrace_id || 'N/A'})`;
      console.error('❌ Detailed Meta API Error Response:', JSON.stringify(metaError, null, 2));
    } else if (error.response.data && error.response.data.message) {
      errorData = error.response.data.message;
    }
  } else if (error.message) {
    errorData = `${defaultMessage}: ${error.message}`;
  }

  // Safely print request details for debugging, redacting sensitive tokens
  if (error.config) {
    let requestData = error.config.data;
    try {
      if (requestData) {
        const parsed = typeof requestData === 'string' ? JSON.parse(requestData) : requestData;
        if (parsed.access_token) parsed.access_token = '***REDACTED***';
        requestData = JSON.stringify(parsed);
      }
    } catch (_) {}
    console.error(`📡 Failed Request: URL: ${error.config.url}, Method: ${error.config.method?.toUpperCase()}, Data: ${requestData}`);
  }

  if (rateLimitInfo) {
    console.warn('📊 Meta Rate Limit Info:', rateLimitInfo);
    try {
      const usage = JSON.parse(rateLimitInfo);
      const accountId = Object.keys(usage)[0];
      const estimatedWait = usage[accountId]?.[0]?.estimated_time_to_regain_access;
      if (estimatedWait > 0) {
        errorData += ` (Estimated wait: ${estimatedWait} minutes)`;
        rateLimitResetTime = new Date(Date.now() + estimatedWait * 60000);
        console.warn(`🛑 Rate limit reset time set to: ${rateLimitResetTime.toLocaleString()}`);
      }
    } catch (e) {}
  }
  if (errorData.includes('80002') && !rateLimitResetTime) {
    rateLimitResetTime = new Date(Date.now() + 60 * 60000);
    console.warn(`🛑 Rate limit hit! Defaulting reset time to: ${rateLimitResetTime.toLocaleString()}`);
  }
  throw new Error(errorData);
};

const defaultHttpsAgent = new https.Agent({
  family: 4, // Force IPv4 to prevent SSL EPROTO handshake failures on Hugging Face
  keepAlive: false, // Disable keepAlive to prevent socket reuse/stale connection EPROTO errors
  minVersion: 'TLSv1.2',
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
});

const getMetaClient = async () => {
  const metaBaseUrl = await getSetting('metaBaseUrl') || process.env.META_BASE_URL || 'https://graph.facebook.com';
  const proxyUrl = await getSetting('proxyUrl') || process.env.PROXY_URL || '';

  let agent: any = defaultHttpsAgent;
  if (proxyUrl) {
    agent = new HttpsProxyAgent(proxyUrl);
  }

  return axios.create({
    baseURL: `${metaBaseUrl}/${API_VERSION}`,
    timeout: 180000, // 3 minutes timeout
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    httpsAgent: agent,
    proxy: false // Disable axios built-in proxy settings to prevent conflict with HttpsProxyAgent
  });
};

/**
 * Post an Image to Instagram
 */
export const postToInstagramImage = async (imageUrl: string, caption: string) => {
  try {
    const { token, igId, fbId } = await getMetaCredentials();
    checkMetaEnv('instagram', token, igId, fbId);
    checkRateLimit();
    const client = await getMetaClient();
    const containerRes = await client.post(`/${igId}/media`, {
      image_url: imageUrl, caption, access_token: token
    });
    
    const publishRes = await client.post(`/${igId}/media_publish`, {
      creation_id: containerRes.data.id, access_token: token
    });
    return publishRes.data;
  } catch (error: any) {
    console.error('Instagram Photo Error:', error.message);
    return handleAxiosError(error, 'Instagram Photo Error');
  }
};

/**
 * Post a Reel to Instagram
 */
export const postToInstagramReel = async (videoUrl: string, caption: string) => {
  try {
    const { token, igId, fbId } = await getMetaCredentials();
    checkMetaEnv('instagram', token, igId, fbId);
    checkRateLimit();
    const client = await getMetaClient();
    const containerRes = await client.post(`/${igId}/media`, {
      media_type: 'REELS', video_url: videoUrl, caption, access_token: token
    });
    const creationId = containerRes.data.id;

    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 15) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 30000));
      const statusRes = await client.get(`/${creationId}`, {
        params: { fields: 'status_code', access_token: token }
      });
      status = statusRes.data.status_code;
      console.log(`📽️ Reel Status [Attempt ${attempts}]:`, status);
      
      if (status === 'FINISHED') break;
      if (status === 'ERROR') throw new Error(`Meta processing failed. Check your video format or account status.`);
    }

    if (status !== 'FINISHED') {
      throw new Error('Meta processing timed out (Video might be too large or URL unreachable)');
    }

    console.log('🚀 Publishing Reel...');
    const publishRes = await client.post(`/${igId}/media_publish`, {
      creation_id: creationId, access_token: token
    });
    return publishRes.data;
  } catch (error: any) {
    console.error('❌ Instagram Reel Error:', error.message);
    return handleAxiosError(error, 'Instagram Reel Error');
  }
};

/**
 * Resolves the Page Access Token dynamically using the User Access Token
 */
export const getPageAccessToken = async (userToken: string, fbId: string): Promise<string> => {
  try {
    const client = await getMetaClient();
    const res = await client.get(`/${fbId}`, {
      params: { fields: 'access_token', access_token: userToken }
    });
    if (res.data && res.data.access_token) {
      return res.data.access_token;
    }
    throw new Error('Page access token not returned by Meta API.');
  } catch (error: any) {
    console.error(`❌ Failed to retrieve Page Access Token dynamically for Page ${fbId}:`, error.message);
    // If we fail, return the original user token as a fallback
    return userToken;
  }
};

/**
 * Post a Photo to Facebook Page
 */
export const postToFacebookPage = async (imageUrl: string, message: string) => {
  try {
    const { token, igId, fbId } = await getMetaCredentials();
    checkMetaEnv('facebook', token, igId, fbId);
    checkRateLimit();
    const pageToken = await getPageAccessToken(token, fbId);
    const client = await getMetaClient();
    const res = await client.post(`/${fbId}/photos`, {
      url: imageUrl, caption: message, access_token: pageToken
    });
    return res.data;
  } catch (error: any) {
    console.error('Facebook Post Error:', error.message);
    return handleAxiosError(error, 'Facebook Post Error');
  }
};

/**
 * Post a Video to Facebook Page
 */
export const postVideoToFacebookPage = async (videoUrl: string, message: string) => {
  try {
    const { token, igId, fbId } = await getMetaCredentials();
    checkMetaEnv('facebook', token, igId, fbId);
    checkRateLimit();
    const pageToken = await getPageAccessToken(token, fbId);
    const client = await getMetaClient();
    const res = await client.post(`/${fbId}/videos`, {
      file_url: videoUrl, description: message, access_token: pageToken
    });
    return res.data;
  } catch (error: any) {
    console.error('Facebook Video Error:', error.message);
    return handleAxiosError(error, 'Facebook Video Error');
  }
};

/**
 * Fetch insights for a specific Instagram Media ID
 */
export const getMediaInsights = async (mediaId: string) => {
  try {
    const { token, igId, fbId } = await getMetaCredentials();
    checkMetaEnv('instagram', token, igId, fbId);
    checkRateLimit();
    const client = await getMetaClient();
    const basicRes = await client.get(`/${mediaId}`, {
      params: { fields: 'like_count,comments_count,media_url', access_token: token }
    });
    
    const insightRes = await client.get(`/${mediaId}/insights`, {
      params: { metric: 'reach,impressions,saved,video_views', access_token: token }
    });

    const insights: any = {
      likes: basicRes.data.like_count || 0,
      comments: basicRes.data.comments_count || 0,
      media_url: basicRes.data.media_url
    };

    insightRes.data.data.forEach((item: any) => {
      insights[item.name] = item.values[0].value;
    });

    return insights;
  } catch (error: any) {
    return { reach: 0, impressions: 0, video_views: 0, saved: 0, likes: 0, comments: 0 };
  }
};

/**
 * Diagnostic Audit for Meta Integration Configuration
 */
export const diagnoseMetaConnection = async (logger?: (msg: string) => void) => {
  const log = (msg: string, isError: boolean = false) => {
    if (logger) logger(msg);
    if (isError) {
      console.error(msg);
    } else {
      console.log(msg);
    }
  };

  log('\n🔍 [Meta Audit] Starting Integration Diagnostic Audit...');
  try {
    const { token, igId, fbId } = await getMetaCredentials();

    if (!token) {
      log('❌ [Meta Audit] META_ACCESS_TOKEN is missing from settings and environment variables.');
      return;
    }

    const client = await getMetaClient();
    // 1. Audit /me (Check token validity)
    try {
      const meRes = await client.get('/me', { params: { access_token: token } });
      log(`✅ [Meta Audit] Token Owner Name: ${meRes.data.name}, ID: ${meRes.data.id}`);
    } catch (err: any) {
      log(`❌ [Meta Audit] Token Owner Audit: Token is invalid, expired, or revoked! ${err.message}`, true);
      if (err.response?.data?.error) {
        log(`Meta Error Details: ${JSON.stringify(err.response.data.error, null, 2)}`, true);
      }
      return;
    }

    // 2. Audit /me/permissions (Check granted scopes)
    try {
      const permRes = await client.get('/me/permissions', { params: { access_token: token } });
      const permData = permRes.data.data || [];
      const granted = permData
        .filter((p: any) => p.status === 'granted')
        .map((p: any) => p.permission);
      const declined = permData
        .filter((p: any) => p.status !== 'granted')
        .map((p: any) => p.permission);
      log(`✅ [Meta Audit] Active Scopes: ${granted.join(', ')}`);
      if (declined.length > 0) {
        log(`⚠️ [Meta Audit] Declined Scopes: ${declined.join(', ')}`);
      }
      
      const requiredScopes = ['instagram_basic', 'instagram_content_publish'];
      const missing = requiredScopes.filter(s => !granted.includes(s));
      if (missing.length > 0) {
        log(`❌ [Meta Audit] Missing CRITICAL scopes: [${missing.join(', ')}]. Reels posting WILL fail.`, true);
      } else {
        log('✅ [Meta Audit] All critical Instagram scopes are active.');
      }
    } catch (err: any) {
      log(`❌ [Meta Audit] Scopes Audit: Failed to retrieve permissions! ${err.message}`, true);
    }

    // 3. Audit Facebook Page ID
    if (fbId) {
      try {
        const pageRes = await client.get(`/${fbId}`, {
          params: { fields: 'name,instagram_business_account', access_token: token }
        });
        log(`✅ [Meta Audit] Facebook Page: "${pageRes.data.name}" (ID: ${fbId})`);
        if (pageRes.data.instagram_business_account) {
          const linkedId = pageRes.data.instagram_business_account.id;
          log(`✅ [Meta Audit] Connected Instagram Account: ID: ${linkedId}`);
          if (igId && igId !== linkedId) {
            log(`❌ [Meta Audit] ID MISMATCH! You configured INSTAGRAM_ACCOUNT_ID=${igId}, but Facebook Page is connected to Instagram Account ID=${linkedId}. Please use the correct ID!`, true);
          }
        } else {
          log(`❌ [Meta Audit] Linkage Broken: Facebook Page (ID: ${fbId}) is not connected to any Instagram Business Account in Facebook settings.`, true);
        }
      } catch (err: any) {
        log(`❌ [Meta Audit] Facebook Page Audit: Failed to query Page ID ${fbId}! ${err.message}`, true);
        if (err.response?.data?.error) {
          log(`Meta Error Details: ${JSON.stringify(err.response.data.error, null, 2)}`, true);
        }
      }
    } else {
      log('⚠️ [Meta Audit] FACEBOOK_PAGE_ID environment variable is missing.');
    }

    // 4. Audit Instagram Business Account
    if (igId) {
      try {
        const igRes = await client.get(`/${igId}`, {
          params: { fields: 'username,name', access_token: token }
        });
        log(`✅ [Meta Audit] Instagram Professional Profile: Name: "${igRes.data.name}", Username: @${igRes.data.username} (ID: ${igId})`);
      } catch (err: any) {
        log(`❌ [Meta Audit] Instagram Account Audit: Failed to query Account ID ${igId}! ${err.message}`, true);
        if (err.response?.data?.error) {
          log(`Meta Error Details: ${JSON.stringify(err.response.data.error, null, 2)}`, true);
        }
      }
    } else {
      log('❌ [Meta Audit] INSTAGRAM_ACCOUNT_ID environment variable is missing.', true);
    }

  } catch (globalErr: any) {
    log(`❌ [Meta Audit] Global Audit Failure: ${globalErr.message}`, true);
  }
  log('🔍 [Meta Audit] Integration Diagnostic Audit Completed.\n');
};
