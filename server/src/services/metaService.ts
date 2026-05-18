import axios from 'axios';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
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

const handleAxiosError = (error: any, defaultMessage: string) => {
  let errorData = defaultMessage;
  let rateLimitInfo = null;

  if (error.response) {
    rateLimitInfo = error.response.headers['x-business-use-case-usage'] || error.response.headers['x-app-usage'];
    if (error.response.data && error.response.data.error && error.response.data.error.message) {
      errorData = error.response.data.error.message;
    }
  } else if (error.message) {
    errorData = `${defaultMessage}: ${error.message}`;
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
        params: { fields: 'status_code,status', access_token: META_ACCESS_TOKEN }
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
