import type { Quality } from '@hitframe/shared';
import {
  EditInput,
  GenerateInput,
  ImageProvider,
  ImageResult,
  ProviderError,
  ProviderErrorKind,
  ProviderResponseMeta,
} from './provider';

export interface MuskapisConfig {
  baseUrl: string; // e.g. https://api.muskapis.com/v1
  apiKey: string;
  model: string; // e.g. gpt-image-2
  timeoutMs?: number;
}

interface ProviderHttpResponse {
  body: unknown;
  responseMeta: ProviderResponseMeta;
}

/** 画质唯一口径：preview→low / standard→medium / high→high。 */
const QUALITY_TO_ENGINE: Record<Quality, string> = {
  preview: 'low',
  standard: 'medium',
  high: 'high',
};

/** 官方接口说明：curl 示例 --max-time 300；图生图/多图融合耗时更长，取 300s */
const DEFAULT_TIMEOUT_MS = 300_000;

export class MuskapisProvider implements ImageProvider {
  readonly name = 'muskapis';
  readonly model: string;

  constructor(private readonly cfg: MuskapisConfig) {
    this.model = cfg.model;
  }

  async generate(input: GenerateInput): Promise<ImageResult> {
    const response = await this.request('/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        ...(input.size ? { size: input.size } : {}),
        quality: QUALITY_TO_ENGINE[input.quality],
        n: 1, // 引擎 n 实际返回 1 张；多候选=多 Job（技术方案 R8）
      }),
    });
    return {
      ...this.parseResult(response.body, response.responseMeta),
      responseMeta: response.responseMeta,
    };
  }

  async edit(input: EditInput): Promise<ImageResult> {
    const form = new FormData();
    form.append('model', this.model);
    form.append('prompt', input.prompt);
    if (input.size) form.append('size', input.size);
    form.append('quality', QUALITY_TO_ENGINE[input.quality]);
    if (input.inputFidelity && !/^gpt-image-2(?:-|$)/i.test(this.model)) {
      form.append('input_fidelity', input.inputFidelity);
    }
    for (const img of input.images) {
      form.append(
        'image[]',
        new Blob([img.data as BlobPart], { type: img.contentType ?? 'image/png' }),
        img.filename,
      );
    }
    const response = await this.request('/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
      body: form,
    });
    return {
      ...this.parseResult(response.body, response.responseMeta),
      responseMeta: response.responseMeta,
    };
  }

  private async request(path: string, init: RequestInit): Promise<ProviderHttpResponse> {
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
    const responseMeta: ProviderResponseMeta = {
      httpStatus: res.status,
      providerTraceId:
        res.headers.get('x-request-id') ?? res.headers.get('request-id') ?? undefined,
    };
    let text: string;
    try {
      // Capture status and headers before consuming the body: a terminated
      // response stream can still have delivered a valid HTTP status.
      text = await res.text();
    } catch (err) {
      throw new ProviderError(
        `muskapis response body read failed: ${String(err)}`,
        'retryable',
        res.status,
        undefined,
        undefined,
        responseMeta,
      );
    }
    const body = parseJson(text);
    responseMeta.relayRequestId = readString(body, 'requestId') ?? readString(body, 'request_id');
    responseMeta.relayCode = readScalar(body, 'code');
    if (!res.ok) {
      throw new ProviderError(
        `muskapis http ${res.status}: ${text.slice(0, 500)}`,
        classify(res.status, text),
        res.status,
        body ?? text,
        undefined,
        responseMeta,
      );
    }
    if (body === undefined) {
      throw new ProviderError(
        'muskapis returned non-JSON body',
        'retryable',
        res.status,
        text,
        undefined,
        responseMeta,
      );
    }
    return { body, responseMeta };
  }

  private parseResult(raw: unknown, responseMeta: ProviderResponseMeta): ImageResult {
    const body = raw as { data?: Array<{ b64_json?: string; url?: string }>; usage?: unknown };
    const images = (body.data ?? [])
      .map((d) => ({ b64: d.b64_json, url: d.url }))
      .filter((d) => d.b64 || d.url);
    if (images.length === 0) {
      throw new ProviderError(
        'muskapis returned no images',
        'retryable',
        responseMeta.httpStatus,
        raw,
        undefined,
        responseMeta,
      );
    }
    return { images, model: this.model, usage: body.usage };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function readScalar(value: unknown, key: string): string | number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : undefined;
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
