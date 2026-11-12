/** Decode a selected photo before accepting its preview or uploading its bytes.
 * A filename/MIME type alone cannot distinguish an image from a corrupt file.
 */
export async function validatePhoto(file: File, maxMegabytes = 5): Promise<void> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (!file.size || file.size > maxMegabytes * 1024 * 1024)
    throw new Error(`Choose an image under ${maxMegabytes} MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That image could not be read. Try a different one.");
  }
  bitmap.close();
}

/** Keep demo image choices browser-local; real accounts upload through Storage. */
export function readPhotoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That image could not be read. Try a different one."));
    reader.readAsDataURL(file);
  });
}
