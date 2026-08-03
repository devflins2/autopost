import { Request, Response } from 'express';
import Post from '../models/Post';
import { getMediaInsights } from '../services/metaService';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const totalPosts = await Post.countDocuments({ status: 'posted' });
    const recentPosts = await Post.find({ status: 'posted' })
      .sort({ postedAt: -1 })
      .limit(10);

    // Fetch live insights for the most recent 5 posts (with a strict 1-hour cooldown)
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    
    // Trigger background updates for stale insights without blocking the HTTP response
    recentPosts.slice(0, 5).forEach((post) => {
      const mediaId = post.igMediaId;
      const lastFetch = post.lastInsightsFetch || new Date(0);
      const needsUpdate = lastFetch < oneHourAgo;

      if (mediaId && needsUpdate) {
        // Fire-and-forget background task
        (async () => {
          try {
            console.log(`📊 [Background] Refreshing insights for post: ${mediaId}`);
            // Set timestamp immediately to prevent concurrent triggers
            post.lastInsightsFetch = new Date();
            await post.save();

            const liveInsights = await getMediaInsights(mediaId);
            post.insights = liveInsights;
            await post.save();
            console.log(`✅ [Background] Insights refreshed for post: ${mediaId}`);
          } catch (err: any) {
            console.error(`❌ Failed to fetch insights for ${mediaId}:`, err.message);
          }
        })();
      }
    });

    const postsWithInsights = recentPosts;

    // Calculate totals from DB
    const allPosts = await Post.find({ status: 'posted' });
    let totalReach = 0;
    let totalViews = 0;
    let totalLikes = 0;

    allPosts.forEach(p => {
      totalReach += p.insights?.reach || 0;
      totalViews += p.insights?.video_views || 0;
      totalLikes += (p.insights as any)?.likes || 0;
    });

    const { getNextRunTime } = await import('../services/schedulerService');

    res.json({ 
      totalPosts, 
      totalReach, 
      totalViews, 
      totalLikes, 
      nextRunTime: getNextRunTime(),
      serverTime: Date.now(),
      recentPosts: postsWithInsights 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Returns last 7 days of post count + reach for the Analytics chart
export const getDashboardHistory = async (req: Request, res: Response) => {
  try {
    const days: { date: string; posts: number; reach: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const postsInDay = await Post.find({
        status: 'posted',
        postedAt: { $gte: start, $lte: end }
      });

      const reach = postsInDay.reduce((sum, p) => sum + (p.insights?.reach || 0), 0);

      days.push({
        date: start.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
        posts: postsInDay.length,
        reach
      });
    }

    res.json({ success: true, data: days });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
