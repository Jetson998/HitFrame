import type { Quality } from '@hitframe/shared';
import {
  EditInput,
  GenerateInput,
  ImageProvider,
  ImageResult,
  ProviderError,
  ProviderErrorKind,
} from './provider';

export interface MuskapisConfig {
  baseUrl: string; // e.g. https://api.muskapis.com/v1
  apiKey: string;
  model: string; // e.g. gpt-image-2
  timeoutMs?: number;
}

/** 画质唯一口径：standard→medium / high→high（技术方案 A0 映射表） */
const QUALITY_TO_ENGINE: Record<Quality, string> = {
  standard: 'medium',
  high: 'high',
};

const DEFAULT_TIMEOUT_MS = 180_000;

export class MuskapisProvider implements ImageProvider {
  readonly name = 'muskapis';
  readonly model: string;

  constructor(private readonly cfg: MuskapisConfig) {
    this.model = cfg.model;
  }

  async generate(input: GenerateInput): Promise<ImageResult> {
    const res = await this.request('/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        size: input.size,
        quality: QUALITY_TO_ENGINE[input.quality],
        n: 1, // 引擎 n 实际返回 1 张；多候选=多 Job（技术方案 R8）
      }),
    });
    return this.parseResult(res);
  }

  async edit(input: EditInput): Promise<ImageResult> {
    const form = new FormData();
    form.append('model', this.model);
    form.append('prompt', input.prompt);
    form.append('size', input.size);
    form.append('quality', QUALITY_TO_ENGINE[input.quality]);
    if (input.inputFidelity) form.append('input_fidelity', input.inputFidelity);
    for (const img of input.images) {
      form.append(
        'image[]',
        new Blob([img.data as BlobPart], { type: img.contentType ?? 'image/png' }),
        img.filename,
      );
    }
    const res = await this.request('/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
      body: form,
    });
    return this.parseResult(res);
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      // 网络错误 / 超时 → 可重试
      throw new ProviderError(`muskapis network error: ${String(err)}`, 'retryable');
    }
    const text = await res.text();
    if (!res.ok) {
      throw new ProviderError(
        `muskapis http ${res.status}: ${text.slice(0, 500)}`,
        classify(res.status, text),
        res.status,
        text,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError('muskapis returned non-JSON body', 'retryable', res.status, text);
    }
  }

  private parseResult(raw: unknown): ImageResult {
    const body = raw as { data?: Array<{ b64_json?: string; url?: string }>; usage?: unknown };
    const images = (body.data ?? [])
      .map((d) => ({ b64: d.b64_json, url: d.url }))
      .filter((d) => d.b64 || d.url);
    if (images.length === 0) {
      throw new ProviderError('muskapis returned no images', 'retryable', undefined, raw);
    }
    return { images, model: this.model, usage: body.usage };
  }
}

function classify(status: number, body: string): ProviderErrorKind {
  const lower = body.toLowerCase();
  if (
    lower.includes('content_policy') ||
    lower.includes('moderation') ||
    lower.includes('safety')
  ) {
    return 'moderation_rejected';
  }
  if (status === 429 || status >= 500) return 'retryable';
  return 'non_retryable'; // 4xx 参数/鉴权类
}
