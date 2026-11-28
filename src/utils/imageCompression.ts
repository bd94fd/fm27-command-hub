/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shrink a screenshot before it is sent, so a phone does not upload a 4 MB PNG.
 * Falls back to the original bytes when the browser cannot decode or draw it.
 */
export function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ base64: string; mimeType: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const rawBase64 = dataUrl.split(',')[1] || '';
            resolve({
              base64: rawBase64,
              mimeType: file.type || 'image/png',
              name: file.name,
            });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const compressedBase64 = compressedDataUrl.split(',')[1] || '';
          resolve({
            base64: compressedBase64,
            mimeType: 'image/jpeg',
            name: file.name,
          });
        } catch {
          const rawBase64 = dataUrl.split(',')[1] || '';
          resolve({
            base64: rawBase64,
            mimeType: file.type || 'image/png',
            name: file.name,
          });
        }
      };
      img.onerror = () => {
        const rawBase64 = dataUrl.split(',')[1] || '';
        resolve({
          base64: rawBase64,
          mimeType: file.type || 'image/png',
          name: file.name,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
