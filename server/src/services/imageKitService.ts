// @ts-ignore
import ImageKit from 'imagekit';
import fs from 'fs';

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ""
});

/**
 * Uploads a file to ImageKit
 * @param filePath Path to the local file
 * @param fileName Desired name in ImageKit
 * @returns Upload response
 */
export const uploadToImageKit = async (filePath: string, fileName: string) => {
    try {
        const fileContent = fs.readFileSync(filePath);
        
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
 * @param fileId ImageKit fileId
 */
export const deleteFromImageKit = async (fileId: string) => {
    try {
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
        const files = await imagekit.listFiles({
            path: "/autopost-reels"
        });
        return files;
    } catch (error: any) {
        console.error('ImageKit List Error:', error.message);
        return [];
    }
};

// Compatibility export for old code
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
