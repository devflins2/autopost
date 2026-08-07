import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { getProxyAgent } from '../utils/proxyHelper';
import { pipeline } from 'stream/promises';
import FormData from 'form-data';
import { getSetting } from './settingsService';


const getTempDir = () => {
  const localPath = path.join(process.cwd(), 'temp');
  try {
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }
  } catch (err) {
    console.error('❌ Failed to create temp directory:', err);
  }
  return localPath;
};

export const TEMP_DIR = getTempDir();

// ─── CLEANUP: Delete temp files older than 1 hour on startup ─────────────────
export const cleanupOldTempFiles = () => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const retentionTime = 24 * 60 * 60 * 1000; // 24 Hours
    const threshold = Date.now() - retentionTime;
    let count = 0;
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.mtimeMs < threshold) {
        fs.unlinkSync(filePath);
        count++;
      }
    }
    if (count > 0) console.log(`🧹 Cleaned up ${count} stale temp files.`);

    // Also cleanup our new Disk Cache (Manual uploads)
    const { mediaCache } = require('./cacheService');
    mediaCache.cleanup();
  } catch (e) {
    console.error('Temp cleanup error:', e);
  }
};

// ─── STREAM DOWNLOADER ────────────────────────────────────────────────────────
/**
 * Downloads a file via streaming (no full load into RAM).
 * Rejects if Content-Length header exceeds the size limit.
 * Returns true on success, false if too large or redirect failed.
 */
const downloadFileStreamed = async (
  url: string,
  targetPath: string,
  maxSizeMB: number = 50
): Promise<boolean> => {
  try {
    const agent = getProxyAgent(''); // Direct connection for downloading media files

    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      maxRedirects: 5,
      timeout: 30000,
      httpsAgent: agent,
      proxy: false,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    const contentLength = parseInt(String(response.headers['content-length'] || '0'));
    // Only reject if server actually told us the size AND it's too big
    if (contentLength > 0 && contentLength > maxSizeMB * 1024 * 1024) {
      console.log(`⚠️ File too large: ${(contentLength / (1024 * 1024)).toFixed(2)}MB`);
      response.data.destroy();
      return false;
    }

    const writer = fs.createWriteStream(targetPath);
    await pipeline(response.data, writer);
    return true;
  } catch (err: any) {
    console.error(`❌ Download failed [${url.substring(0, 60)}...]:`, err.message);
    return false;
  }
};

// ─── SMART AUDIO MATCHER ──────────────────────────────────────────────────────
//
// Categorizes every URL in SONG_LINKS by its audio type using URL pattern matching.
// Maps content keywords to the best matching audio category (with fallback chain).
//
// SONG_LINKS audio categories (detected from URL):
//   water  → Ufer_Wellen, River_flowing, Waterfall, Seashore, Aix_sponsa (duck)
//   rain   → rain, lluvia, Regen, Bourne_woods_rain, Rain_on_a_tin_roof, Southfork_in_Rain
//   storm  → Thunder, truenos, Thunder_and_rain
//   wind   → Wind_blowing_through_trees
//   forest → Waldatmo, woods, Bourne_woods_Birdsong
//   birds  → V%C3%B6gel/Vogel, XC####, Thrush, Starling, Crow, Falcon, Moorhen, Jay, Plover
//   meadow → Gryllus (cricket), Sonus_naturalis (soundscape)
//   general→ anything unmatched

type AudioCategory = 'water' | 'rain' | 'storm' | 'wind' | 'forest' | 'birds' | 'meadow' | 'general';

const categorizeLinks = (links: string[]): Record<AudioCategory, string[]> => {
  const cats: Record<AudioCategory, string[]> = {
    water: [], rain: [], storm: [], wind: [], forest: [], birds: [], meadow: [], general: []
  };

  for (const link of links) {
    const l = link.toLowerCase();

    if (l.includes('thunder') || l.includes('truenos')) {
      cats.storm.push(link);
    } else if (l.includes('wind_blow')) {
      cats.wind.push(link);
    } else if (
      l.includes('rain') || l.includes('lluvia') || l.includes('southfork')
    ) {
      cats.rain.push(link);
    } else if (
      l.includes('ufer_wellen') || l.includes('river_flow') ||
      l.includes('waterfall') || l.includes('seashore') ||
      l.includes('aix_sponsa')        // wood duck = water bird
    ) {
      cats.water.push(link);
    } else if (
      l.includes('waldatmo') || l.includes('woods') ||
      l.includes('bourne_woods_birdsong')
    ) {
      cats.forest.push(link);
    } else if (l.includes('gryllus') || l.includes('sonus_naturalis')) {
      cats.meadow.push(link);
    } else if (
      l.includes('v%c3%b6gel') || l.includes('vogel') ||
      // Xeno-canto bird recordings have a pattern like _XC######
      /xc\d{5,}/.test(l) ||
      l.includes('thrush') || l.includes('starling') || l.includes('crow') ||
      l.includes('falcon') || l.includes('moorhen') || l.includes('jay') ||
      l.includes('plover') || l.includes('batis') || l.includes('cisticola') ||
      l.includes('manorina') || l.includes('plocepasser') || l.includes('micrastur')
    ) {
      cats.birds.push(link);
    } else {
      cats.general.push(link);
    }
  }

  return cats;
};

