import { FakeProvider, ImageProvider, MuskapisProvider } from '@hitframe/image-provider';

let provider: ImageProvider | undefined;

function build(): ImageProvider {
  const name = process.env.IMAGE_PROVIDER ?? 'muskapis';
  if (name === 'fake') {
    // 测试假引擎（2026-07-20 拍板）：破坏性测试专用，生产不配置即不生效
    return new FakeProvider();
  }
  if (name === 'muskapis') {
    return new MuskapisProvider({
      baseUrl: process.env.IMAGE_BASE_URL ?? 'https://api.muskapis.com/v1',
      apiKey: process.env.IMAGE_API_KEY ?? '',
      model: process.env.IMAGE_MODEL ?? 'gpt-image-2',
    });
  }
  throw new Error(`unknown IMAGE_PROVIDER: ${name}`);
}

export function getImageProvider(): ImageProvider {
  provider ??= build();
  return provider;
}
