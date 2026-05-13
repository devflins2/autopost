// This service is disabled. Using ImageKit instead.
export const uploadToCloudinary = async (filePath: string) => {
  throw new Error("Cloudinary is deprecated. Use ImageKit.");
};

export const deleteFromCloudinary = async (publicId: string) => {
  console.log("Cloudinary delete called (Disabled)");
};

export const getCloudinaryPool = async () => {
  return [];
};
