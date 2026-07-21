import { Body, Controller, Post } from '@nestjs/common';
import { AgentService } from './agent.service';

export class RouteRequestDto {
  userInput!: string;
  uploadedImages?: string[];
}

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /**
   * POST /api/v1/agent/route
   * Agent 规则路由（S5.3）：解析用户意图 + 参数，返回生成方案卡（无副作用）。
   * 前端展示方案后用户确认，再调 POST /api/v1/generations 创建 Run。
   */
  @Post('route')
  route(@Body() dto: RouteRequestDto) {
    const plan = this.agent.route(dto.userInput, dto.uploadedImages);
    return { data: plan };
  }
}
