import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  EffectiveDiscoveryConfig,
  PipelineConfig,
  PipelineStep,
  REQUIRED_STEP_KEYS,
} from '../discovery-pipeline.types';

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result: T = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal !== null &&
      overrideVal !== undefined &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as object, overrideVal as object) as T[typeof key];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[typeof key];
    }
  }
  return result;
}

function mergePipelines(base: PipelineConfig, override: Partial<PipelineConfig>): PipelineConfig {
  if (!override.steps) return { ...base, ...override };

  const baseMap = new Map(base.steps.map((s) => [s.stepKey, s]));
  const mergedSteps = base.steps.map((s) => {
    const overrideStep = override.steps?.find((os) => os.stepKey === s.stepKey);
    if (!overrideStep) return s;
    return { ...s, ...overrideStep, params: { ...s.params, ...overrideStep.params } };
  });

  // Append any completely new steps from override
  for (const s of override.steps) {
    if (!baseMap.has(s.stepKey)) mergedSteps.push(s);
  }

  return { ...base, ...override, steps: mergedSteps };
}

@Injectable()
export class DiscoveryConfigService {
  private readonly logger = new Logger(DiscoveryConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getSystemDefaults(): Promise<EffectiveDiscoveryConfig> {
    const sys = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    if (!sys) throw new NotFoundException('SystemConfig not seeded');
    return sys.defaults as unknown as EffectiveDiscoveryConfig;
  }

  async updateSystemDefaults(patch: Partial<EffectiveDiscoveryConfig>, updatedBy?: string) {
    const current = await this.getSystemDefaults();
    const next = deepMerge(current, patch);
    return this.prisma.systemConfig.update({
      where: { id: 1 },
      data: { defaults: next as object, version: { increment: 1 }, updatedBy: updatedBy ?? null },
    });
  }

  async getCityConfig(cityId: number) {
    const cfg = await this.prisma.discoveryConfig.findUnique({ where: { cityId } });
    if (!cfg) throw new NotFoundException(`DiscoveryConfig for city ${cityId} not found`);
    return cfg;
  }

  async getEffectiveConfig(cityId: number, runOverride?: object): Promise<EffectiveDiscoveryConfig> {
    const systemDefaults = await this.getSystemDefaults();
    const cityRow = await this.prisma.discoveryConfig.findUnique({ where: { cityId } });

    let effective = systemDefaults;

    if (cityRow) {
      const cityData = cityRow as unknown as Partial<EffectiveDiscoveryConfig> & { pipeline: PipelineConfig };
      const mergedPipeline = mergePipelines(systemDefaults.pipeline, cityData.pipeline ?? {});
      effective = deepMerge(effective, {
        ...cityData,
        pipeline: mergedPipeline,
      } as Partial<EffectiveDiscoveryConfig>);
    }

    if (runOverride && Object.keys(runOverride).length > 0) {
      const overrideTyped = runOverride as Partial<EffectiveDiscoveryConfig> & { pipeline?: Partial<PipelineConfig> };
      if (overrideTyped.pipeline?.steps) {
        effective = {
          ...deepMerge(effective, overrideTyped as Partial<EffectiveDiscoveryConfig>),
          pipeline: mergePipelines(effective.pipeline, overrideTyped.pipeline),
        };
      } else {
        effective = deepMerge(effective, overrideTyped as Partial<EffectiveDiscoveryConfig>);
      }
    }

    // Apply env kill switches (highest priority)
    effective = this.applyEnvKillSwitches(effective);

    return effective;
  }

  private applyEnvKillSwitches(config: EffectiveDiscoveryConfig): EffectiveDiscoveryConfig {
    const llmDisabled = this.configService.get<string>('DISCOVERY_LLM_DISABLED') === 'true';
    const dryRunDefault = this.configService.get<string>('DISCOVERY_DRY_RUN_DEFAULT') === 'true';

    if (!llmDisabled && !dryRunDefault) return config;

    const steps = config.pipeline.steps.map((s: PipelineStep) => {
      if (llmDisabled && s.stepKey.startsWith('llm_')) {
        return { ...s, enabled: false };
      }
      return s;
    });

    return {
      ...config,
      pipeline: {
        ...config.pipeline,
        dryRun: dryRunDefault ? true : config.pipeline.dryRun,
        steps,
      },
    };
  }

  validatePipeline(pipeline: PipelineConfig): void {
    const stepKeys = pipeline.steps.map((s) => s.stepKey);

    for (const required of REQUIRED_STEP_KEYS) {
      if (!stepKeys.includes(required)) {
        throw new BadRequestException(`Pipeline missing required step: ${required}`);
      }
    }

    const unique = new Set(stepKeys);
    if (unique.size !== stepKeys.length) {
      throw new BadRequestException('Pipeline steps must have unique stepKey values');
    }

    if (!pipeline.version || pipeline.version < 1) {
      throw new BadRequestException('Pipeline version must be >= 1');
    }
  }

  async setCityConfig(
    cityId: number,
    pipeline: PipelineConfig,
    extras: Record<string, unknown>,
    updatedBy?: string,
  ) {
    this.validatePipeline(pipeline);

    const existing = await this.prisma.discoveryConfig.findUnique({ where: { cityId } });
    const nextVersion = existing ? existing.version + 1 : 1;

    const data = {
      version: nextVersion,
      pipeline: pipeline as object,
      updatedBy: updatedBy ?? null,
      ...(extras as Record<string, unknown>),
    };

    const cfg = existing
      ? await this.prisma.discoveryConfig.update({
          where: { cityId },
          data,
        })
      : await this.prisma.discoveryConfig.create({
          data: { cityId, ...data } as Parameters<typeof this.prisma.discoveryConfig.create>[0]['data'],
        });

    // Snapshot the version for rollback
    await this.prisma.discoveryConfigVersion.upsert({
      where: { cityId_version: { cityId, version: nextVersion } },
      create: { cityId, version: nextVersion, payload: pipeline as object, createdBy: updatedBy ?? null },
      update: {},
    });

    return cfg;
  }

  async patchStep(cityId: number, stepKey: string, patch: Partial<PipelineStep>, updatedBy?: string) {
    const cfg = await this.getCityConfig(cityId);
    const pipeline = cfg.pipeline as unknown as PipelineConfig;
    const stepIndex = pipeline.steps.findIndex((s) => s.stepKey === stepKey);
    if (stepIndex === -1) throw new NotFoundException(`Step '${stepKey}' not found in city ${cityId} config`);

    pipeline.steps[stepIndex] = {
      ...pipeline.steps[stepIndex],
      ...patch,
      params: { ...pipeline.steps[stepIndex].params, ...(patch.params ?? {}) },
    };

    return this.setCityConfig(cityId, pipeline, {}, updatedBy);
  }

  async rollbackConfig(cityId: number, version: number) {
    const snap = await this.prisma.discoveryConfigVersion.findUnique({
      where: { cityId_version: { cityId, version } },
    });
    if (!snap) throw new NotFoundException(`Version ${version} not found for city ${cityId}`);
    return this.setCityConfig(cityId, snap.payload as unknown as PipelineConfig, {}, 'rollback');
  }

  async listConfigVersions(cityId: number) {
    return this.prisma.discoveryConfigVersion.findMany({
      where: { cityId },
      orderBy: { version: 'desc' },
    });
  }
}
