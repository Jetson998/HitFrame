import { Injectable } from '@nestjs/common';
import type { CreationSkillSummaryDto } from '@hitframe/shared';
import { CREATION_SKILLS } from './creation-skills.registry';

@Injectable()
export class CreationSkillsService {
  list(): CreationSkillSummaryDto[] {
    return CREATION_SKILLS.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      outputType: skill.outputType,
      generationMode: skill.generationMode,
      requiredReferences: skill.requiredReferences,
      optionalReferences: skill.optionalReferences,
      defaultRatio: skill.defaultRatio,
      defaultCandidateCount: skill.defaultCandidateCount,
      defaultQuality: skill.defaultQuality,
      textLayerPolicy: skill.promptRules.textLayerPolicy,
      version: skill.version,
    }));
  }
}
