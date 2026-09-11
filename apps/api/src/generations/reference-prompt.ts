export interface ImageReferenceEntry {
  assetId: string;
  imageNumber: number;
}

export interface CompiledImageReferencePrompt {
  prompt: string;
  referenceMap: ImageReferenceEntry[];
  referencedImageNumbers: number[];
}

const IMAGE_REFERENCE_PATTERN = /@(?:图片|圖片)\s*(\d*)/g;

export function compileImageReferencePrompt(
  rawPrompt: string,
  slotAssetIds: string[],
): CompiledImageReferencePrompt {
  const referencedImageNumbers: number[] = [];
  const userPrompt = rawPrompt.trim();
  const compiledPrompt = userPrompt.replace(
    IMAGE_REFERENCE_PATTERN,
    (reference: string, rawImageNumber: string) => {
      const imageNumber = Number(rawImageNumber);
      if (!rawImageNumber || !Number.isInteger(imageNumber) || imageNumber < 1) {
        throw new Error(`图片引用不完整：${reference.trim()}`);
      }
      if (imageNumber > slotAssetIds.length) {
        throw new Error(`@图片 ${imageNumber} 不存在，请重新选择参考图`);
      }
      if (!referencedImageNumbers.includes(imageNumber)) {
        referencedImageNumbers.push(imageNumber);
      }
      return `Image ${imageNumber}`;
    },
  );

  const referenceMap = slotAssetIds.map((assetId, index) => ({
    assetId,
    imageNumber: index + 1,
  }));

  if (referencedImageNumbers.length === 0) {
    return { prompt: compiledPrompt, referenceMap, referencedImageNumbers };
  }

  const mapping = referenceMap
    .map(({ imageNumber }) => `Image ${imageNumber} 指第 ${imageNumber} 张输入图片`)
    .join('；');
  return {
    prompt: `输入图片按提交顺序编号：${mapping}。请严格按编号使用对应图片。\n\n${compiledPrompt}`,
    referenceMap,
    referencedImageNumbers,
  };
}
