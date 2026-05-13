// @ts-ignore
import ImageKit from 'imagekit';
import fs from 'fs';

// Initialize ImageKit - Bypassing type check for constructor properties if needed
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ""
});

/**
 * Uploads a file to ImageKit
 */
export const uploadToImageKit = async (filePath: string, fileName: string) => {
    try {
        const fileContent = fs.readFileSync(filePath);
        
        // v7 uses direct .upload() method
        const response = await imagekit.upload({
            file: fileContent,
            fileName: fileName,
            folder: "/autopost-reels",
            useUniqueFileName: true
        });

        return response;
    } catch (error: any) {
        console.error('ImageKit Upload Error:', error.message);
        throw error;
    }
};

/**
 * Deletes a file from ImageKit
 */
export const deleteFromImageKit = async (fileId: string) => {
    try {
        // v7 uses direct .deleteFile() method
        await imagekit.deleteFile(fileId);
        console.log(`Successfully deleted file ${fileId} from ImageKit`);
    } catch (error: any) {
        console.error('ImageKit Deletion Error:', error.message);
    }
};

/**
 * Fetches all media from the /autopost-reels folder
 */
export const getImageKitPool = async () => {
    try {
        // v7 uses direct .listFiles() method
        const files = await imagekit.listFiles({
            path: "/autopost-reels"
        });
        return files;
    } catch (error: any) {
        console.error('ImageKit List Error:', error.message);
        return [];
    }
};

// Compatibility export
export const uploadImage = async (
    file: any,
    folder: string = "general"
) => {
    try {
        const response = await imagekit.upload({
            file: file,
            fileName: `upload_${Date.now()}`,
            folder: folder
        });
        return response;
    } catch (error: any) {
        console.error('ImageKit compat upload error:', error.message);
        throw error;
    }
};
