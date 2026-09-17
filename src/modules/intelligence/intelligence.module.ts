import { Module } from '@nestjs/common';
import { AiController } from './controllers/ai.controller';
import { ReportsController } from './controllers/reports.controller';
import { AiService } from './services/ai.service';
import { ReportsService } from './services/reports.service';

@Module({
  controllers: [AiController, ReportsController],
  providers: [AiService, ReportsService],
})
export class IntelligenceModule {}
