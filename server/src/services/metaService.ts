import axios from 'axios';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_BUSINESS_ID;
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
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

// Check environment variables fail-fast
const checkMetaEnv = (platform: 'instagram' | 'facebook' | 'both') => {
  if (!META_ACCESS_TOKEN) {
    throw new Error('Meta Integration Error: META_ACCESS_TOKEN environment variable is missing.');
  }
  if ((platform === 'instagram' || platform === 'both') && !INSTAGRAM_ACCOUNT_ID) {
    throw new Error('Meta Integration Error: INSTAGRAM_ACCOUNT_ID (or INSTAGRAM_BUSINESS_ID) environment variable is missing.');
  }
  if ((platform === 'facebook' || platform === 'both') && !FACEBOOK_PAGE_ID) {
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

import https from 'https';

const httpsAgent = new https.Agent({
  family: 4, // Force IPv4 to prevent SSL EPROTO handshake failures on Hugging Face
  keepAlive: true,
  minVersion: 'TLSv1.2'
});

const metaClient = axios.create({
  baseURL: `https://graph.facebook.com/${API_VERSION}`,
  timeout: 180000, // 3 minutes timeout
  headers: { 'Content-Type': 'application/json' },
  httpsAgent: httpsAgent
});

/**
 * Post an Image to Instagram
 */
export const postToInstagramImage = async (imageUrl: string, caption: string) => {
  try {
    checkMetaEnv('instagram');
    checkRateLimit();
    const containerRes = await metaClient.post(`/${INSTAGRAM_ACCOUNT_ID}/media`, {
      image_url: imageUrl, caption, access_token: META_ACCESS_TOKEN
    });
    
    const publishRes = await metaClient.post(`/${INSTAGRAM_ACCOUNT_ID}/media_publish`, {
      creation_id: containerRes.data.id, access_token: META_ACCESS_TOKEN
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
    checkMetaEnv('instagram');
    checkRateLimit();
    const containerRes = await metaClient.post(`/${INSTAGRAM_ACCOUNT_ID}/media`, {
      media_type: 'REELS', video_url: videoUrl, caption, access_token: META_ACCESS_TOKEN
    });
    const creationId = containerRes.data.id;

    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 15) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 30000));
      const statusRes = await metaClient.get(`/${creationId}`, {
        params: { fields: 'status_code', access_token: META_ACCESS_TOKEN }
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
    const publishRes = await metaClient.post(`/${INSTAGRAM_ACCOUNT_ID}/media_publish`, {
      creation_id: creationId, access_token: META_ACCESS_TOKEN
    });
    return publishRes.data;
  } catch (error: any) {
    console.error('❌ Instagram Reel Error:', error.message);
    return handleAxiosError(error, 'Instagram Reel Error');
  }
};

/**
 * Post a Photo to Facebook Page
 */
export const postToFacebookPage = async (imageUrl: string, message: string) => {
  try {
    checkMetaEnv('facebook');
    checkRateLimit();
    const res = await metaClient.post(`/${FACEBOOK_PAGE_ID}/photos`, {
      url: imageUrl, caption: message, access_token: META_ACCESS_TOKEN
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
    checkMetaEnv('facebook');
    checkRateLimit();
    const res = await metaClient.post(`/${FACEBOOK_PAGE_ID}/videos`, {
      file_url: videoUrl, description: message, access_token: META_ACCESS_TOKEN
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
    checkMetaEnv('instagram');
    checkRateLimit();
    const basicRes = await metaClient.get(`/${mediaId}`, {
      params: { fields: 'like_count,comments_count,media_url', access_token: META_ACCESS_TOKEN }
    });
    
    const insightRes = await metaClient.get(`/${mediaId}/insights`, {
      params: { metric: 'reach,impressions,saved,video_views', access_token: META_ACCESS_TOKEN }
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
export const diagnoseMetaConnection = async () => {
  console.log('\n🔍 [Meta Audit] Starting Integration Diagnostic Audit...');
  try {
    if (!META_ACCESS_TOKEN) {
      console.error('❌ [Meta Audit] META_ACCESS_TOKEN is missing from environment variables.');
      return;
    }

    // 1. Audit /me (Check token validity)
    try {
      const meRes = await metaClient.get('/me', { params: { access_token: META_ACCESS_TOKEN } });
      console.log(`✅ [Meta Audit] Token Owner Name: ${meRes.data.name}, ID: ${meRes.data.id}`);
    } catch (err: any) {
      console.error('❌ [Meta Audit] Token Owner Audit: Token is invalid, expired, or revoked!', err.message);
      if (err.response?.data?.error) {
        console.error('Meta Error Details:', JSON.stringify(err.response.data.error, null, 2));
      }
      return;
    }

    // 2. Audit /me/permissions (Check granted scopes)
    try {
      const permRes = await metaClient.get('/me/permissions', { params: { access_token: META_ACCESS_TOKEN } });
      const permData = permRes.data.data || [];
      const granted = permData
        .filter((p: any) => p.status === 'granted')
        .map((p: any) => p.permission);
      const declined = permData
        .filter((p: any) => p.status !== 'granted')
        .map((p: any) => p.permission);
      console.log('✅ [Meta Audit] Active Scopes:', granted.join(', '));
      if (declined.length > 0) {
        console.warn('⚠️ [Meta Audit] Declined Scopes:', declined.join(', '));
      }
      
      const requiredScopes = ['instagram_basic', 'instagram_content_publish'];
      const missing = requiredScopes.filter(s => !granted.includes(s));
      if (missing.length > 0) {
        console.error(`❌ [Meta Audit] Missing CRITICAL scopes: [${missing.join(', ')}]. Reels posting WILL fail.`);
      } else {
        console.log('✅ [Meta Audit] All critical Instagram scopes are active.');
      }
    } catch (err: any) {
      console.error('❌ [Meta Audit] Scopes Audit: Failed to retrieve permissions!', err.message);
    }

    // 3. Audit Facebook Page ID
    if (FACEBOOK_PAGE_ID) {
      try {
        const pageRes = await metaClient.get(`/${FACEBOOK_PAGE_ID}`, {
          params: { fields: 'name,instagram_business_account', access_token: META_ACCESS_TOKEN }
        });
        console.log(`✅ [Meta Audit] Facebook Page: "${pageRes.data.name}" (ID: ${FACEBOOK_PAGE_ID})`);
        if (pageRes.data.instagram_business_account) {
          const linkedId = pageRes.data.instagram_business_account.id;
          console.log(`✅ [Meta Audit] Connected Instagram Account: ID: ${linkedId}`);
          if (INSTAGRAM_ACCOUNT_ID && INSTAGRAM_ACCOUNT_ID !== linkedId) {
            console.error(`❌ [Meta Audit] ID MISMATCH! You configured INSTAGRAM_ACCOUNT_ID=${INSTAGRAM_ACCOUNT_ID}, but Facebook Page is connected to Instagram Account ID=${linkedId}. Please use the correct ID!`);
          }
        } else {
          console.error(`❌ [Meta Audit] Linkage Broken: Facebook Page (ID: ${FACEBOOK_PAGE_ID}) is not connected to any Instagram Business Account in Facebook settings.`);
        }
      } catch (err: any) {
        console.error(`❌ [Meta Audit] Facebook Page Audit: Failed to query Page ID ${FACEBOOK_PAGE_ID}!`, err.message);
        if (err.response?.data?.error) {
          console.error('Meta Error Details:', JSON.stringify(err.response.data.error, null, 2));
        }
      }
    } else {
      console.warn('⚠️ [Meta Audit] FACEBOOK_PAGE_ID environment variable is missing.');
    }

    // 4. Audit Instagram Business Account
    if (INSTAGRAM_ACCOUNT_ID) {
      try {
        const igRes = await metaClient.get(`/${INSTAGRAM_ACCOUNT_ID}`, {
          params: { fields: 'username,name', access_token: META_ACCESS_TOKEN }
        });
        console.log(`✅ [Meta Audit] Instagram Professional Profile: Name: "${igRes.data.name}", Username: @${igRes.data.username} (ID: ${INSTAGRAM_ACCOUNT_ID})`);
      } catch (err: any) {
        console.error(`❌ [Meta Audit] Instagram Account Audit: Failed to query Account ID ${INSTAGRAM_ACCOUNT_ID}!`, err.message);
        if (err.response?.data?.error) {
          console.error('Meta Error Details:', JSON.stringify(err.response.data.error, null, 2));
        }
      }
    } else {
      console.error('❌ [Meta Audit] INSTAGRAM_ACCOUNT_ID environment variable is missing.');
    }

  } catch (globalErr: any) {
    console.error('❌ [Meta Audit] Global Audit Failure:', globalErr.message);
  }
  console.log('🔍 [Meta Audit] Integration Diagnostic Audit Completed.\n');
};
