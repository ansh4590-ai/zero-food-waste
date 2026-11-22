/**
 * src/lib/imageCompression.ts
 * Browser-side image downscaling and compression before upload/classification.
 * Scales photos to max 1600px dimension and 0.8 JPEG quality to fit under
 * Vercel's 4.5MB request-body cap and the 3MB /api/classify payload limit.
 */

export interface CompressionResult {
  file: File;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
}

/**
 * Resizes an image so its longest edge is at most `maxDimension` px (default 1600px),
 * and compresses it to JPEG with the given `quality` (default 0.8).
 *
 * Typically reduces a 3MB-10MB mobile photo down to 150KB-400KB while preserving
 * full visual clarity for Gemini vision and UI display.
 */
export async function compressImage(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.8
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return reject(new Error("Selected file is not an image."));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image."));
      img.onload = () => {
        let { width, height } = img;

        // Downscale while preserving aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Canvas context is not available."));
        }

        // Draw onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to data URI
        const dataUrl = canvas.toDataURL("image/jpeg", quality);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error("Failed to generate compressed image blob."));
            }

            const fileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressedFile = new File([blob], fileName, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });

            resolve({
              file: compressedFile,
              dataUrl,
              originalSize: file.size,
              compressedSize: blob.size,
            });
          },
          "image/jpeg",
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
