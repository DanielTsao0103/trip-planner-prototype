/** Safari can decode HEIC photos from its native camera/library. Normalize those
 * to JPEG before preview, OCR and storage; other browsers retain a clear fallback. */
export async function prepareReceiptInput(file: File): Promise<File> {
  const heic = /^image\/hei[cf](?:-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!heic) return file;
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Choose a receipt photo under 10 MB.");
  let source: ImageBitmap | HTMLImageElement | undefined;
  let objectUrl: string | undefined;
  try {
    try { source = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch {
      objectUrl = URL.createObjectURL(file);
      const image = new Image(); image.src = objectUrl;
      await image.decode(); source = image;
    }
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!width || !height) throw new Error("Unreadable photo");
    const scale = Math.min(1, 4096 / Math.max(width, height), Math.sqrt(8000000 / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const photo = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unreadable photo")), "image/jpeg", .94));
    return new File([photo], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    throw new Error("This browser could not read the HEIC photo. Take a new photo or upload a JPEG, PNG or WebP image.");
  } finally {
    if (source && !(source instanceof HTMLImageElement)) source.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
