import { Injectable } from '@nestjs/common';
import { POINTS_PER_IMAGE, Quality, Ratio } from '@hitframe/shared';

/** Agent 路由结果（S5.3，无副作用：不创建 Run、不扣点） */
export interface AgentPlan {
  /** 推荐路径：t2i(文生图) / i2i(图生图，无模板) / template(模板) */
  mode: 't2i' | 'i2i' | 'template';
  /** 模板 ID（mode=template 时） */
  templateId?: string;
  /** 解析的参数 */
  params: {
    ratio?: Ratio;
    candidateCount?: number;
    quality?: Quality;
  };
  /** 槽位缺失提示 */
  missingSlots?: string[];
  /** 预计点数 */
  estimatedPoints: number;
  /** 补充描述（用户模糊表达，不结构化） */
  additionalPrompt?: string;
}

@Injectable()
export class AgentService {
  /**
   * 规则路由（S5 不做大模型规划）：意图识别 + 参数解析 + 生成方案卡。
   * 输入：用户自然语言 + 可选已上传图片。
   * 输出：AgentPlan（前端展示后用户确认，再调 POST /generations）。
   */
  route(userInput: string, uploadedImages?: string[]): AgentPlan {
    const input = userInput.toLowerCase();
    const hasImage = !!(uploadedImages && uploadedImages.length > 0);

    // 1. 解析明确参数：比例 / 数量 / 质量
    const ratio = this.parseRatio(input);
    const candidateCount = this.parseCount(input);
    const quality = this.parseQuality(input);

    // 2. 意图识别：模板 > 图生图 > 文生图
    const templateIntent = this.detectTemplate(input, hasImage);
    if (templateIntent) {
      const missingSlots = hasImage ? [] : ['需上传商品图或服装图'];
      return {
        mode: 'template',
        templateId: templateIntent,
        params: { ratio, candidateCount, quality },
        missingSlots: missingSlots.length > 0 ? missingSlots : undefined,
        estimatedPoints: this.calcPoints(candidateCount, quality),
        additionalPrompt: this.extractAdditional(input),
      };
    }

    if (hasImage) {
      return {
        mode: 'i2i',
        params: { ratio, candidateCount, quality },
        estimatedPoints: this.calcPoints(candidateCount, quality),
        additionalPrompt: input, // 图生图：全部描述作为 prompt
      };
    }

    return {
      mode: 't2i',
      params: { ratio, candidateCount, quality },
      estimatedPoints: this.calcPoints(candidateCount, quality),
      additionalPrompt: input, // 文生图：全部描述作为 prompt
    };
  }

  /** 解析比例：1:1 / 3:4 / 4:3 / 9:16（引擎支持的四种）；16:9 映射为 4:3 横版 */
  private parseRatio(input: string): Ratio {
    // 优先匹配数字比例
    const ratioMatch = input.match(/(\d+)\s*[:比xX×]\s*(\d+)/);
    if (ratioMatch) {
      const [, w, h] = ratioMatch;
      const key = `${w}:${h}`;
      // 直接匹配引擎支持的比例
      if (['1:1', '3:4', '4:3', '9:16'].includes(key)) return key as Ratio;
      // 16:9 映射为 4:3（最接近的横版）
      if (key === '16:9') return '4:3';
    }

    // 常见别名
    if (/横屏|横版|宽屏/.test(input)) return '4:3';
    if (/竖屏|竖版|手机屏/.test(input)) return '9:16';
    if (/正方|方形/.test(input)) return '1:1';
    if (/海报|封面/.test(input)) return '9:16'; // 小红书/电商海报默认竖版

    return '1:1'; // 默认正方形
  }

  /** 解析数量：1张 / 两张 / 3个 / 一组(默认4) */
  private parseCount(input: string): number {
    const countMatch = input.match(/(\d+)\s*[张个幅份]/);
    if (countMatch) return Math.min(Number(countMatch[1]), 4); // 上限4

    // 中文数字
    const cnMap: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4 };
    for (const [cn, num] of Object.entries(cnMap)) {
      if (input.includes(cn + '张') || input.includes(cn + '个')) return num;
    }

    if (/一组|一套/.test(input)) return 4;
    return 2; // 默认2张
  }

  /** 解析质量：高清 / HD / 标准 */
  private parseQuality(input: string): 'standard' | 'high' {
    if (/高清|hd|高质量|精修/i.test(input)) return 'high';
    return 'standard';
  }

  /** 模板意图识别（关键词匹配） */
  private detectTemplate(input: string, hasImage: boolean): string | null {
    // 换背景：允许"换X背景"或"背景X换"等变体
    if (/换.{0,6}背景|背景.{0,3}(替换|更换)/.test(input)) return 'tpl_bg';
    if (/模特|上身|试穿|穿搭|真人/.test(input)) return 'tpl_model';
    if (/海报|封面|小红书|营销图|宣传图/.test(input)) return 'tpl_poster';
    // 有图 + 商品介绍 → 可能是换背景或海报，优先换背景（更简单）
    if (hasImage && /商品|产品|介绍图|详情图/.test(input)) return 'tpl_bg';
    return null;
  }

  /** 提取补充描述（去掉已解析的结构化部分，保留模糊表达） */
  private extractAdditional(input: string): string | undefined {
    // 简化：S5 只做关键词去除，不做复杂 NLP
    const clean = input
      .replace(/(\d+)\s*[:比xX×]\s*(\d+)/g, '') // 去比例
      .replace(/(\d+|一|两|二|三|四)\s*[张个幅份]/g, '') // 去数量
      .replace(/高清|hd|标准|质量/gi, '') // 去质量
      .replace(/换背景|模特|上身|海报|封面/g, '') // 去模板关键词
      .trim();
    return clean.length > 5 ? clean : undefined; // 剩余有效内容才返回
  }

  private calcPoints(count: number, quality: Quality): number {
    return count * POINTS_PER_IMAGE[quality];
  }
}