// Returns priority-ordered categories for a given content keyword
const getCategoryOrder = (keyword: string): AudioCategory[] => {
  const k = keyword.toLowerCase();

  if (k.includes('ocean') || k.includes('sea') || k.includes('beach') ||
      k.includes('lake') || k.includes('river') || k.includes('waterfall') ||
      k.includes('water') || k.includes('wave') || k.includes('turtle') ||
      k.includes('dolphin') || k.includes('whale') || k.includes('coral')) {
    return ['water', 'rain', 'birds', 'general'];
  }

  if (k.includes('storm') || k.includes('thunder') || k.includes('lightning')) {
    return ['storm', 'rain', 'wind', 'general'];
  }

  if (k.includes('rain') || k.includes('drizzle') || k.includes('monsoon') ||
      k.includes('shower')) {
    return ['rain', 'storm', 'forest', 'general'];
  }

  if (k.includes('wind') || k.includes('breeze') || k.includes('cyclone') ||
      k.includes('gale')) {
    return ['wind', 'storm', 'meadow', 'general'];
  }

  if (k.includes('bird') || k.includes('eagle') || k.includes('parrot') ||
      k.includes('peacock') || k.includes('owl') || k.includes('sparrow') ||
      k.includes('robin') || k.includes('crow') || k.includes('hawk')) {
    return ['birds', 'forest', 'meadow', 'general'];
  }

  if (k.includes('forest') || k.includes('jungle') || k.includes('tree') ||
      k.includes('wood') || k.includes('bamboo') || k.includes('green') ||
      k.includes('rainforest') || k.includes('canopy')) {
    return ['forest', 'birds', 'rain', 'general'];
  }

  if (k.includes('mountain') || k.includes('peak') || k.includes('hill') ||
      k.includes('snow') || k.includes('glacier') || k.includes('alpine')) {
    return ['wind', 'birds', 'forest', 'general'];
  }

  if (k.includes('meadow') || k.includes('field') || k.includes('grass') ||
      k.includes('prairie') || k.includes('savanna')) {
    return ['meadow', 'birds', 'wind', 'general'];
  }

  if (k.includes('flower') || k.includes('bloom') || k.includes('garden') ||
      k.includes('spring') || k.includes('blossom')) {
    return ['birds', 'meadow', 'forest', 'general'];
  }

  if (k.includes('desert') || k.includes('dune') || k.includes('arid') ||
      k.includes('canyon')) {
    return ['wind', 'meadow', 'general'];
  }

  if (k.includes('sunset') || k.includes('sunrise') || k.includes('sky') ||
      k.includes('cloud') || k.includes('fog') || k.includes('mist')) {
    return ['birds', 'wind', 'meadow', 'general'];
  }

  // Default: birds + forest — safe for any nature content
  return ['birds', 'forest', 'meadow', 'general'];
};

export const getRandomSong = async (keyword?: string): Promise<string | null> => {
  const songLinks = await getSetting('songLinks');
  if (!songLinks) return null;

  const links = songLinks.split(',').map(s => s.trim()).filter(Boolean);
  if (links.length === 0) return null;

  const cats = categorizeLinks(links);

  if (keyword) {
    const order = getCategoryOrder(keyword);
    console.log(`🎵 Audio matching for "${keyword}": priority order → [${order.join(' > ')}]`);

    for (const cat of order) {
      // Create a mixed pool: Category-specific songs + GitHub songs (since they are all nature-themed)
      const githubSongs = links.filter(l => l.includes('github.com/devflins2/songs-'));
      const categorySongs = cats[cat];
      
      const pool = [...categorySongs, ...githubSongs];
      
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        console.log(`🎵 Selected [${cat}] audio pool (Size: ${pool.length}).`);
        return pick;
      }
    }
  }

  // Absolute fallback — pick any random link
  return links[Math.floor(Math.random() * links.length)];
};

