import fs from 'fs';
import path from 'path';

const getCacheDir = () => {
  const hfPersistentPath = '/data/temp/uploads';
  const localPath = path.join(process.cwd(), 'temp', 'uploads');
  
  try {
    // If running on HF and /data exists, use it for persistence
    if (fs.existsSync('/data')) {
      if (!fs.existsSync(hfPersistentPath)) {
        fs.mkdirSync(hfPersistentPath, { recursive: true });
      }
      return hfPersistentPath;
    }
  } catch (err) {
    console.error('⚠️ Failed to create persistent cache directory, falling back to local:', err);
  }
  
  try {
    // Fallback to local
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }
  } catch (err) {
    console.error('❌ Failed to create local cache directory:', err);
  }
  return localPath;
};

const CACHE_DIR = getCacheDir();


interface CachedItem {
  id: string;
  fileName: string;
  mimeType: string;
  createdAt: number;
}

class CacheService {
  private readonly metadataFile = path.join(CACHE_DIR, 'metadata.json');

  constructor() {
    this.initMetadata();
  }

  private initMetadata() {
    if (!fs.existsSync(this.metadataFile)) {
      fs.writeFileSync(this.metadataFile, JSON.stringify({}));
    }
  }

  private getMetadata(): Record<string, CachedItem> {
    try {
      const data = fs.readFileSync(this.metadataFile, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }

  private saveMetadata(metadata: Record<string, CachedItem>) {
    fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
  }

  set(buffer: Buffer, mimeType: string, fileName: string): string {
    const id = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
    const extension = path.extname(fileName) || (mimeType.includes('video') ? '.mp4' : '.jpg');
    const diskName = `${id}${extension}`;
    const filePath = path.join(CACHE_DIR, diskName);

    // Save file to disk
    fs.writeFileSync(filePath, buffer);

    // Save metadata
    const metadata = this.getMetadata();
    metadata[id] = { id, fileName, mimeType, createdAt: Date.now() };
    this.saveMetadata(metadata);

    return id;
  }

  get(id: string): { buffer: Buffer, mimeType: string, fileName: string } | undefined {
    const metadata = this.getMetadata();
    const item = metadata[id];
    if (!item) return undefined;

    const extension = path.extname(item.fileName) || (item.mimeType.includes('video') ? '.mp4' : '.jpg');
    const filePath = path.join(CACHE_DIR, `${id}${extension}`);

    if (fs.existsSync(filePath)) {
      return {
        buffer: fs.readFileSync(filePath),
        mimeType: item.mimeType,
        fileName: item.fileName
      };
    }
    return undefined;
  }

  getAll(): { id: string, fileName: string, createdAt: number, urlSuffix: string }[] {
    const metadata = this.getMetadata();
    return Object.values(metadata).map(item => {
      const extension = path.extname(item.fileName) || (item.mimeType.includes('video') ? '.mp4' : '.jpg');
      return {
        id: item.id,
        fileName: item.fileName,
        createdAt: item.createdAt,
        urlSuffix: `${item.id}${extension}`
      };
    });
  }

  delete(id: string) {
    const metadata = this.getMetadata();
    const item = metadata[id];
    if (item) {
      const extension = path.extname(item.fileName) || (item.mimeType.includes('video') ? '.mp4' : '.jpg');
      const filePath = path.join(CACHE_DIR, `${id}${extension}`);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
      delete metadata[id];
      this.saveMetadata(metadata);
    }
  }

  cleanup() {
    const now = Date.now();
    const TTL = 3600000; // 1 hour
    const metadata = this.getMetadata();
    
    Object.keys(metadata).forEach(id => {
      if (now - metadata[id].createdAt > TTL) {
        this.delete(id);
      }
    });
  }
}

export const mediaCache = new CacheService();
