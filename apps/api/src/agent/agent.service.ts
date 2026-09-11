import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AgentPlanDto,
  AgentReferencePreference,
  POINTS_PER_IMAGE,
  Quality,
  Ratio,
  ReferenceInput,
  ReferenceRole,
} from '@hitframe/shared';
import { findCreationSkill } from '../creative/creation-skills.registry';

/** Agent 路由结果（S5.3，无副作用：不创建 Run、不扣点）——契约见 shared AgentPlanDto */
export type AgentPlan = AgentPlanDto;

@Injectable()
export class AgentService {
  /**
   * 规则路由（S5 不做大模型规划）：意图识别 + 参数解析 + 生成方案卡。
   * 输入：用户自然语言 + 可选已上传图片。
   * 输出：AgentPlan（前端展示后用户确认，再调 POST /generations）。
   */
  route(
    userInput: string,
    uploadedImages?: string[],
    requestedSkillId?: string,
    references?: ReferenceInput[],
    referencePreference: AgentReferencePreference = 'auto',
  ): AgentPlan {
    if (typeof userInput !== 'string' || !userInput.trim()) {
      throw new BadRequestException({ code: 40001, message: '请输入创作需求' });
    }
    const rawInput = userInput.trim();
    const input = rawInput.toLowerCase();
    const hasImage = Boolean(uploadedImages?.length || references?.length);
    const requestedSkill = findCreationSkill(requestedSkillId);
    if (requestedSkillId && !requestedSkill) {
      throw new BadRequestException({ code: 40001, message: 'Skill 不存在' });
    }

    // 1. 解析明确参数：比例 / 数量 / 质量
    const ratio = this.parseRatio(input, requestedSkill?.defaultRatio ?? '1:1');
    const candidateCount = this.parseCount(input, requestedSkill?.defaultCandidateCount ?? 2);
    const quality = this.parseQuality(input, requestedSkill?.defaultQuality ?? 'standard');

    if (requestedSkill) {
      const createWithoutReference = this.shouldCreateWithoutReference(
        requestedSkill.supportsTextOnly,
        referencePreference,
        hasImage,
      );
      const templateId = createWithoutReference
        ? undefined
        : this.templateForSkill(requestedSkill.id);
      const missingRoles = createWithoutReference
        ? []
        : this.missingReferenceRoles(
            requestedSkill.requiredReferences,
            references,
            hasImage,
          );
      return {
        skillId: requestedSkill.id,
        outputType: requestedSkill.outputType,
        mode: createWithoutReference
          ? 't2i'
          : templateId
            ? 'template'
            : hasImage
              ? 'i2i'
              : requestedSkill.generationMode,
        templateId,
        params: { ratio, candidateCount, quality },
        missingSlots: missingRoles.length
          ? missingRoles.map((role) => this.referenceRoleLabel(role))
          : undefined,
        allowsTextOnly: Boolean(requestedSkill.supportsTextOnly),
        estimatedPoints: this.calcPoints(candidateCount, quality),
        additionalPrompt: rawInput,
      };
    }

    // 2. 意图识别：模板 > 图生图 > 文生图
    const templateIntent = this.detectTemplate(input, hasImage);
    if (templateIntent) {
      const skillId = this.skillForTemplate(templateIntent, input);
      const detectedSkill = findCreationSkill(skillId);
      const createWithoutReference = this.shouldCreateWithoutReference(
        detectedSkill?.supportsTextOnly,
        referencePreference,
        hasImage,
      );
      const missingRoles = createWithoutReference
        ? []
        : this.missingReferenceRoles(
            detectedSkill?.requiredReferences ?? ['product'],
            references,
            hasImage,
          );
      return {
        skillId,
        outputType: 'image',
        mode: createWithoutReference ? 't2i' : 'template',
        templateId: createWithoutReference ? undefined : templateIntent,
        params: { ratio, candidateCount, quality },
        missingSlots: missingRoles.length
          ? missingRoles.map((role) => this.referenceRoleLabel(role))
          : undefined,
        allowsTextOnly: Boolean(detectedSkill?.supportsTextOnly),
        estimatedPoints: this.calcPoints(candidateCount, quality),
        additionalPrompt: createWithoutReference
          ? rawInput
          : this.extractAdditional(rawInput),
      };
    }

    if (hasImage) {
      const hasProduct =
        !references || references.some((reference) => reference.role === 'product');
      return {
        skillId: hasProduct ? 'skill_product_atmosphere' : 'skill_general_image',
        outputType: 'image',
        mode: 'i2i',
        params: { ratio, candidateCount, quality },
        estimatedPoints: this.calcPoints(candidateCount, quality),
        additionalPrompt: rawInput, // 图生图：全部描述作为 prompt
      };
    }

    return {
      skillId: 'skill_general_image',
      outputType: 'image',
      mode: 't2i',
      params: { ratio, candidateCount, quality },
      estimatedPoints: this.calcPoints(candidateCount, quality),
      additionalPrompt: rawInput, // 文生图：全部描述作为 prompt
    };
  }

