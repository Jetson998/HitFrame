import {
  EditInput,
  GenerateInput,
  ImageProvider,
  ImageResult,
  ProviderError,
  ProviderErrorKind,
} from './provider';

/**
 * 测试假引擎（IMAGE_PROVIDER=fake）：秒级返回本地占位图，不发任何外部请求。
 * 用途边界（2026-07-20 拍板）：并发压测、失败注入、幂等/补投等破坏性测试一律走
 * fake；真实引擎只用于单张回归和演示图生成。生产环境不配置 fake 即不生效。
 *
 * 失败注入：prompt 含
 *   [fail]             → retryable 错误
 *   [fail:non_retryable] → non_retryable 错误
 *   [fail:moderation]  → moderation_rejected 错误
 *   [slow:5000]        → 延迟 5000ms 后成功（默认延迟 300ms）
 */
export class FakeProvider implements ImageProvider {
  readonly name = 'fake';
  readonly model = 'fake-image-1';

  async generate(input: GenerateInput): Promise<ImageResult> {
    return this.respond(input.prompt);
  }

  async edit(input: EditInput): Promise<ImageResult> {
    return this.respond(input.prompt);
  }

  private async respond(prompt: string): Promise<ImageResult> {
    const slow = /\[slow:(\d+)\]/.exec(prompt);
    await new Promise((s) => setTimeout(s, slow ? Number(slow[1]) : 300));

    if (prompt.includes('[fail:non_retryable]')) {
      throw new ProviderError('fake: injected non-retryable failure', 'non_retryable');
    }
    if (prompt.includes('[fail:moderation]')) {
      throw new ProviderError('fake: injected moderation rejection', 'moderation_rejected');
    }
    if (prompt.includes('[fail]')) {
      throw new ProviderError('fake: injected retryable failure', 'retryable');
    }
    return { images: [{ b64: FAKE_PNG_B64 }], model: this.model, usage: { fake: true } };
  }
}

/** 8x8 灰色占位 PNG（合法魔数，可过执行器校验） */
const FAKE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAWAAP+VZLnFwAAAABJRU5ErkJggg==';

export const FAKE_PROVIDER_ERROR_KINDS: ProviderErrorKind[] = [
  'retryable',
  'non_retryable',
  'moderation_rejected',
];
