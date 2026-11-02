import "server-only";
import cloudinary from "@/lib/cloudinary";
import { HttpError } from "@/lib/server/http";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const VEHICLE_FOLDER = () => process.env.CLOUDINARY_FOLDER || "motive/vehicles";
export const uploadFolders = {
  vehicles: VEHICLE_FOLDER,
  tradeIns: () => `${VEHICLE_FOLDER().replace(/\/vehicles\/?$/, "")}/trade-ins`,
};

/** Validates the `file` field of a multipart request and stores it in Cloudinary under `folder`. */
export async function uploadImageFromRequest(request: Request, folder: string) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new HttpError(503, "Image uploads are not configured. Add Cloudinary credentials or paste an image URL.");
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload.");
  if (!TYPES.includes(file.type)) throw new HttpError(415, "Use a JPEG, PNG, WebP or AVIF image.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Images must be 8 MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", transformation: [{ width: 2000, height: 2000, crop: "limit" }, { quality: "auto", fetch_format: "auto" }] },
      (error, uploaded) => (error || !uploaded ? reject(error ?? new Error("Upload failed")) : resolve(uploaded)),
    ).end(buffer);
  }).catch((error) => {
    console.error("[upload]", error);
    throw new HttpError(502, "The image could not be uploaded. Please try again.");
  });
  return { url: result.secure_url, publicId: result.public_id };
}
