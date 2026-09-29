import { Controller, Get, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get('recommendations/my')
  @UseGuards(AuthGuard)
  getMyRecommendations(@Request() req: any, @Query('branchId') branchId: string, @Query('limit') limit: string) {
    if (!branchId) throw new BadRequestException('branchId is required');
    return this.intelligenceService.getMyRecommendations(req.user, Number(branchId), Number(limit) || 6);
  }
}
