/**
 * Runs before the rest of the app loads. The cloudinary SDK throws at import time
 * when CLOUDINARY_URL is set but not a cloudinary:// URL.
 */
const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();
if (cloudinaryUrl && !cloudinaryUrl.startsWith('cloudinary://')) {
  delete process.env.CLOUDINARY_URL;
}
