import { Controller, Get, Post } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';

@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  // @Get('reports')
  // getReports() {}

  // @Post('ai/recommendations')
  // getRecommendations() {}
}