  /** 解析比例：1:1 / 3:4 / 4:3 / 9:16（引擎支持的四种）；16:9 映射为 4:3 横版 */
  private parseRatio(input: string, fallback: Ratio): Ratio {
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

    return fallback;
  }

  /** 解析数量：1张 / 两张 / 3个 / 一组(默认4) */
  private parseCount(input: string, fallback: number): number {
    const countMatch = input.match(/(\d+)\s*[张个幅份]/);
    if (countMatch) return Math.max(1, Math.min(Number(countMatch[1]), 4));

    // 中文数字
    const cnMap: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4 };
    for (const [cn, num] of Object.entries(cnMap)) {
      if (input.includes(cn + '张') || input.includes(cn + '个')) return num;
    }

    if (/一组|一套/.test(input)) return 4;
    return fallback;
  }

  /** 解析质量：预览 / 标准 / 高清；未指定时保持标准。 */
  private parseQuality(input: string, fallback: Quality): Quality {
    if (/高清|hd|高质量|精修/i.test(input)) return 'high';
    if (/预览|低清|低质量|快速出图|快速生成/.test(input)) return 'preview';
    return fallback;
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
      .replace(/预览|低清|低质量|快速出图|快速生成|高清|hd|标准|质量|精修|高质量/gi, '') // 去质量
      .replace(/换背景|模特|上身|海报|封面/g, '') // 去模板关键词
      // 清理去词后残留的标点：连续标点合一 + 去首尾标点/空白
      .replace(/[，,、。.\s]{2,}/g, '，')
      .replace(/^[，,、。.\s]+|[，,、。.\s]+$/g, '')
      .trim();
    return clean.length > 5 ? clean : undefined; // 剩余有效内容才返回
  }

  private calcPoints(count: number, quality: Quality): number {
    return count * POINTS_PER_IMAGE[quality];
  }

  private templateForSkill(skillId: string): string | undefined {
    const templates: Record<string, string> = {
      skill_product_background: 'tpl_bg',
      skill_model_try_on: 'tpl_model',
      skill_ecommerce_poster: 'tpl_poster',
      skill_xhs_cover: 'tpl_poster',
    };
    return templates[skillId];
  }

  private skillForTemplate(templateId: string, input: string): string {
    if (templateId === 'tpl_bg') return 'skill_product_background';
    if (templateId === 'tpl_model') return 'skill_model_try_on';
    if (/小红书/.test(input)) return 'skill_xhs_cover';
    return 'skill_ecommerce_poster';
  }

  private referenceRoleLabel(role: string): string {
    return (
      {
        product: '需上传商品主体',
        person: '需上传人物主体',
        background: '需上传背景参考',
        style: '需上传风格参考',
        logo: '需上传 Logo / 品牌素材',
      }[role] ?? '需上传参考图片'
    );
  }

  private missingReferenceRoles(
    required: ReferenceRole[],
    references: ReferenceInput[] | undefined,
    hasLegacyImage: boolean,
  ): ReferenceRole[] {
    if (references) {
      const present = new Set(references.map((reference) => reference.role));
      return required.filter((role) => !present.has(role));
    }
    // 旧客户端只传图片 ID，没有角色；现有 Skill 首期最多要求一个必填角色。
    return hasLegacyImage ? [] : required;
  }

  private shouldCreateWithoutReference(
    supportsTextOnly: boolean | undefined,
    preference: AgentReferencePreference,
    hasImage: boolean,
  ): boolean {
    return Boolean(supportsTextOnly && preference === 'without_reference' && !hasImage);
  }
}
