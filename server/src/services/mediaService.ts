import axios from 'axios';
import { getSetting } from './settingsService';
import { getProxyAgent } from '../utils/proxyHelper';

export interface MediaItem {
  id: string;
  url: string;
  previewUrl: string;
  source: 'pexels' | 'pixabay';
  type: 'image' | 'video';
}

export const fetchImages = async (query: string = 'nature', perPage: number = 10): Promise<MediaItem[]> => {
  const results: MediaItem[] = [];
  const safePerPage = Math.max(3, perPage); // Pixabay requires min 3
  const randomPage = Math.floor(Math.random() * 3) + 1; // Random page 1-3

  const pexelsApiKey = await getSetting('pexelsApiKey');
  const pixabayApiKey = await getSetting('pixabayApiKey');
  const agent = getProxyAgent(''); // Direct connection for sourcing images

  try {
    // Fetch from Pexels
    if (pexelsApiKey) {
      const pexelsRes = await axios.get(`https://api.pexels.com/v1/search?query=${query}&per_page=${perPage}&page=${randomPage}`, {
        headers: { 
          Authorization: pexelsApiKey,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        httpsAgent: agent,
        proxy: false
      });
      const pexelsItems: MediaItem[] = pexelsRes.data.photos.map((photo: any) => ({
        id: photo.id.toString(),
        url: photo.src.large2x,
        previewUrl: photo.src.medium,
        source: 'pexels',
        type: 'image'
      }));
      results.push(...pexelsItems);
    }

    // Fetch from Pixabay
    if (pixabayApiKey) {
      const pixabayRes = await axios.get(`https://pixabay.com/api/?key=${pixabayApiKey}&q=${encodeURIComponent(query)}&per_page=${safePerPage}&image_type=photo&page=${randomPage}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        httpsAgent: agent,
        proxy: false
      });
      const pixabayItems: MediaItem[] = pixabayRes.data.hits.map((hit: any) => ({
        id: hit.id.toString(),
        url: hit.largeImageURL,
        previewUrl: hit.previewURL,
        source: 'pixabay',
        type: 'image'
      }));
      results.push(...pixabayItems);
    }
  } catch (error) {
    console.error('Error fetching images:', error);
  }

  return results;
};

export const fetchVideos = async (query: string = 'nature', perPage: number = 10): Promise<MediaItem[]> => {
  const results: MediaItem[] = [];
  const safePerPage = Math.max(3, perPage); // Pixabay requires min 3
  const randomPage = Math.floor(Math.random() * 3) + 1; // Random page 1-3

  const pexelsApiKey = await getSetting('pexelsApiKey');
  const pixabayApiKey = await getSetting('pixabayApiKey');
  const agent = getProxyAgent(''); // Direct connection for sourcing videos

  try {
    // Fetch from Pexels
    if (pexelsApiKey) {
      const pexelsRes = await axios.get(`https://api.pexels.com/videos/search?query=${query}&per_page=${perPage}&page=${randomPage}`, {
        headers: { 
          Authorization: pexelsApiKey,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        httpsAgent: agent,
        proxy: false
      });
      const pexelsItems: MediaItem[] = pexelsRes.data.videos.map((video: any) => ({
        id: video.id.toString(),
        url: video.video_files.find((f: any) => f.quality === 'hd')?.link || video.video_files[0].link,
        previewUrl: video.image,
        source: 'pexels',
        type: 'video'
      }));
      results.push(...pexelsItems);
    }

    // Fetch from Pixabay
    if (pixabayApiKey) {
      const pixabayRes = await axios.get(`https://pixabay.com/api/videos/?key=${pixabayApiKey}&q=${encodeURIComponent(query)}&per_page=${safePerPage}&page=${randomPage}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        httpsAgent: agent,
        proxy: false
      });
      const pixabayItems: MediaItem[] = pixabayRes.data.hits.map((hit: any) => ({
        id: hit.id.toString(),
        url: hit.videos.medium?.url || hit.videos.small?.url,
        previewUrl: `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`,
        source: 'pixabay',
        type: 'video'
      }));
      results.push(...pixabayItems);
    }
  } catch (error) {
    console.error('Error fetching videos:', error);
  }

  return results;
};
