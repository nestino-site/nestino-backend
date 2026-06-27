type CloudinaryV2 = typeof import('cloudinary').v2;

let cloudinaryV2: CloudinaryV2 | null = null;

export function isCloudinaryConfigured(): boolean {
  return !!process.env.CLOUDINARY_URL?.startsWith('cloudinary://');
}

export function getCloudinaryV2(): CloudinaryV2 {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }

  if (!cloudinaryV2) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { v2 } = require('cloudinary') as typeof import('cloudinary');
    v2.config();
    cloudinaryV2 = v2;
  }

  return cloudinaryV2;
}