// ─── DURATION PROBE ──────────────────────────────────────────────────────────
/**
 * Returns duration of a local media file in seconds using ffprobe.
 * Returns 0 if probe fails.
 */
const getMediaDuration = (filePath: string): Promise<number> =>
  new Promise(resolve =>
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) { console.warn('⚠️ ffprobe failed:', err.message); resolve(0); }
      else resolve(meta.format.duration || 0);
    })
  );

// Instagram Reel max cap (seconds)
const IG_MAX_DURATION = 90;

/**
 * Converts a static image into a 9:16 MP4 Reel.
 * Duration = min(audio length, IG_MAX_DURATION) — -shortest handles trim automatically.
 * Always includes an audio track (song or silent fallback).
 */
export const generateReelFromImage = async (
  imageUrl: string,
  audioUrl?: string,
  defaultDuration: number = 15
): Promise<string> => {
  const ts = Date.now();
  const outputPath    = path.join(TEMP_DIR, `reel_img_${ts}.mp4`);
  const tempImagePath = path.join(TEMP_DIR, `tmp_img_${ts}.jpg`);
  const tempAudioPath = path.join(TEMP_DIR, `tmp_audio_${ts}.mp3`);

  const cleanup = () => {
    [tempImagePath, tempAudioPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
  };

  try {
    const imgOk = await downloadFileStreamed(imageUrl, tempImagePath, 10);
    if (!imgOk) throw new Error('Image download failed or too large');

    let audioReady = false;
    if (audioUrl) {
      audioReady = await downloadFileStreamed(audioUrl, tempAudioPath, 30);
      if (!audioReady) console.warn('⚠️ Audio download failed — using silent fallback.');
    }

    // Image loops for IG_MAX_DURATION.
    // -shortest will cut output when audio ends (if audio < IG_MAX_DURATION).
    // If no audio is provided, defaultDuration is used instead.
    const loopDuration = audioReady ? IG_MAX_DURATION : defaultDuration;

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg()
        .input(tempImagePath)
        .inputOptions(['-loop', '1', '-t', `${loopDuration}`]);

      if (audioReady) {
        cmd = cmd.input(tempAudioPath);
      } else {
        cmd = cmd
          .input(`anullsrc=channel_layout=stereo:sample_rate=44100`)
          .inputOptions(['-f', 'lavfi', '-t', `${loopDuration}`]);
      }

      cmd
        .videoFilters([
          // Scale to fit 1080x1920 while maintaining original aspect ratio, then pad with black bars
          { filter: 'scale', options: '1080:1920:force_original_aspect_ratio=decrease' },
          { filter: 'pad',  options: '1080:1920:(ow-iw)/2:(oh-ih)/2:color=black' },
          { filter: 'setsar', options: '1' },
          { filter: 'unsharp', options: '3:3:0.8:3:3:0.0' } // Subtle sharpening for nature
        ])
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions([
          '-map 0:v:0',
          '-map 1:a:0',
          '-shortest',          // cuts at whichever ends first (image or audio)
          '-preset ultrafast',
          '-profile:v main',
          '-level 4.0',
          '-pix_fmt yuv420p',
          '-colorspace bt709',
          '-color_primaries bt709',
          '-color_trc bt709',
          '-crf 22',            // Ideal quality for Instagram (avoids re-encoding)
          '-maxrate 5M',        // Strict max bitrate for IG
          '-bufsize 10M',
          '-movflags +faststart',
          '-threads 1',
          '-r 30'
        ])
        .on('start', () => console.log('🎬 [ImageReel] FFmpeg started.'))
        .on('end', () => { cleanup(); resolve(outputPath); })
        .on('error', (err) => { cleanup(); reject(err); })
        .save(outputPath);
    });

  } catch (err) {
    cleanup();
    throw err;
  }
};


// ─── VIDEO PROCESSOR ──────────────────────────────────────────────────────────
/**
 * Downloads, crops to 9:16, colour-grades, and optionally replaces audio.
 * Duration = min(video, audio) — -shortest trims whichever is longer.
 * If no custom audio, original video audio is preserved at full length.
 */
