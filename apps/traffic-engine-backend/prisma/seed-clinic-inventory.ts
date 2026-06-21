import { PrismaClient } from '@prisma/client';

const DEFAULT_PIPELINE_VERSION_1 = {
  version: 1,
  dryRun: false,
  steps: [
    {
      stepKey: 'places_search',
      enabled: true,
      params: {
        keywords: ['fertility clinic', 'IVF clinic', 'clinica fertilidad'],
        language: 'en',
        radiusKm: 25,
        maxResults: 60,
        pageDepth: 2,
      },
    },
    {
      stepKey: 'dedup',
      enabled: true,
      params: {
        strategy: 'placeId+domain+fuzzy',
        fuzzyMeters: 500,
        fuzzyNameSimilarity: 0.85,
      },
    },
    {
      stepKey: 'places_details',
      enabled: true,
      params: {
        fields: [
          'website',
          'phone',
          'opening_hours',
          'photos',
          'reviews',
          'business_status',
        ],
      },
    },
    {
      stepKey: 'website_fetch',
      enabled: true,
      params: {
        timeoutMs: 8000,
        maxPages: 3,
        pathHints: ['/precios', '/pricing', '/about', '/team', '/tratamientos'],
      },
    },
    {
      stepKey: 'llm_extract',
      enabled: false,
      params: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        extract: ['services', 'accreditations', 'languages', 'doctors'],
        maxCostUsd: 0.1,
      },
    },
    {
      stepKey: 'llm_pricing',
      enabled: false,
      params: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        minConfidence: 0.7,
        maxCostUsd: 0.05,
      },
    },
    {
      stepKey: 'score',
      enabled: true,
      params: {
        weights: {
          nameMatch: 0.25,
          websiteResolves: 0.15,
          fertilityTerms: 0.2,
          accreditation: 0.15,
          insidePolygon: 0.15,
          operational: 0.1,
        },
        publishThreshold: 0.85,
      },
    },
    {
      stepKey: 'publish_gate',
      enabled: true,
      params: {
        requireHumanReview: true,
        minimumFields: ['websiteUrl', 'addressLine'],
        maxAutoPublishesPerRun: 10,
      },
    },
  ],
};

const DEFAULT_SYSTEM_CONFIG_DEFAULTS = {
  pipeline: DEFAULT_PIPELINE_VERSION_1,
  budgets: {
    perRunUsd: 1.5,
    monthlyUsd: 50,
    alertOnPercent: 80,
  },
  rateLimits: {
    placesQps: 5,
    llmConcurrency: 2,
    enrichmentConcurrency: 4,
  },
  schedule: {
    cron: '0 3 * * 1',
    timezone: 'UTC',
    isActive: true,
  },
  truthScore: {
    minInterviewsForLive: 5,
    dimensionWeights: null,
    gradeBands: null,
    staleScoreDays: 30,
  },
  observability: {
    storeRawSourcePayload: true,
    traceLevel: 'basic',
  },
};

