import { Module } from '@nestjs/common';
import { InterviewsService } from './services/interviews.service';
import { InterviewsController } from './controllers/interviews.controller';

@Module({
  providers: [InterviewsService],
  controllers: [InterviewsController],
  exports: [InterviewsService],
})
export class InterviewsModule {}
