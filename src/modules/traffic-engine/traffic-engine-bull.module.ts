import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import {
  TRAFFIC_ENGINE_AI_QUEUE,
  TRAFFIC_ENGINE_ANALYTICS_QUEUE,
  TRAFFIC_ENGINE_IDEA_GENERATION_QUEUE,
} from './queue/queue.constants';

@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      { name: TRAFFIC_ENGINE_AI_QUEUE },
      { name: TRAFFIC_ENGINE_ANALYTICS_QUEUE },
      { name: TRAFFIC_ENGINE_IDEA_GENERATION_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class TrafficEngineBullQueuesModule {}
