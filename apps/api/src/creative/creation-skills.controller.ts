import { Controller, Get } from '@nestjs/common';
import { CreationSkillsService } from './creation-skills.service';

@Controller('creation-skills')
export class CreationSkillsController {
  constructor(private readonly skills: CreationSkillsService) {}

  @Get()
  list() {
    return { code: 0, message: 'ok', data: this.skills.list() };
  }
}