export const processVideo = async (
  videoUrl: string,
  audioUrl?: string
): Promise<string> => {
  const ts = Date.now();
  const outputPath    = path.join(TEMP_DIR, `reel_vid_${ts}.mp4`);
  const tempVideoPath = path.join(TEMP_DIR, `tmp_vid_${ts}.mp4`);
  const tempAudioPath = path.join(TEMP_DIR, `tmp_audio_${ts}.mp3`);

  const cleanup = () => {
    [tempVideoPath, tempAudioPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
  };

  try {
    console.log(`📡 Downloading video: ${videoUrl.substring(0, 60)}...`);
    const vidOk = await downloadFileStreamed(videoUrl, tempVideoPath, 350);
    if (!vidOk) throw new Error('Video download failed or too large');

    let audioReady = false;
    if (audioUrl) {
      console.log('🎵 Downloading custom audio...');
      audioReady = await downloadFileStreamed(audioUrl, tempAudioPath, 30);
      if (!audioReady) console.warn('⚠️ Custom audio download failed — keeping original video audio.');
    }

    console.log('⚙️ Starting FFmpeg encoding (Instagram Reel spec)...');

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(tempVideoPath);

      if (audioReady) {
        cmd = cmd.input(tempAudioPath);
      }

      const brightness = (Math.random() * 0.04 - 0.02).toFixed(2);
      const contrast   = (1 + Math.random() * 0.04 - 0.02).toFixed(2);
      const saturation = (1 + Math.random() * 0.1  - 0.05).toFixed(2);

      cmd
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions([
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p',

          ...(audioReady
            ? ['-map 0:v:0', '-map 1:a:0', '-shortest']
            : ['-map 0:v:0', '-map 0:a:0?']
          ),
          '-preset ultrafast',
          '-profile:v main',
          '-level 4.0',
          '-pix_fmt yuv420p',
          '-colorspace bt709',
          '-color_primaries bt709',
          '-color_trc bt709',
          '-crf 22',            // Ideal quality for Instagram (avoids aggressive re-encoding)
          '-maxrate 5M',        // Strict max bitrate for IG
          '-bufsize 10M',
          '-movflags +faststart',
          '-threads 1',
          '-r 30'
        ])
        .on('start', () => console.log('🎬 [VideoReel] FFmpeg started.'))
        .on('progress', (p) => {
          const percent = Math.floor(p.percent || 0);
          if (percent % 20 === 0 && percent > 0) {
            console.log(`⏳ Encoding: ${percent}%`);
          }
        })
        .on('end', () => { cleanup(); resolve(outputPath); })
        .on('error', (err) => { cleanup(); reject(err); })
        .save(outputPath);
    });

  } catch (err) {
    cleanup();
    throw err;
  }
};

// ─── PUBLIC HOST UPLOAD ───────────────────────────────────────────────────────
const uploadToCatbox = async (filePath: string): Promise<string> => {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath));

  const response = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 90000
  });
  return response.data.trim();
};

/**
 * Uploads the processed video to a public host (Catbox, falling back to local static server in production).
 */
export const uploadToPublicHost = async (filePath: string): Promise<{ url: string, fileName: string } | null> => {
  try {
    console.log('🚀 Uploading to Catbox for high-speed Meta CDN delivery...');
    const catboxUrl = await uploadToCatbox(filePath);
    console.log(`✅ Media successfully uploaded to Catbox: ${catboxUrl}`);
    return { url: catboxUrl, fileName: path.basename(filePath) };

  } catch (err: any) {
    console.warn('⚠️ Catbox upload failed, falling back to local static hosting:', err.message);
    try {
      const fileName = path.basename(filePath);
      const host = (process.env.PUBLIC_URL || 'http://localhost:5000').trim();
      const url = `${host}/temp/${fileName}`;
      
      console.log(`✅ Media is now live at fallback local URL: ${url}`);
      return { url, fileName: fileName }; 
    } catch (fallbackErr: any) {
      console.error('❌ Local fallback hosting failed:', fallbackErr.message);
      return null;
    }
  }
};

/**
 * Deletes a file from local temporary cache
 */
export const deleteFromPublicHost = async (fileId: string) => {
  try {
    const filePath = path.join(TEMP_DIR, fileId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Local file ${fileId} deleted successfully after posting.`);
    } else {
      console.log(`ℹ️ Local file ${fileId} already cleaned up or does not exist.`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to delete local file ${fileId}:`, err.message);
  }
};