export async function seedClinicInventory(prisma: PrismaClient): Promise<void> {
  console.log('Seeding clinic inventory data...');

  // ── System Config (singleton) ─────────────────────────────────────────────
  await prisma.systemConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      defaults: DEFAULT_SYSTEM_CONFIG_DEFAULTS,
      version: 1,
    },
    update: {
      defaults: DEFAULT_SYSTEM_CONFIG_DEFAULTS,
    },
  });
  console.log('✓ SystemConfig seeded');

  // ── Countries ─────────────────────────────────────────────────────────────
  const [spain, greece, czech, turkey, portugal, northMacedonia] = await Promise.all([
    prisma.country.upsert({
      where: { codeIso2: 'ES' },
      create: { codeIso2: 'ES', name: 'Spain', defaultCurrency: 'EUR' },
      update: {},
    }),
    prisma.country.upsert({
      where: { codeIso2: 'GR' },
      create: { codeIso2: 'GR', name: 'Greece', defaultCurrency: 'EUR' },
      update: {},
    }),
    prisma.country.upsert({
      where: { codeIso2: 'CZ' },
      create: { codeIso2: 'CZ', name: 'Czech Republic', defaultCurrency: 'EUR' },
      update: {},
    }),
    prisma.country.upsert({
      where: { codeIso2: 'TR' },
      create: { codeIso2: 'TR', name: 'Turkey', defaultCurrency: 'EUR' },
      update: {},
    }),
    prisma.country.upsert({
      where: { codeIso2: 'PT' },
      create: { codeIso2: 'PT', name: 'Portugal', defaultCurrency: 'EUR' },
      update: {},
    }),
    prisma.country.upsert({
      where: { codeIso2: 'MK' },
      create: { codeIso2: 'MK', name: 'North Macedonia', defaultCurrency: 'EUR' },
      update: {},
    }),
  ]);
  console.log('✓ Countries seeded');

  // ── Cities ────────────────────────────────────────────────────────────────
  const cityData = [
    {
      countryId: spain.id,
      name: 'Barcelona',
      slug: 'barcelona',
      lat: 41.3851,
      lng: 2.1734,
      phase: 'PHASE_1' as const,
      scheduleTimezone: 'Europe/Madrid',
    },
    {
      countryId: spain.id,
      name: 'Madrid',
      slug: 'madrid',
      lat: 40.4168,
      lng: -3.7038,
      phase: 'PHASE_1' as const,
      scheduleTimezone: 'Europe/Madrid',
    },
    {
      countryId: spain.id,
      name: 'Alicante',
      slug: 'alicante',
      lat: 38.3452,
      lng: -0.4815,
      phase: 'PHASE_1' as const,
      scheduleTimezone: 'Europe/Madrid',
    },
    {
      countryId: greece.id,
      name: 'Athens',
      slug: 'athens',
      lat: 37.9838,
      lng: 23.7275,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Athens',
    },
    {
      countryId: czech.id,
      name: 'Prague',
      slug: 'prague',
      lat: 50.0755,
      lng: 14.4378,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Prague',
    },
    {
      countryId: spain.id,
      name: 'Valencia',
      slug: 'valencia',
      lat: 39.4699,
      lng: -0.3763,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Madrid',
    },
    {
      countryId: greece.id,
      name: 'Thessaloniki',
      slug: 'thessaloniki',
      lat: 40.6401,
      lng: 22.9444,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Athens',
    },
    {
      countryId: czech.id,
      name: 'Brno',
      slug: 'brno',
      lat: 49.1951,
      lng: 16.6068,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Prague',
    },
    {
      countryId: turkey.id,
      name: 'Istanbul',
      slug: 'istanbul',
      lat: 41.0082,
      lng: 28.9784,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Istanbul',
    },
    {
      countryId: turkey.id,
      name: 'Ankara',
      slug: 'ankara',
      lat: 39.9334,
      lng: 32.8597,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Istanbul',
    },
    {
      countryId: portugal.id,
      name: 'Lisbon',
      slug: 'lisbon',
      lat: 38.7223,
      lng: -9.1393,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Lisbon',
    },
    {
      countryId: portugal.id,
      name: 'Porto',
      slug: 'porto',
      lat: 41.1579,
      lng: -8.6291,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Lisbon',
    },
    {
      countryId: northMacedonia.id,
      name: 'Skopje',
      slug: 'skopje',
      lat: 41.9981,
      lng: 21.4254,
      phase: 'PHASE_2' as const,
      scheduleTimezone: 'Europe/Skopje',
    },
  ];

  const cities: Record<string, number> = {};
  for (const c of cityData) {
    const { scheduleTimezone, ...cityCreate } = c;
    const city = await prisma.city.upsert({
      where: { slug: c.slug },
      create: cityCreate,
      update: {},
    });
    cities[c.slug] = city.id;

    // Create per-city DiscoveryConfig (LLM disabled by default, human review on)
    const cityPipeline = {
      ...DEFAULT_PIPELINE_VERSION_1,
      steps: DEFAULT_PIPELINE_VERSION_1.steps.map((s) => {
        if (s.stepKey === 'publish_gate') {
          return { ...s, params: { ...s.params, requireHumanReview: true } };
        }
        return s;
      }),
    };
    await prisma.discoveryConfig.upsert({
      where: { cityId: city.id },
      create: {
        cityId: city.id,
        version: 1,
        pipeline: cityPipeline,
        schedule: {
          cron: '0 3 * * 1',
          timezone: scheduleTimezone,
          isActive: false, // disabled until you validate the city
        },
        isActive: true,
        versions: {
          create: {
            version: 1,
            payload: cityPipeline,
            createdBy: 'seed',
          },
        },
      },
      update: {},
    });
  }
  console.log('✓ Cities + DiscoveryConfigs seeded');

  // ── Treatments ────────────────────────────────────────────────────────────
  const treatments = [
    { code: 'IVF', name: 'IVF — In Vitro Fertilisation', sortOrder: 1 },
    { code: 'ICSI', name: 'ICSI — Intracytoplasmic Sperm Injection', sortOrder: 2 },
    { code: 'PGT_A', name: 'PGT-A — Preimplantation Genetic Testing for Aneuploidies', sortOrder: 3 },
    { code: 'EGG_DONATION', name: 'Egg Donation', sortOrder: 4 },
    { code: 'SPERM_DONATION', name: 'Sperm Donation', sortOrder: 5 },
    { code: 'DOUBLE_DONATION', name: 'Double Donation (Egg + Sperm)', sortOrder: 6 },
    { code: 'FET', name: 'FET — Frozen Embryo Transfer', sortOrder: 7 },
    { code: 'IUI', name: 'IUI — Intrauterine Insemination', sortOrder: 8 },
    { code: 'EMBRYO_FREEZING', name: 'Embryo Freezing & Vitrification', sortOrder: 9 },
    { code: 'EGG_FREEZING', name: 'Egg Freezing (Social/Medical)', sortOrder: 10 },
    { code: 'SURROGACY', name: 'Surrogacy', sortOrder: 11 },
    { code: 'MINI_IVF', name: 'Mini / Mild IVF', sortOrder: 12 },
    { code: 'HAIR_RESTORATION', name: 'Hair Restoration', sortOrder: 20 },
    { code: 'DENTAL', name: 'Dental', sortOrder: 21 },
  ];
  for (const t of treatments) {
    await prisma.treatment.upsert({
      where: { code: t.code },
      create: t,
      update: {},
    });
  }
  console.log('✓ Treatments seeded');

  // ── Accreditations ────────────────────────────────────────────────────────
  const accreditations = [
    { code: 'ESHRE', name: 'ESHRE Member', regulator: 'European Society of Human Reproduction and Embryology' },
    { code: 'JCI', name: 'JCI Accreditation', regulator: 'Joint Commission International' },
    { code: 'ISO_9001', name: 'ISO 9001:2015', regulator: 'ISO' },
    { code: 'HFEA', name: 'HFEA Licensed', regulator: 'Human Fertilisation and Embryology Authority', countryCode: 'GB' },
    { code: 'SEF', name: 'SEF Member', regulator: 'Spanish Fertility Society', countryCode: 'ES' },
    { code: 'REDLARA', name: 'REDLARA Member', regulator: 'Latin American Registry of Assisted Reproduction' },
    { code: 'CAP', name: 'CAP Accredited Lab', regulator: 'College of American Pathologists' },
    { code: 'ALPHA_SCIENTISTS', name: 'Alpha Scientists in Reproductive Medicine', regulator: 'Alpha' },
  ];
  for (const a of accreditations) {
    await prisma.accreditation.upsert({
      where: { code: a.code },
      create: a,
      update: {},
    });
  }
  console.log('✓ Accreditations seeded');

  // ── Truth Score Dimensions (10 total, weights sum to 1.00) ────────────────
  const dimensions = [
    { code: 'HIDDEN_COSTS', name: 'Hidden Costs', description: 'Unexpected fees not disclosed upfront — ICSI, blast culture, freezing, anesthesia.', weight: 0.14, sortOrder: 1 },
    { code: 'PRICING_TRANSPARENCY', name: 'Pricing Transparency', description: 'Whether published prices match actual invoices.', weight: 0.12, sortOrder: 2 },
    { code: 'SUCCESS_RATE_HONESTY', name: 'Success Rate Honesty', description: 'Whether success rates are presented with denominators, age bands, and transfer types.', weight: 0.12, sortOrder: 3 },
    { code: 'COMMUNICATION', name: 'Communication', description: 'Responsiveness, clarity, and continuity of communication before/during/after treatment.', weight: 0.11, sortOrder: 4 },
    { code: 'LAB_TRANSPARENCY', name: 'Lab Transparency', description: 'Openness about embryology lab capabilities, equipment, and KPIs.', weight: 0.10, sortOrder: 5 },
    { code: 'BEDSIDE_MANNER', name: 'Bedside Manner', description: 'Empathy, patience, and patient-centred care from medical staff.', weight: 0.10, sortOrder: 6 },
    { code: 'INFORMED_CONSENT', name: 'Informed Consent', description: 'Whether risks, alternatives, and protocol choices were clearly explained.', weight: 0.10, sortOrder: 7 },
    { code: 'LOGISTICS', name: 'Logistics', description: 'Appointment scheduling, wait times, coordination with international patients.', weight: 0.09, sortOrder: 8 },
    { code: 'AFTERCARE', name: 'Aftercare', description: 'Post-transfer support, follow-up protocols, and emotional support.', weight: 0.07, sortOrder: 9 },
    { code: 'OUTCOME_REPORTING', name: 'Outcome Reporting', description: 'Whether clinical outcomes are reported transparently including failed cycles.', weight: 0.05, sortOrder: 10 },
  ];
  for (const d of dimensions) {
    await prisma.truthScoreDimension.upsert({
      where: { code: d.code },
      create: d,
      update: {},
    });
  }
  console.log('✓ TruthScoreDimensions seeded');

  // ── Interview Questions (~42 questions across 10 dimensions) ──────────────
  const questions = [
    // HIDDEN_COSTS
    { code: 'HC_01', dimensionCode: 'HIDDEN_COSTS', prompt: 'Were there any fees in the final invoice that were not mentioned during your initial cost consultation?', type: 'YES_NO' as const, sortOrder: 1 },
    { code: 'HC_02', dimensionCode: 'HIDDEN_COSTS', prompt: 'Which of the following add-ons were charged separately without being in the original quote? (select all that apply)', type: 'CHOICE' as const, options: { choices: ['ICSI', 'Blast culture (day 5/6)', 'Embryo freezing / vitrification', 'Anesthesia', 'Monitoring scans', 'Medication', 'PGT-A biopsy', 'Sperm analysis / TESA', 'None — all was included'] }, sortOrder: 2 },
    { code: 'HC_03', dimensionCode: 'HIDDEN_COSTS', prompt: 'How much higher was the final bill compared to the initial quote? (in percent, e.g. 20 = 20% higher, 0 = same)', type: 'NUMBER' as const, sortOrder: 3 },
    { code: 'HC_04', dimensionCode: 'HIDDEN_COSTS', prompt: 'Did the clinic proactively inform you about potential add-on costs before you signed the contract?', type: 'YES_NO' as const, sortOrder: 4 },

    // PRICING_TRANSPARENCY
    { code: 'PT_01', dimensionCode: 'PRICING_TRANSPARENCY', prompt: 'How clearly were the prices presented during your first consultation? (1 = very unclear, 5 = fully transparent)', type: 'LIKERT' as const, sortOrder: 1 },
    { code: 'PT_02', dimensionCode: 'PRICING_TRANSPARENCY', prompt: 'Was a written itemised price breakdown provided before you committed to treatment?', type: 'YES_NO' as const, sortOrder: 2 },
    { code: 'PT_03', dimensionCode: 'PRICING_TRANSPARENCY', prompt: 'Did the prices on the clinic website or brochure match what you were actually charged?', type: 'LIKERT' as const, sortOrder: 3 },

    // SUCCESS_RATE_HONESTY
    { code: 'SR_01', dimensionCode: 'SUCCESS_RATE_HONESTY', prompt: 'Did the clinic share their success rates with you?', type: 'YES_NO' as const, sortOrder: 1 },
    { code: 'SR_02', dimensionCode: 'SUCCESS_RATE_HONESTY', prompt: 'Were the success rates broken down by age group and/or treatment type?', type: 'YES_NO' as const, sortOrder: 2 },
    { code: 'SR_03', dimensionCode: 'SUCCESS_RATE_HONESTY', prompt: 'Did the clinic explain what the statistic represents — e.g. clinical pregnancy rate vs. live birth rate?', type: 'YES_NO' as const, sortOrder: 3 },
    { code: 'SR_04', dimensionCode: 'SUCCESS_RATE_HONESTY', prompt: 'How honestly do you feel the clinic presented realistic expectations for your specific situation? (1 = very unrealistic, 5 = very honest)', type: 'LIKERT' as const, sortOrder: 4 },

    // COMMUNICATION
    { code: 'CM_01', dimensionCode: 'COMMUNICATION', prompt: 'How responsive was the clinic to your questions and messages before starting treatment? (1 = very slow, 5 = very responsive)', type: 'LIKERT' as const, sortOrder: 1 },
    { code: 'CM_02', dimensionCode: 'COMMUNICATION', prompt: 'Did you have a dedicated coordinator or point of contact throughout your journey?', type: 'YES_NO' as const, sortOrder: 2 },
    { code: 'CM_03', dimensionCode: 'COMMUNICATION', prompt: 'Were you kept informed at each stage — stimulation, retrieval, fertilisation, transfer?', type: 'LIKERT' as const, sortOrder: 3 },
    { code: 'CM_04', dimensionCode: 'COMMUNICATION', prompt: 'How was communication handled in your language? (1 = major barriers, 5 = no language issues)', type: 'LIKERT' as const, sortOrder: 4 },
    { code: 'CM_05', dimensionCode: 'COMMUNICATION', prompt: 'What was the typical response time to emails or messages? (hours)', type: 'NUMBER' as const, sortOrder: 5 },

    // LAB_TRANSPARENCY
    { code: 'LT_01', dimensionCode: 'LAB_TRANSPARENCY', prompt: 'Did the clinic share any information about their embryology lab — equipment, techniques (e.g. time-lapse), or outcomes?', type: 'YES_NO' as const, sortOrder: 1 },
    { code: 'LT_02', dimensionCode: 'LAB_TRANSPARENCY', prompt: 'Were you informed about your fertilisation rate and embryo development progress?', type: 'YES_NO' as const, sortOrder: 2 },
    { code: 'LT_03', dimensionCode: 'LAB_TRANSPARENCY', prompt: 'How transparent was the clinic about their embryology protocols? (1 = not at all, 5 = very transparent)', type: 'LIKERT' as const, sortOrder: 3 },

    // BEDSIDE_MANNER
    { code: 'BM_01', dimensionCode: 'BEDSIDE_MANNER', prompt: 'How would you rate the empathy and emotional support shown by the medical team? (1 = cold/clinical, 5 = very supportive)', type: 'LIKERT' as const, sortOrder: 1 },
    { code: 'BM_02', dimensionCode: 'BEDSIDE_MANNER', prompt: 'Did you feel your concerns and questions were taken seriously?', type: 'LIKERT' as const, sortOrder: 2 },
    { code: 'BM_03', dimensionCode: 'BEDSIDE_MANNER', prompt: 'Did the clinical staff (nurses, doctors) make you feel comfortable and respected?', type: 'LIKERT' as const, sortOrder: 3 },

    // INFORMED_CONSENT
    { code: 'IC_01', dimensionCode: 'INFORMED_CONSENT', prompt: 'Were the risks and possible complications of your treatment explained clearly before you consented?', type: 'YES_NO' as const, sortOrder: 1 },
    { code: 'IC_02', dimensionCode: 'INFORMED_CONSENT', prompt: 'Were you offered alternatives or different protocol options, or was only one approach suggested?', type: 'LIKERT' as const, options: { scale: 'ALTERNATIVES_OFFERED', low: 'no alternatives', high: 'multiple options presented' }, sortOrder: 2 },
    { code: 'IC_03', dimensionCode: 'INFORMED_CONSENT', prompt: 'Did the clinic explain what would happen to any remaining frozen embryos and the associated annual storage costs?', type: 'YES_NO' as const, sortOrder: 3 },

    // LOGISTICS
    { code: 'LG_01', dimensionCode: 'LOGISTICS', prompt: 'How easy was the appointment scheduling and coordination? (1 = very difficult, 5 = very smooth)', type: 'LIKERT' as const, sortOrder: 1 },
    { code: 'LG_02', dimensionCode: 'LOGISTICS', prompt: 'Approximately how many visits to the clinic did your cycle require in total?', type: 'NUMBER' as const, sortOrder: 2 },
    { code: 'LG_03', dimensionCode: 'LOGISTICS', prompt: 'Did the clinic help coordinate or recommend accommodation, travel, or local logistics for international patients?', type: 'YES_NO' as const, sortOrder: 3 },
    { code: 'LG_04', dimensionCode: 'LOGISTICS', prompt: 'How long did you typically wait for appointments once at the clinic? (minutes)', type: 'NUMBER' as const, sortOrder: 4 },
    { code: 'LG_05', dimensionCode: 'LOGISTICS', prompt: 'Were administrative processes (contracts, payments, medical records) handled smoothly?', type: 'LIKERT' as const, sortOrder: 5 },

    // AFTERCARE
    { code: 'AC_01', dimensionCode: 'AFTERCARE', prompt: 'Was a clear post-transfer protocol provided — medications, restrictions, and what to do if symptoms arose?', type: 'YES_NO' as const, sortOrder: 1 },
    { code: 'AC_02', dimensionCode: 'AFTERCARE', prompt: 'Did the clinic follow up with you after the transfer, even before the pregnancy test date?', type: 'YES_NO' as const, sortOrder: 2 },
    { code: 'AC_03', dimensionCode: 'AFTERCARE', prompt: 'If the cycle was unsuccessful, how would you rate the emotional support and guidance about next steps? (1 = no support, 5 = excellent support)', type: 'LIKERT' as const, sortOrder: 3 },
    { code: 'AC_04', dimensionCode: 'AFTERCARE', prompt: 'Were you given a clear plan for a potential future cycle if this one did not succeed?', type: 'YES_NO' as const, sortOrder: 4 },

    // OUTCOME_REPORTING
    { code: 'OR_01', dimensionCode: 'OUTCOME_REPORTING', prompt: 'Did the clinic proactively share your full medical record and embryology report at the end of your cycle?', type: 'YES_NO' as const, sortOrder: 1 },
    { code: 'OR_02', dimensionCode: 'OUTCOME_REPORTING', prompt: 'If the cycle resulted in a negative outcome, did the clinic conduct or offer a debrief / root cause discussion?', type: 'YES_NO' as const, sortOrder: 2 },
    { code: 'OR_03', dimensionCode: 'OUTCOME_REPORTING', prompt: 'How transparent was the clinic about outcomes across all their patients, not just successes? (1 = not transparent, 5 = fully transparent)', type: 'LIKERT' as const, sortOrder: 3 },

    // Overall (not dimension-specific, used for quotes and overall NPS)
    { code: 'OV_01', dimensionCode: 'HIDDEN_COSTS', prompt: 'Knowing what you know now, would you recommend this clinic to another patient considering IVF abroad?', type: 'LIKERT' as const, sortOrder: 99 },
    { code: 'OV_02', dimensionCode: 'COMMUNICATION', prompt: 'What is the one thing this clinic does better than you expected?', type: 'TEXT' as const, sortOrder: 100 },
    { code: 'OV_03', dimensionCode: 'HIDDEN_COSTS', prompt: 'What is the one thing this clinic should improve most for international patients?', type: 'TEXT' as const, sortOrder: 101 },
    { code: 'OV_04', dimensionCode: 'PRICING_TRANSPARENCY', prompt: 'If you had to give a final total cost estimate for your complete treatment including all extras, what was it? (EUR)', type: 'NUMBER' as const, sortOrder: 102 },
  ];

  for (const q of questions) {
    const { options, ...rest } = q;
    await prisma.interviewQuestion.upsert({
      where: { code: q.code },
      create: { ...rest, options: options ?? undefined },
      update: {},
    });
  }
  console.log(`✓ ${questions.length} InterviewQuestions seeded`);

  console.log('\nClinic inventory seed complete!');
}
