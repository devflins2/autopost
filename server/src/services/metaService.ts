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

const handleFetchError = async (response: Response, defaultMessage: string) => {
  let errorData = defaultMessage;
  let rateLimitInfo = response.headers.get('x-business-use-case-usage') || response.headers.get('x-app-usage');
  try {
    const data = await response.json();
    if (data.error && data.error.message) errorData = data.error.message;
  } catch (e) {}

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

/**
 * Post an Image to Instagram
 */
export const postToInstagramImage = async (imageUrl: string, caption: string) => {
  try {
    checkRateLimit();
    const containerRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${INSTAGRAM_ACCOUNT_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: META_ACCESS_TOKEN }),
      signal: AbortSignal.timeout(60000)
    });
    if (!containerRes.ok) await handleFetchError(containerRes, 'Instagram Photo Container Error');
    const containerData = await containerRes.json();

    const publishRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${INSTAGRAM_ACCOUNT_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerData.id, access_token: META_ACCESS_TOKEN }),
      signal: AbortSignal.timeout(60000)
    });
    if (!publishRes.ok) await handleFetchError(publishRes, 'Instagram Photo Publish Error');
    return await publishRes.json();
  } catch (error: any) {
    console.error('Instagram Photo Error:', error.message);
    throw error;
  }
};

/**
 * Post a Reel to Instagram
 */
export const postToInstagramReel = async (videoUrl: string, caption: string) => {
  try {
    checkRateLimit();
    const containerRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${INSTAGRAM_ACCOUNT_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, access_token: META_ACCESS_TOKEN }),
      signal: AbortSignal.timeout(60000)
    });
    if (!containerRes.ok) await handleFetchError(containerRes, 'Instagram Reel Container Error');
    const containerData = await containerRes.json();
    const creationId = containerData.id;

    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 15) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 30000));
      const statusUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${creationId}`);
      statusUrl.searchParams.append('fields', 'status_code,status');
      statusUrl.searchParams.append('access_token', META_ACCESS_TOKEN || '');
      
      const statusRes = await fetch(statusUrl.toString(), { signal: AbortSignal.timeout(60000) });
      if (!statusRes.ok) await handleFetchError(statusRes, 'Instagram Reel Status Error');
      const statusData = await statusRes.json();
      
      status = statusData.status_code;
      console.log(`📽️ Reel Status [Attempt ${attempts}]:`, status);
      
      if (status === 'FINISHED') break;
      if (status === 'ERROR') throw new Error(`Meta processing failed. Check your video format or account status.`);
    }

    if (status !== 'FINISHED') {
      throw new Error('Meta processing timed out (Video might be too large or URL unreachable)');
    }

    console.log('🚀 Publishing Reel...');
    const publishRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${INSTAGRAM_ACCOUNT_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: META_ACCESS_TOKEN }),
      signal: AbortSignal.timeout(60000)
    });
    if (!publishRes.ok) await handleFetchError(publishRes, 'Instagram Reel Publish Error');
    return await publishRes.json();
  } catch (error: any) {
    console.error('❌ Instagram Reel Error:', error.message);
    throw error;
  }
};

/**
 * Post a Photo to Facebook Page
 */
export const postToFacebookPage = async (imageUrl: string, message: string) => {
  try {
    checkRateLimit();
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${FACEBOOK_PAGE_ID}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl, caption: message, access_token: META_ACCESS_TOKEN }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) await handleFetchError(res, 'Facebook Post Error');
    return await res.json();
  } catch (error: any) {
    console.error('Facebook Post Error:', error.message);
    throw error;
  }
};

/**
 * Post a Video to Facebook Page
 */
export const postVideoToFacebookPage = async (videoUrl: string, message: string) => {
  try {
    checkRateLimit();
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${FACEBOOK_PAGE_ID}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_url: videoUrl, description: message, access_token: META_ACCESS_TOKEN }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) await handleFetchError(res, 'Facebook Video Error');
    return await res.json();
  } catch (error: any) {
    console.error('Facebook Video Error:', error.message);
    throw error;
  }
};

/**
 * Fetch insights for a specific Instagram Media ID
 */
export const getMediaInsights = async (mediaId: string) => {
  try {
    checkRateLimit();
    const basicUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${mediaId}`);
    basicUrl.searchParams.append('fields', 'like_count,comments_count,media_url');
    basicUrl.searchParams.append('access_token', META_ACCESS_TOKEN || '');
    
    const basicRes = await fetch(basicUrl.toString(), { signal: AbortSignal.timeout(60000) });
    if (!basicRes.ok) throw new Error('Insights fetch failed');
    const basicData = await basicRes.json();

    const insightUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${mediaId}/insights`);
    insightUrl.searchParams.append('metric', 'reach,impressions,saved,video_views');
    insightUrl.searchParams.append('access_token', META_ACCESS_TOKEN || '');
    
    const insightRes = await fetch(insightUrl.toString(), { signal: AbortSignal.timeout(60000) });
    if (!insightRes.ok) throw new Error('Insights metrics failed');
    const insightData = await insightRes.json();

    const insights: any = {
      likes: basicData.like_count || 0,
      comments: basicData.comments_count || 0,
      media_url: basicData.media_url
    };

    insightData.data.forEach((item: any) => {
      insights[item.name] = item.values[0].value;
    });

    return insights;
  } catch (error: any) {
    return { reach: 0, impressions: 0, video_views: 0, saved: 0, likes: 0, comments: 0 };
  }
};
