import ImageKit from 'imagekit';
import fs from 'fs';

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ''
});

/**
 * Uploads a local file to ImageKit
 * @param filePath Path to the local file
 * @param fileName Desired filename in ImageKit
 * @returns Object containing the file URL and file ID
 */
export const uploadToImageKit = async (filePath: string, fileName: string) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    const response = await imagekit.upload({
      file: fileBuffer, // can be a Buffer, string (base64) or url
      fileName: fileName,
      folder: '/autopost-reels',
      useUniqueFileName: true
    });

    console.log('✅ Uploaded to ImageKit:', response.url);
    
    return {
      url: response.url,
      fileId: response.fileId
    };
  } catch (error: any) {
    console.error('❌ ImageKit Upload Error:', error.message);
    throw error;
  }
};

/**
 * Deletes a file from ImageKit
 * @param fileId The ID of the file to delete
 */
export const deleteFromImageKit = async (fileId: string) => {
  try {
    await imagekit.deleteFile(fileId);
    console.log('🗑️ Deleted from ImageKit:', fileId);
    return true;
  } catch (error: any) {
    console.error('❌ ImageKit Delete Error:', error.message);
    return false;
  }
};

/**
 * Fetches all media from ImageKit (for replacement compatibility)
 */
export const fetchAllFromImageKit = async () => {
  try {
    const files = await imagekit.listFiles({
      path: '/autopost-reels'
    });
    
    return files.map(file => ({
      id: file.fileId,
      url: file.url,
      previewUrl: file.thumbnailUrl || file.url,
      resource_type: file.fileType === 'non-image' ? 'video' : 'image',
      keyword: file.name.split('_')[0] || 'nature'
    }));
  } catch (error: any) {
    console.error('❌ ImageKit List Error:', error.message);
    return [];
  }
};
