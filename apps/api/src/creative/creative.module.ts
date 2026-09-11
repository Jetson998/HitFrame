import { Module } from '@nestjs/common';
import { CreationSkillsController } from './creation-skills.controller';
import { CreationSkillsService } from './creation-skills.service';

@Module({
  controllers: [CreationSkillsController],
  providers: [CreationSkillsService],
  exports: [CreationSkillsService],
})
export class CreativeModule {}
