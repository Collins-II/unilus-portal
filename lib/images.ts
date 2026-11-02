/** Image hosts served through the Next.js optimizer. Any other https image is rendered unoptimized. */
export const OPTIMIZED_IMAGE_HOSTS = ["res.cloudinary.com", "images.unsplash.com", "images.pexels.com"];

export function isOptimizedImage(src: string) {
  if (src.startsWith("/")) return true;
  try {
    return OPTIMIZED_IMAGE_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}