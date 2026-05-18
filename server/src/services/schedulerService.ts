import cron from 'node-cron';
import Post from '../models/Post';
import { postToInstagramImage, postToInstagramReel, postToFacebookPage, postVideoToFacebookPage } from './metaService';
import { fetchImages, fetchVideos } from './mediaService';
import { generateReelFromImage, getRandomSong, processVideo, uploadToPublicHost } from './videoService';
import { generateSmartCaption } from './aiService';
import { getSeasonalKeywords } from '../utils/seasonalKeywords';
import Log from '../models/Log';
import path from 'path';



let isAutoPilotRunning = false;
let nextRunTime: Date | null = null;

export const getNextRunTime = () => {
  if (nextRunTime && nextRunTime.getTime() > Date.now()) return nextRunTime;
  // If null or past, predict next run time 8 hours from now
  const next = new Date();
  next.setHours(next.getHours() + 8, 0, 0, 0);
  return next;
};

// ─── AUTO-RETRY HELPER ───────────────────────────────────────────────────────
// Retries an async function up to `maxAttempts` times with exponential backoff.
const withRetry = async <T>(fn: () => Promise<T>, maxAttempts: number = 3, label: string = 'operation'): Promise<T> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      // If it's a rate limit error, don't waste more calls on retries immediately
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('too many calls') || errorMsg.includes('80002') || errorMsg.includes('rate limit')) {
        console.warn(`🛑 [${label}] Rate limit detected. Skipping further retries for this cycle.`);
        throw error;
      }

      if (attempt === maxAttempts) {
        console.error(`❌ [${label}] All ${maxAttempts} attempts failed.`);
        throw error;
      }
      const delayMs = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s
      console.warn(`⚠️ [${label}] Attempt ${attempt} failed. Retrying in ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`[${label}] Retry logic exhausted unexpectedly.`);
};

// ─── MAIN AUTO-PILOT ─────────────────────────────────────────────────────────
export const runAutoPilot = async (isManual: boolean = false) => {
  if (isAutoPilotRunning) {
    console.log('⏳ Auto-Pilot is already running. Skipping this cycle...');
    return;
  }

  if (!isManual) {
    // Check when the last auto-scraped post was successfully published
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const lastAutoPost = await Post.findOne({
      title: { $regex: /^Auto-Scraped/i },
      status: 'posted',
      postedAt: { $gte: eightHoursAgo }
    }).sort({ postedAt: -1 });

    if (lastAutoPost && lastAutoPost.postedAt) {
      const nextExpected = new Date(lastAutoPost.postedAt.getTime() + 8 * 60 * 60 * 1000);
      nextRunTime = nextExpected;
      console.log(`⏳ Auto-Pilot Check: Last autonomous post was published at ${lastAutoPost.postedAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}.`);
      console.log(`⏳ Strict 8-hour gap: Next allowed autonomous post is after ${nextExpected.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}. Skipping this cycle.`);
      return;
    }
  }

  const { deleteFromPublicHost } = await import('./videoService');

  isAutoPilotRunning = true;
  let postedKeyword = '';

  try {
    const now = new Date();
    const hour = now.getHours();
    console.log(`🤖 Auto-Pilot [Hour ${hour}]: Starting Scrape & Post cycle...`);

    const seasonalKeywords = getSeasonalKeywords();
    const randomKeyword = seasonalKeywords[Math.floor(Math.random() * seasonalKeywords.length)];
    const randomSong = await getRandomSong(randomKeyword);

    postedKeyword = randomKeyword;
    const autoCaption = await generateSmartCaption(randomKeyword);

    console.log(`🔍 Sourcing fresh media for keyword: "${randomKeyword}"...`);
    
    // Try to get a video first
    let sourcedVideos = await fetchVideos(randomKeyword, 30);
    if (sourcedVideos.length === 0) sourcedVideos = await fetchVideos('nature', 30);

    let mediaToProcess: { url: string, type: 'video' | 'image' } | null = null;
    
    if (sourcedVideos.length > 0) {
      const randomVid = sourcedVideos[Math.floor(Math.random() * sourcedVideos.length)];
      mediaToProcess = { url: randomVid.url, type: 'video' };
    } else {
      // Fallback to image
      const sourcedImages = await fetchImages(randomKeyword, 30);
      if (sourcedImages.length > 0) {
        const randomImg = sourcedImages[Math.floor(Math.random() * sourcedImages.length)];
        mediaToProcess = { url: randomImg.url, type: 'image' };
      }
    }

    if (!mediaToProcess) throw new Error('Could not find any media to post');

    console.log(`⚙️ Processing ${mediaToProcess.type}...`);
    let processedVideoPath = '';
    if (mediaToProcess.type === 'video') {
      processedVideoPath = await processVideo(mediaToProcess.url, randomSong || undefined);
    } else {
      processedVideoPath = await generateReelFromImage(mediaToProcess.url, randomSong || undefined, 7);
    }

    // Store on HF as a TEMPORARY buffer
    const uploadRes = await uploadToPublicHost(processedVideoPath);
    if (!uploadRes) throw new Error('Local temporary storage failed');

    
    const videoUrl = uploadRes.url;
    const tempFileName = uploadRes.fileName;

    console.log(`🚀 Posting to Instagram & Facebook...`);
    const igRes = await withRetry(() => postToInstagramReel(videoUrl, autoCaption), 3, 'Instagram Reel');
    const fbRes = await withRetry(() => postVideoToFacebookPage(videoUrl, autoCaption), 3, 'Facebook Video');

    // Create record in DB
    await Post.create({ 
      title: `Auto-Scraped: ${randomKeyword}`, 
      description: autoCaption, 
      mediaUrl: videoUrl, 
      mediaType: 'video', 
      platform: 'both', 
      status: 'posted', 
      postedAt: new Date(), 
      igMediaId: igRes.id, 
      fbPostId: fbRes.id 
    });

    nextRunTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await Log.create({ message: `🤖 Scraped, Processed & Posted: ${randomKeyword}`, level: 'info' });

    console.log(`
${'═'.repeat(50)}
✅  POST PUBLISHED & CLEANED UP!
📌  Keyword  : ${randomKeyword}
📸  Instagram: ${igRes?.id || 'N/A'}
📘  Facebook : ${fbRes?.id || 'N/A'}
🗑️  Storage  : Local HF Cache
${'═'.repeat(50)}
`);

    // ─── CLEANUP: Delete from ImageKit immediately after posting ─────────────
    await deleteFromPublicHost(tempFileName);


    try { 
      const { notifyPostSuccess } = await import('./telegramService'); 
      await notifyPostSuccess({ 
        keyword: randomKeyword, 
        igId: igRes.id, 
        fbId: fbRes.id, 
        mediaUrl: videoUrl 
      }); 
    } catch (tgErr: any) { console.error('Telegram success notification failed:', tgErr.message); }

  } catch (error: any) {
    console.error('🤖 Auto-Pilot Error:', error);
    await Log.create({ message: `🤖 Auto-Pilot Failed: ${error.message}`, level: 'error' });

    try { 
      const { notifyPostFailure } = await import('./telegramService'); 
      await notifyPostFailure(error.message); 
    } catch (tgErr: any) { 
      console.error('Telegram failure notification failed:', tgErr.message); 
    }
  } finally {
    isAutoPilotRunning = false;
  }
};

// ─── SCHEDULER INIT ──────────────────────────────────────────────────────────
export const initScheduler = () => {
  console.log('⏰ Scheduler Initialized: Configured for strict 8-hour posting cycle (3 posts/day)...');

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`📡 Flora is in WATCH MODE.`);
  console.log(`🚀 Performing initial autonomous check right now...`);
  console.log(`${'═'.repeat(40)}\n`);

  // Run immediately on startup (will verify if 8 hours have passed)
  runAutoPilot(false).catch(err => console.error('Initial Auto-Pilot check failed:', err));

  // Every Minute: Fire manual scheduled posts
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const pendingPosts = await Post.find({ status: 'scheduled', scheduledAt: { $lte: now } });
    for (const post of pendingPosts) {
      try {
        if (post.mediaType === 'video') {
          await withRetry(() => postToInstagramReel(post.mediaUrl, post.description), 3, 'Scheduled IG Reel');
        } else {
          await withRetry(() => postToInstagramImage(post.mediaUrl, post.description), 3, 'Scheduled IG Image');
          await withRetry(() => postToFacebookPage(post.mediaUrl, post.description), 3, 'Scheduled FB Post');
        }
        post.status = 'posted'; post.postedAt = new Date(); await post.save();
        await Log.create({ message: `Auto-posted scheduled post ${post._id}`, level: 'info' });
      } catch (error: any) {
        post.status = 'failed'; post.error = error.message; await post.save();
        await Log.create({ message: `Auto-post failed: ${error.message}`, level: 'error' });
      }
    }
  });

  // Check every hour if 8 hours have passed since the last autonomous post
  cron.schedule('0 * * * *', async () => {
    console.log(`⏰ Hourly Cron Triggered: Checking if 8 hours have passed for next Auto-Pilot post...`);
    runAutoPilot(false).catch(err => console.error('Cron Auto-Pilot check failed:', err));
  });
};
