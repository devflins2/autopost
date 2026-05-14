import { Request, Response } from 'express';
import { fetchImages } from '../services/mediaService';
import { getImageKitPool as listImageKitFiles } from '../services/imageKitService';
import { mediaCache } from '../services/cacheService';
import fs from 'fs';
import path from 'path';


export const getImages = async (req: Request, res: Response) => {
  const { query, perPage } = req.query;
  try {
    const images = await fetchImages(
      query ? query.toString() : 'nature',
      perPage ? parseInt(perPage.toString()) : 10
    );
    res.json({ success: true, data: images });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getImageKitPool = async (req: Request, res: Response) => {
  try {
    const pool = await listImageKitFiles();

    res.json({ success: true, data: pool });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getLocalPool = async (req: Request, res: Response) => {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const files = fs.readdirSync(tempDir).filter(f => !f.startsWith('.'));
    const host = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    
    const diskPool = files.map(file => ({
      id: file,
      url: `${host}/temp/${file}`,
      previewUrl: `${host}/temp/${file}`,
      source: 'local',
      resource_type: file.toLowerCase().endsWith('.mp4') ? 'video' : 'image'
    }));

    // Include RAM cache items
    const ramPool = mediaCache.getAll().map(item => ({
       id: item.id,
       url: `${host}/api/media/stream/${item.id}`,
       previewUrl: `${host}/api/media/stream/${item.id}`,
       source: 'ram',
       resource_type: item.fileName.toLowerCase().endsWith('.mp4') ? 'video' : 'image'
    }));

    res.json({ success: true, data: [...ramPool, ...diskPool] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const uploadMedia = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    
    const id = mediaCache.set(req.file.buffer, req.file.mimetype, req.file.originalname);
    const host = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${host}/api/media/stream/${id}`;

    res.json({ 
      success: true, 
      message: 'Media cached in RAM successfully',
      data: { id, url, name: req.file.originalname } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const streamMedia = async (req: Request, res: Response) => {
  try {
    const item = mediaCache.get(req.params.id);
    if (!item) return res.status(404).send('Media not found in RAM cache');

    res.set('Content-Type', item.mimeType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(item.buffer);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
};
