import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CLINIC_DISCOVERY_ENRICH_QUEUE } from '../../constants/queue.constants';
import { DiscoveryService } from '../services/discovery.service';
import { EffectiveDiscoveryConfig } from '../config/discovery-pipeline.types';

interface DiscoveryRunJob {
  runId: number;
  cityId: number;
  config: EffectiveDiscoveryConfig;
}

interface EnrichJob {
  candidateId: number;
  runId: number;
  config: EffectiveDiscoveryConfig;
}

@Processor(CLINIC_DISCOVERY_ENRICH_QUEUE)
export class DiscoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DiscoveryProcessor.name);

  constructor(private readonly svc: DiscoveryService) {
    super();
  }

  async process(job: Job<DiscoveryRunJob | EnrichJob>): Promise<void> {
    if (job.name === 'discovery.run') {
      const { runId } = job.data as DiscoveryRunJob;
      this.logger.log(`Processing discovery run ${runId}`);
      await this.svc.executeRun(runId);
    } else if (job.name === 'discovery.enrich') {
      const { candidateId, config } = job.data as EnrichJob;
      this.logger.log(`Enriching candidate ${candidateId}`);
      await this.svc.enrichCandidate(candidateId, config);
    }
  }
}
