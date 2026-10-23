/**
 * Files attached to an AI chat message (photos/screenshots of invoices, RAB,
 * equipment lists, or PDFs). Images are downscaled in the browser so a request
 * stays well under the server's upload limit.
 */
export interface ChatAttachment {
  name: string;
  mimeType: string;
  /** base64 without the data: prefix */
  data: string;
  /** data URL for the thumbnail (images only) */
  preview?: string;
}

export const MAX_ATTACHMENTS = 3;
const MAX_IMAGE_SIDE = 1800;
const MAX_PDF_BYTES = 3 * 1024 * 1024;
/** Total base64 payload per message, below Vercel's 4.5 MB request limit */
export const MAX_TOTAL_CHARS = 4_000_000;

export const ACCEPTED_TYPES = "image/*,application/pdf";

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File tidak bisa dibaca."));
    reader.readAsDataURL(blob);
  });

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Format gambar tidak didukung. Gunakan JPG atau PNG."));
    img.src = url;
  });

export async function prepareAttachment(file: File): Promise<ChatAttachment> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error(`PDF "${file.name}" terlalu besar (maks. 3 MB).`);
    const url = await readAsDataUrl(file);
    return { name: file.name, mimeType: "application/pdf", data: url.slice(url.indexOf(",") + 1) };
  }
  if (!file.type.startsWith("image/")) throw new Error(`"${file.name}" bukan gambar atau PDF.`);

  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // transparent PNG screenshots become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { name: file.name || "gambar.jpg", mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1), preview: url };
}
