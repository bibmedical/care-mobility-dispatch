const RASTER_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const loadImageElement = file => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Unable to read the selected image.'));
  };
  image.src = objectUrl;
});

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => {
    if (!blob) {
      reject(new Error('Unable to compress the selected image.'));
      return;
    }
    resolve(blob);
  }, type, quality);
});

const buildOutputName = (fileName, extension) => {
  const safeName = String(fileName || 'image').replace(/\.[^.]+$/, '').trim() || 'image';
  return `${safeName}${extension}`;
};

export const compressImageFile = async (file, options = {}) => {
  if (!(file instanceof File)) {
    throw new Error('A valid image file is required.');
  }

  const mimeType = String(file.type || '').toLowerCase();
  if (!RASTER_IMAGE_TYPES.has(mimeType)) {
    return file;
  }

  const {
    maxWidth = 1400,
    maxHeight = 1400,
    quality = 0.72,
    outputType = 'image/webp'
  } = options;

  const image = await loadImageElement(file);
  const widthRatio = maxWidth > 0 ? maxWidth / image.width : 1;
  const heightRatio = maxHeight > 0 ? maxHeight / image.height : 1;
  const ratio = Math.min(widthRatio, heightRatio, 1);
  const targetWidth = Math.max(1, Math.round(image.width * ratio));
  const targetHeight = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    throw new Error('Unable to prepare the selected image.');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const blob = await canvasToBlob(canvas, outputType, quality);
  const compressedFile = new File([blob], buildOutputName(file.name, '.webp'), {
    type: outputType,
    lastModified: Date.now()
  });

  return compressedFile.size < file.size ? compressedFile : file;
};

export const fileToDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').trim());
  reader.onerror = () => reject(new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});