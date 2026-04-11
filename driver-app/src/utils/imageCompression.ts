import * as ImageManipulator from 'expo-image-manipulator';

type CompressionOptions = {
  maxSide?: number;
  initialQuality?: number;
  minQuality?: number;
  maxApproxBytes?: number;
};

const estimateDataUrlBytes = (base64: string) => Math.floor((base64.length * 3) / 4);

export const compressImageToJpegDataUrl = async (
  uri: string,
  {
    maxSide = 1024,
    initialQuality = 0.46,
    minQuality = 0.28,
    maxApproxBytes = 280_000
  }: CompressionOptions = {}
): Promise<string> => {
  let quality = initialQuality;
  let outputBase64 = '';

  while (quality >= minQuality) {
    const optimized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxSide } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true
      }
    );

    if (!optimized.base64) {
      throw new Error('Unable to compress image.');
    }

    outputBase64 = optimized.base64;
    if (estimateDataUrlBytes(outputBase64) <= maxApproxBytes) {
      break;
    }

    quality = Math.round((quality - 0.06) * 100) / 100;
  }

  return `data:image/jpeg;base64,${outputBase64}`;
};
