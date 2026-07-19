import { ImageProvider, MuskapisProvider } from '@hitframe/image-provider';

let provider: ImageProvider | undefined;

export function getImageProvider(): ImageProvider {
  if (!provider) {
    const name = process.env.IMAGE_PROVIDER ?? 'muskapis';
    if (name !== 'muskapis') throw new Error(`unknown IMAGE_PROVIDER: ${name}`);
    provider = new MuskapisProvider({
      baseUrl: process.env.IMAGE_BASE_URL ?? 'https://api.muskapis.com/v1',
      apiKey: process.env.IMAGE_API_KEY ?? '',
      model: process.env.IMAGE_MODEL ?? 'gpt-image-2',
    });
  }
  return provider;
}
