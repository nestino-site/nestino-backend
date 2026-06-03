#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${1:-}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-medcover.com}"
SITE_NAME="${SITE_NAME:-MedCover}"
NEXTJS_REVALIDATION_URL="${NEXTJS_REVALIDATION_URL:-}"
PUBLISH_WEBHOOK_SECRET="${PUBLISH_WEBHOOK_SECRET:-}"
AI_BUDGET_LIMIT="${AI_BUDGET_LIMIT:-500}"
QUALITY_THRESHOLD="${QUALITY_THRESHOLD:-75}"
UPSERT_EXISTING="${UPSERT_EXISTING:-true}"
SKIP_SITE_CONFIG_ON_ERROR="${SKIP_SITE_CONFIG_ON_ERROR:-false}"
SKIP_KEY_ROTATION="${SKIP_KEY_ROTATION:-false}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: BASE_URL=https://your-traffic-engine.railway.app ADMIN_PASSWORD=... $0" >&2
  echo "Optional: ADMIN_EMAIL, NEXTJS_REVALIDATION_URL, PUBLISH_WEBHOOK_SECRET, AI_BUDGET_LIMIT, QUALITY_THRESHOLD" >&2
  exit 1
fi

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  echo "ADMIN_PASSWORD is required for /api/v1/identity/login." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ACCESS_TOKEN=""

log() {
  printf '[medcover-seed] %s\n' "$*" >&2
}

request() {
  local method="$1"
  local path="$2"
  local payload_file="${3:-}"
  local response_file="${TMP_DIR}/response.json"
  local status
  local curl_args=(-sS --http1.1 -o "${response_file}" -w "%{http_code}" -X "${method}" "${BASE_URL}${path}" -H "Accept: application/json")
  : > "${response_file}"

  if [[ -n "${ACCESS_TOKEN}" ]]; then
    curl_args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  fi

  if [[ -n "${payload_file}" ]]; then
    curl_args+=(-H "Content-Type: application/json" --data-binary "@${payload_file}")
  fi

  if ! status="$(curl "${curl_args[@]}")"; then
    status="000"
  fi
  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "Request failed: ${method} ${path} (${status})" >&2
    if [[ -s "${response_file}" ]]; then
      sed 's/^/  /' "${response_file}" >&2
    fi
    return 1
  fi

  jq -c . "${response_file}"
}

write_json() {
  local name="$1"
  local file="${TMP_DIR}/${name}.json"
  shift
  jq -n "$@" > "${file}"
  printf '%s\n' "${file}"
}

login() {
  local payload
  payload="$(write_json login \
    --arg email "${ADMIN_EMAIL}" \
    --arg password "${ADMIN_PASSWORD}" \
    '{email: $email, password: $password}')"

  ACCESS_TOKEN="$(request POST /api/v1/identity/login "${payload}" | jq -r '.accessToken')"
  if [[ -z "${ACCESS_TOKEN}" || "${ACCESS_TOKEN}" == "null" ]]; then
    echo "Login succeeded but no accessToken was returned." >&2
    exit 1
  fi
}

api_get() {
  request GET "$1"
}

api_post() {
  request POST "$1" "$2"
}

api_patch() {
  request PATCH "$1" "$2"
}

create_or_update_site() {
  local site_payload existing_site_id response
  site_payload="$(write_json site \
    --arg name "${SITE_NAME}" \
    --arg domain "${SITE_DOMAIN}" \
    --arg timezone "UTC" \
    --arg webhookUrl "${NEXTJS_REVALIDATION_URL}" \
    --arg webhookSecret "${PUBLISH_WEBHOOK_SECRET}" \
    '{
      name: $name,
      domain: $domain,
      defaultLanguage: "EN",
      languages: ["EN"],
      timezone: $timezone,
      status: "ACTIVE",
      autoPublish: true
    }
    + (if $webhookUrl != "" then {publishWebhookUrl: $webhookUrl} else {} end)
    + (if $webhookSecret != "" then {publishWebhookSecret: $webhookSecret} else {} end)')"

  existing_site_id="$(api_get /api/v1/sites | jq -r --arg domain "${SITE_DOMAIN}" 'first(.[] | select(.domain == $domain) | .id) // empty')"

  if [[ -n "${existing_site_id}" && "${UPSERT_EXISTING}" == "true" ]]; then
    log "Updating existing site ${SITE_DOMAIN} (id=${existing_site_id})"
    if ! response="$(api_patch "/api/v1/sites/${existing_site_id}" "${site_payload}")"; then
      log "WARNING: Existing site update failed; continuing with existing site id=${existing_site_id}"
      printf '%s\n' "${existing_site_id}"
      return 0
    fi
  else
    log "Creating site ${SITE_DOMAIN}"
    response="$(api_post /api/v1/sites "${site_payload}")"
  fi

  printf '%s\n' "${response}" | jq -r '.site.id // .id'
}

upsert_site_config() {
  local site_id="$1"
  local payload
  payload="$(write_json site-config \
    --argjson siteId "${site_id}" \
    --argjson aiBudgetLimit "${AI_BUDGET_LIMIT}" \
    --argjson qualityThreshold "${QUALITY_THRESHOLD}" \
    '{
      siteId: $siteId,
      aiBudgetLimit: $aiBudgetLimit,
      qualityThreshold: $qualityThreshold,
      pipelineConfig: {
        steps: ["generate", "analyze", "rewrite", "seo_check"],
        options: {
          strictMode: true,
          skipAnalysis: false,
          skipRewrite: false
        }
      },
      modelConfig: {
        generate: "gpt-4o",
        analyze: "gpt-4o",
        rewrite: "gpt-4o-mini",
        image_generation: "imagen-4.0-generate-001",
        seo_check: "gpt-4o-mini",
        rules: {
          highPriority: "gpt-4o",
          lowPriority: "gpt-4o-mini",
          fallback: "gpt-4o-mini"
        }
      },
      promptConfig: {
        generateVersion: "medcover_generate_v1",
        analyzeVersion: "medcover_analyze_v1",
        rewriteVersion: "medcover_rewrite_v1",
        imageGenerationVersion: "medcover_image_v1",
        seoCheckVersion: "medcover_seo_check_v1",
        tone: "seo",
        localeSupport: false,
        abTestingEnabled: false,
        humanization: {
          enabled: true,
          level: "high"
        }
      },
      runtimeConfig: {
        enableAnalysis: true,
        enableRewrite: true,
        enableImageGeneration: true,
        enableSeoCheck: true,
        maxRetries: 3
      }
    }')"

  log "Creating/updating SiteConfig"
  if ! api_post /api/v1/site-configs "${payload}" >/dev/null; then
    if [[ "${SKIP_SITE_CONFIG_ON_ERROR}" == "true" ]]; then
      log "WARNING: SiteConfig upsert failed; continuing because SKIP_SITE_CONFIG_ON_ERROR=true"
      return 0
    fi
    return 1
  fi
}

patch_ai_pipeline() {
  local site_id="$1"
  local payload
  payload="$(write_json ai-pipeline \
    '{
      version: 1,
      steps: [
        {
          stepKey: "outline",
          provider: "openai",
          model: "gpt-4o",
          promptTemplateId: "medcover_outline_v1",
          temperature: 0.3,
          maxOutputTokens: 3000,
          timeoutMs: 60000
        },
        {
          stepKey: "draft",
          provider: "openai",
          model: "gpt-4o",
          promptTemplateId: "medcover_draft_v1",
          temperature: 0.5,
          maxOutputTokens: 8000,
          timeoutMs: 120000
        },
        {
          stepKey: "analyze",
          provider: "openai",
          model: "gpt-4o",
          promptTemplateId: "medcover_analyze_v1",
          temperature: 0.1,
          maxOutputTokens: 3000,
          timeoutMs: 60000
        },
        {
          stepKey: "optimize",
          provider: "openai",
          model: "gpt-4o",
          promptTemplateId: "medcover_optimize_v1",
          temperature: 0.2,
          maxOutputTokens: 6000,
          timeoutMs: 90000
        }
      ]
    }')"

  log "Patching AI pipeline"
  api_patch "/api/v1/sites/${site_id}/ai-pipeline" "${payload}" >/dev/null
}

template_payload() {
  local letter="$1"
  local name="$2"
  local content_type="$3"
  local url_pattern="$4"
  local intent="$5"
  local priority="$6"
  local words="$7"
  local h1="$8"
  local cta="$9"
  shift 9
  local sections_json="$1"
  local h2s_json="$2"
  local schema_json="$3"
  local links_json="$4"
  local faq_json="$5"
  local extra_rules_json="$6"
  local output="${TMP_DIR}/template-${letter}.json"

  jq -n \
    --arg name "${letter} - ${name}" \
    --arg description "MedCover ${name} content template for ${url_pattern}" \
    --arg contentType "${content_type}" \
    --arg letter "${letter}" \
    --arg urlPattern "${url_pattern}" \
    --arg intent "${intent}" \
    --argjson priority "${priority}" \
    --argjson words "${words}" \
    --arg h1 "${h1}" \
    --arg cta "${cta}" \
    --argjson sections "${sections_json}" \
    --argjson h2s "${h2s_json}" \
    --argjson schema "${schema_json}" \
    --argjson links "${links_json}" \
    --argjson faq "${faq_json}" \
    --argjson extraRules "${extra_rules_json}" \
    '{
      name: $name,
      description: $description,
      contentType: $contentType,
      requiredSections: {
        templateLetter: $letter,
        urlPattern: $urlPattern,
        approximateWords: $words,
        sections: $sections
      },
      headingStructure: {
        h1: $h1,
        h2s: $h2s,
        h3Rules: [
          "Use exact patient-question phrasing for FAQ headings",
          "Use score/entity headings for clinic and truth-score cards",
          "Keep medical headings specific, neutral, and non-promotional"
        ]
      },
      seoRules: {
        keywordIntent: $intent,
        priority: $priority,
        canonical: $urlPattern,
        robots: "index, follow",
        sitemap: {
          priority: $priority,
          changefreq: "monthly"
        },
        globalRules: {
          aeoHeroAnswer: "First 60 words after H1 must directly answer the primary query.",
          titleLength: "50-60 characters; brand suffix | MedCover last.",
          metaDescription: "130-155 characters with primary keyword, data point, and click reason.",
          ymylCompliance: "Cost, medical, and legal claims require sources; treatment pages require medical reviewer.",
          attribution: "Visible author or data source required on every page.",
          patientQuoteFormat: "\"Patient interview, [Month Year], via MedCover\".",
          schemaMinimum: "BreadcrumbList plus page-type schema; no empty schema objects.",
          canonical: "Self-referencing canonical required.",
          internalLinkDensity: "Minimum 1 contextual internal link per 200 words.",
          imageAltText: "IVF [subject] in [city], [country] - MedCover.",
          ogImage: "1200x630; default fallback /og/medcover-default.png.",
          twitterCard: "summary_large_image",
          lastReviewed: "Schema lastReviewed must match Page.updatedAt.",
          hreflang: "en unless multilingual or origin journey requires country-specific hreflang."
        },
        schema: $schema,
        templateRules: $extraRules
      },
      faqStructure: $faq,
      ctaPlacement: $cta,
      internalLinkingRules: {
        requiredLinks: $links,
        density: "At least one contextual internal link per 200 words.",
        orphanPrevention: "Every generated page must link back to a hub, parent, or related content."
      },
      formattingInstructions: "Use answer-first MedCover tone. Avoid unsupported superlatives such as best, top, or ultimate unless backed by transparent Truth Score methodology. Cite all YMYL claims. Include tables for costs, comparisons, and score summaries where relevant.",
      isActive: true
    }' > "${output}"

  printf '%s\n' "${output}"
}

get_template_id_by_name() {
  local name="$1"
  api_get /api/v1/templates | jq -r --arg name "${name}" 'first(.[] | select(.name == $name) | .id) // empty'
}

upsert_template() {
  local letter="$1"
  local payload_file="$2"
  local name template_id response
  name="$(jq -r '.name' "${payload_file}")"
  template_id="$(get_template_id_by_name "${name}")"

  if [[ -n "${template_id}" && "${UPSERT_EXISTING}" == "true" ]]; then
    log "Updating template ${name} (id=${template_id})"
    response="$(api_patch "/api/v1/templates/${template_id}" "${payload_file}")"
  else
    log "Creating template ${name}"
    response="$(api_post /api/v1/templates "${payload_file}")"
  fi

  printf '%s\n' "${response}" | jq -r '.id'
}

create_templates() {
  TEMPLATE_A_ID="$(upsert_template A "$(template_payload \
    A "Country Destination Guide" LANDING_PAGE "/guides/[country]-ivf-guide/" COMMERCIAL 0.9 1500 \
    "IVF in [Country]: What [N] Real Patients Told Us" \
    "End of page: Get Your Personalized [Country] IVF Report -> /start/" \
    '["Breadcrumb","H1 + 60-word hero answer","Truth Score summary card","Key statistics table","AI interview insights block","Marketing vs reality table","Top clinics in country by Truth Score","Full cost breakdown","Legal and ethical context","Country vs US/UK comparison","FAQ accordion","Speakable summary","Related pages","CTA block"]' \
    '["MedCover Truth Score for [Country]: What the Data Shows","IVF Cost in [Country]: What Patients Actually Paid","What Patients Say About IVF in [Country]","Marketing vs Reality: What [Country] Clinics Do Not Tell You","Top IVF Clinics in [Country] by Truth Score","Legal Rules for Egg Donation in [Country]","[Country] vs US/UK IVF: Cost and Success Rate Comparison","Frequently Asked Questions About IVF in [Country]"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList","SpeakableSpecification","AggregateRating"]' \
    '["/costs/[country]-ivf-cost-[year]/","/compare/[country]-vs-usa-ivf/","top 5 clinic profiles","/treatments/ivf/","/treatments/egg-donation/","/faq/"]' \
    '{"questionCount":"10-14","rules":["Answers begin with direct one-sentence response","Use patient-sourced questions","Include internal links and cited data"]}' \
    '{"noindexGate":false,"openingParagraph":"IVF in [Country] costs between €[low]-€[high] per cycle based on [N] patient interviews conducted by MedCover.","avoid":["Best","Top","Ultimate"],"dataRequired":["interviewCount","costRange","waitTime","hiddenCostFrequency","nationalTruthScore"]}')")"

  TEMPLATE_A2_ID="$(upsert_template A2 "$(template_payload \
    A2 "City Destination Guide" CITY_PAGE "/guides/[country]/[city]-ivf-guide/" COMMERCIAL 0.85 1500 \
    "IVF in [City]: [N] Clinics, Real Costs & Patient Insights" \
    "End of page: View all [City] clinics and Share your [City] IVF experience" \
    '["Breadcrumb","H1 + city hero answer","City quick stats card","Why this city","All clinics in city","City-specific cost breakdown","Travel and logistics","City vs other city mini-comparison","FAQ","Related pages","CTA"]' \
    '["IVF in [City]: What the Data Shows","IVF Cost in [City] vs [Country] Average","Clinics Tracked in [City]","Travel Logistics for IVF in [City]","[City] vs [Other City] IVF","Frequently Asked Questions About IVF in [City]"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList","SpeakableSpecification"]' \
    '["/guides/[country]-ivf-guide/","/clinics/[country]/[city]/","/costs/[city]-ivf-cost-[year]/","/compare/[city]-vs-[other-city]-ivf/","3+ clinic profiles","/faq/"]' \
    '{"questionCount":"8-10","rules":["City-specific questions only","Start with concise answer","Mention public-data fallback when interview data is missing"]}' \
    '{"contentBeforeInterviewData":["Use ESHRE/SEF country benchmarks","Use publicly listed clinic pricing disclosed as unverified","Show data collection in progress"],"dataRequired":["clinicsTracked","cityCostRange","airport","neighborhoods","waitTime"]}')")"

  TEMPLATE_B_ID="$(upsert_template B "$(template_payload \
    B "Clinic Profile Page" LANDING_PAGE "/clinics/[country]/[city]/[clinic-slug]/" COMMERCIAL 0.7 1500 \
    "[Clinic Name] - MedCover Truth Report" \
    "Bottom section: Connect with this clinic or request verified lead" \
    '["Breadcrumb","H1 + clinic identity","Truth Score badge","Clinic fast facts table","10-dimension verified stats","Truth vs marketing block","Patient interview excerpts","Hidden costs revealed","Procedure pricing table","Staff and lab quality","Compare with similar clinics","Clinic-specific FAQ","Clinic response slot","Methodology note","Patient lead CTA"]' \
    '["[Clinic Name] Truth Score","Clinic Fast Facts","What Patients Report About [Clinic Name]","Hidden Costs at [Clinic Name]","[Clinic Name] Pricing","How [Clinic Name] Compares","Frequently Asked Questions About [Clinic Name]"]' \
    '["MedicalClinic","AggregateRating","Review","FAQPage","BreadcrumbList"]' \
    '["parent country guide","parent city guide","/reports/[clinic-slug]-patient-truth-report/","2 competitor clinic profiles","/truth-score/","/for-clinics/"]' \
    '{"questionCount":"6-10","rules":["Clinic-specific questions only","Include worth-it and real-success-rate questions","Use no unsupported medical claims"]}' \
    '{"noindexGate":"Force noindex until 5 interviews collected","dataRequired":["clinicIdentity","truthScore","interviewCount","pricingPackages","dimensionScores","patientQuotes"],"quoteAttribution":"Patient interview, [Month Year], via MedCover"}')")"

  TEMPLATE_C_ID="$(upsert_template C "$(template_payload \
    C "Country vs Country Comparison" COMPARISON "/compare/[country-a]-vs-[country-b]-ivf/" COMMERCIAL 0.8 1500 \
    "Is [Country A] or [Country B] Better for IVF?" \
    "End of page: Get a Personalized Comparison Report -> /start/" \
    '["Breadcrumb","H1 as question + direct verdict","Quick verdict card","Full comparison table","Cost breakdown for both countries","Patient quotes from each country","Success rate comparison","Legal differences","Decision tree","FAQ","Related comparisons","CTA"]' \
    '["Quick Verdict: [Country A] vs [Country B]","Full IVF Comparison Table","Cost Breakdown","Patient Quotes","Success Rates by Age","Legal Differences","Which Country Is Right for You?","Frequently Asked Questions"]' \
    '["Article","FAQPage","BreadcrumbList","SpeakableSpecification"]' \
    '["country guide A","country guide B","cost page A","cost page B","/from/usa/ivf-abroad/","3 related comparisons"]' \
    '{"questionCount":"8-12","rules":["Answer both countries explicitly","Use side-by-side framing","Include cited rows for data-heavy answers"]}' \
    '{"canonicalRule":"Alphabetical or priority canonical URL wins; reverse-order URL should 301 redirect.","dataRequired":["costRangeA","costRangeB","waitTimeA","waitTimeB","legalRulesA","legalRulesB","successRates"]}')")"

  TEMPLATE_D_ID="$(upsert_template D "$(template_payload \
    D "Cost Transparency Page" LANDING_PAGE "/costs/[country]-ivf-cost-[year]/" INFORMATIONAL 0.8 1800 \
    "IVF Cost in [Country] [Year]: What Patients Actually Paid" \
    "End of page: Get a Full Cost Breakdown for Your Situation -> /start/" \
    '["Breadcrumb","H1 + direct cost answer","Base cost table","Add-on costs table","Travel and logistics cost table","Total all-in calculator table","Hidden costs section","Origin vs destination comparison","What affects the price","FAQ","Related pages","CTA"]' \
    '["IVF Cost in [Country]: Direct Answer","Base IVF Costs","Medication and Add-On Costs","Travel and Logistics Costs","Total All-In Cost Scenarios","Hidden Costs Patients Reported","How [Country] Compares With US/UK/Canada","What Affects IVF Price?","Frequently Asked Cost Questions"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList","SpeakableSpecification"]' \
    '["/guides/[country]-ivf-guide/","top clinic profiles","country comparison pages","/from/usa/ivf-abroad/","/treatments/ivf/"]' \
    '{"questionCount":"8-10","rules":["Open with exact cost answer","Clarify what is not included","Cite each cost claim"]}' \
    '{"yearRedirectStrategy":"Old year URL should 301 to current year URL.","dataRequired":["baseProcedureCosts","medicationCosts","monitoringCosts","travelCosts","hiddenCosts","allInScenarios"]}')")"

  TEMPLATE_E_ID="$(upsert_template E "$(template_payload \
    E "Treatment Glossary Entity" ARTICLE "/treatments/[treatment]/" INFORMATIONAL 0.8 1800 \
    "What Is [Treatment]?" \
    "End of page: Compare [Treatment] Options Abroad -> country guides" \
    '["Breadcrumb","H1 + plain-language definition","HowTo process","Success rates by age","Why patients travel abroad","What MedCover patients report","Countries available","Glossary of terms","FAQ","Related treatments","External resources","CTA"]' \
    '["What Is [Treatment]?","How [Treatment] Works","Success Rates by Age","Why Patients Travel Abroad for [Treatment]","What MedCover Patients Report","Where [Treatment] Is Available","Glossary","Frequently Asked Questions","External Medical Resources"]' \
    '["MedicalWebPage","MedicalProcedure","HowTo","FAQPage","BreadcrumbList"]' \
    '["country guides","related treatment pages","/faq/","CDC/SART/ESHRE/WHO external resources"]' \
    '{"questionCount":"10-15","rules":["Cover medical and logistical questions","Use reviewer-backed medical language","Avoid personalized medical advice"]}' \
    '{"requiresMedicalReviewer":true,"reviewerCredit":"Medically reviewed by: [Name], [Credentials]; Last reviewed: [Date]","dataRequired":["procedureSteps","ageSuccessRates","authoritySources","patientExcerpts"]}')")"

  TEMPLATE_F_ID="$(upsert_template F "$(template_payload \
    F "Origin Patient Journey" LANDING_PAGE "/from/[country]/ivf-abroad/" INFORMATIONAL 0.8 1800 \
    "IVF Abroad for [Origin] Patients: What You Need to Know" \
    "End of page: Find Your Best Destination -> country guides" \
    '["Breadcrumb","H1 + 60-word direct answer","Why origin patients travel","Top destinations for origin","Legal considerations","Logistics guide","Patient stories from origin","FAQ","CTA"]' \
    '["Why [Origin] Patients Travel for IVF","Best IVF Destinations for [Origin] Patients","Legal and Insurance Considerations","Travel Logistics","Patient Stories from [Origin]","Frequently Asked Questions"]' \
    '["Article","FAQPage","BreadcrumbList","SpeakableSpecification"]' \
    '["/guides/spain-ivf-guide/","/guides/greece-ivf-guide/","/guides/czech-republic-ivf-guide/","/costs/[country]-ivf-cost-[year]/","patient stories from same origin"]' \
    '{"questionCount":"10","rules":["Origin-country-specific only","Address insurance, travel, and legal issues","No legal advice beyond sourced general information"]}' \
    '{"hreflang":"Use country-specific hreflang where applicable.","dataRequired":["originCostComparison","destinationCards","visaRules","insuranceNotes","tripCount"]}')")"

  TEMPLATE_G_ID="$(upsert_template G "$(template_payload \
    G "Truth Report Auto-Generated" ARTICLE "/reports/[clinic-slug]-patient-truth-report/" NAVIGATIONAL 0.6 800 \
    "[Clinic Name] Patient Truth Report" \
    "End of report: Connect with [Clinic] or Request an Interview" \
    '["Report header","Truth Score with dimension breakdown","Methodology block","Key findings summary","10 dimension deep-dives","What patients loved","What patients flagged","Hidden costs revealed","MedCover recommendation","Clinic official response","Data freshness notice","CTA"]' \
    '["[Clinic Name] Truth Score","Methodology","Key Findings","Dimension Breakdown","What Patients Loved","What Patients Flagged","Hidden Costs","Data-Driven Recommendation","Clinic Response","Data Freshness"]' \
    '["CreativeWork","AggregateRating","Review","Organization","BreadcrumbList"]' \
    '["clinic profile","/ai-interviewer/","/truth-score/","related clinic reports","/for-clinics/"]' \
    '{"questionCount":"0-6 optional","rules":["Only include FAQ if supported by interview data","Use anonymized quotes only"]}' \
    '{"autoGenerationTrigger":"Initial generation at 5+ interviews; scheduled weekly if new interviews exist.","noindexGate":"Reports under 5 interviews are noindex.","dataRequired":["interviewCount","reportPeriod","dimensionScores","representativeQuotes","hiddenCosts","clinicResponse"]}')")"

  TEMPLATE_H_ID="$(upsert_template H "$(template_payload \
    H "Patient Story" BLOG_POST "/patient-stories/[slug]/" INFORMATIONAL 0.6 1800 \
    "[Treatment] in [Destination]: A Patient Story" \
    "End of story: Share Your Story -> /start/" \
    '["Breadcrumb","Story header","Anonymous patient bio","Full story","Key data sidebar","What surprised them","Would they do it again quote","Clinic referenced","Related stories","CTA"]' \
    '["Patient Profile","The Full Story","Key Data Points","What Surprised Them","Would They Do It Again?","Clinic Referenced","Related Patient Stories"]' \
    '["Article","Review","BreadcrumbList"]' \
    '["referenced clinic profile when consented","related treatment page","destination country guide","3 related stories","/start/"]' \
    '{"questionCount":"0","rules":["Narrative page; do not fabricate FAQ unless story contains explicit questions"]}' \
    '{"consentRequired":true,"withdrawalRule":"Stories from patients who withdraw consent must be fully removed.","dataRequired":["consent","ageRange","originCountry","destinationCountry","treatment","outcome","costPaid"]}')")"

  TEMPLATE_J_ID="$(upsert_template J "$(template_payload \
    J "FAQ Hub" FAQ "/faq/" INFORMATIONAL 0.9 1800 \
    "IVF Abroad FAQ: Real Answers From Patient Data" \
    "Page body CTAs: guide users to country guides, cost pages, and /start/" \
    '["Breadcrumb","H1 + AEO intro","IVF abroad basics cluster","Spain cluster","Greece cluster","Czech Republic cluster","Costs and hidden fees cluster","Clinic selection cluster","Egg donation law cluster","Travel and logistics cluster","Success rates and lab quality cluster","About MedCover cluster","Related links"]' \
    '["IVF Abroad Basics","Spain-Specific Questions","Greece-Specific Questions","Czech Republic-Specific Questions","Costs and Hidden Fees","Choosing a Clinic","Egg Donation Law by Country","Travel and Logistics","Success Rates and Lab Quality","About MedCover"]' \
    '["FAQPage","BreadcrumbList","SpeakableSpecification"]' \
    '["country guides","cost pages","comparison pages","treatment pages","/start/","/for-clinics/"]' \
    '{"categories":{"ivf-basics":12,"spain":8,"greece":8,"czech-republic":6,"costs":10,"clinic-selection":8,"egg-donation-law":8,"travel":8,"success-rates":8,"medcover":6},"rules":["Each answer starts with direct one-sentence response","60-120 words per answer","At least one internal link per answer","Top five answers marked speakable"]}' \
    '{"anchorIdsRequired":true,"aeoPriority":"highest","dataRequired":["questionClusters","internalLinks","speakableAnswers"]}')")"

  TEMPLATE_K_ID="$(upsert_template K "$(template_payload \
    K "For Clinics B2B Landing" LANDING_PAGE "/for-clinics/" COMMERCIAL 0.3 1200 \
    "Stand Out in a Sea of Fake Reviews" \
    "Final CTA: Claim Your Clinic Profile" \
    '["Hero","What MedCover Verified means","Fake review trust problem","How it works for clinics","Products","Pricing overview link","Social proof","Clinic-focused FAQ","Claim profile CTA"]' \
    '["What MedCover Verified Means","Why Fake Reviews Are Destroying Trust","How It Works","Products for Clinics","Pricing Overview","Clinic FAQ"]' \
    '["Service","FAQPage","Organization","BreadcrumbList"]' \
    '["/for-clinics/pricing/","/truth-score/","/reports/[clinic-slug]-patient-truth-report/","/faq/"]' \
    '{"questionCount":"6","rules":["Clinic-focused commercial answers","Explain verification clearly","Avoid promising positive reviews"]}' \
    '{"products":["Verified Badge","Lead Gen","Verification-as-a-Service","Truth Report Claim"],"dataRequired":["clinicValueProposition","claimProfileCTA","verificationWorkflow"]}')")"
}

subject_payload() {
  local site_id="$1"
  local template_id="$2"
  local title="$3"
  local description="$4"
  local primary_json="$5"
  local secondary_json="$6"
  local intent="$7"
  local country="$8"
  local city="$9"
  local seo_goal="${10}"
  local risk_category="${11}"
  local content_count="${12}"
  local output="${TMP_DIR}/subject-$(printf '%s' "${title}" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-').json"

  jq -n \
    --argjson siteId "${site_id}" \
    --argjson templateId "${template_id}" \
    --arg title "${title}" \
    --arg description "${description}" \
    --argjson primaryKeywords "${primary_json}" \
    --argjson secondaryKeywords "${secondary_json}" \
    --arg searchIntent "${intent}" \
    --arg country "${country}" \
    --arg city "${city}" \
    --arg seoGoal "${seo_goal}" \
    --arg riskCategory "${risk_category}" \
    --argjson contentCountTarget "${content_count}" \
    '{
      siteId: $siteId,
      templateId: $templateId,
      title: $title,
      description: $description,
      primaryKeywords: $primaryKeywords,
      secondaryKeywords: $secondaryKeywords,
      searchIntent: $searchIntent,
      language: "EN",
      seoGoal: $seoGoal,
      contentCountTarget: $contentCountTarget,
      hallucinationSensitivity: "HIGH",
      riskCategory: $riskCategory,
      requiresFactualValidation: true,
      strictReviewMode: true,
      status: "ACTIVE"
    }
    + (if $country != "" then {country: $country} else {} end)
    + (if $city != "" then {city: $city} else {} end)' > "${output}"

  printf '%s\n' "${output}"
}

get_subject_id_by_title() {
  local site_id="$1"
  local title="$2"
  api_get "/api/v1/subjects?siteId=${site_id}" | jq -r --arg title "${title}" 'first(.[] | select(.title == $title) | .id) // empty'
}

upsert_subject() {
  local site_id="$1"
  local payload_file="$2"
  local title subject_id response
  title="$(jq -r '.title' "${payload_file}")"
  subject_id="$(get_subject_id_by_title "${site_id}" "${title}")"

  if [[ -n "${subject_id}" && "${UPSERT_EXISTING}" == "true" ]]; then
    log "Updating subject ${title} (id=${subject_id})"
    response="$(api_patch "/api/v1/subjects/${subject_id}" "${payload_file}")"
  else
    log "Creating subject ${title}"
    response="$(api_post /api/v1/subjects "${payload_file}")"
  fi

  printf '%s\n' "${response}" | jq -r '.id'
}

create_subjects() {
  local site_id="$1"

  SUBJECT_SPAIN_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A_ID}" \
    "Spain Country Guide" \
    "Country hub for IVF in Spain with MedCover Truth Score, costs, clinics, legal context, and patient interview data. Top-rated egg donation destination." \
    '["ivf spain","ivf in spain cost"]' \
    '["ivf clinics spain","egg donation spain","ivf abroad spain","spain fertility treatment"]' \
    COMMERCIAL Spain "" "Rank for Spain IVF destination searches and become the parent hub for Spain pages." MEDICAL 12)")"

  SUBJECT_GREECE_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A_ID}" \
    "Greece Country Guide" \
    "Country hub for IVF in Greece with MedCover Truth Score, costs, clinics, legal context, and patient interview data. Mediterranean care destination." \
    '["ivf greece","ivf in greece cost"]' \
    '["ivf clinics greece","egg donation greece","ivf abroad greece","athens ivf"]' \
    COMMERCIAL Greece "" "Rank for Greece IVF destination searches and become the parent hub for Greece pages." MEDICAL 12)")"

  SUBJECT_CZECH_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A_ID}" \
    "Czech Republic Country Guide" \
    "Country hub for IVF in Czech Republic with MedCover Truth Score, costs, clinics, legal context, and patient interview data. Affordable and experienced destination." \
    '["ivf czech republic","ivf in czech republic cost"]' \
    '["ivf clinics prague","egg donation czech republic","ivf abroad czech republic","prague ivf"]' \
    COMMERCIAL "Czech Republic" "" "Rank for Czech Republic IVF destination searches and become the parent hub for Czech pages." MEDICAL 12)")"

  SUBJECT_TURKEY_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A_ID}" \
    "Turkey Country Guide" \
    "Country hub for IVF in Turkey with MedCover Truth Score, costs, clinics, legal context, and patient interview data. Growing success rates destination." \
    '["ivf turkey","ivf in turkey cost"]' \
    '["ivf clinics istanbul","egg donation turkey","ivf abroad turkey","istanbul ivf"]' \
    COMMERCIAL Turkey "" "Rank for Turkey IVF destination searches and become the parent hub for Turkey pages." MEDICAL 12)")"

  SUBJECT_PORTUGAL_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A_ID}" \
    "Portugal Country Guide" \
    "Country hub for IVF in Portugal with MedCover Truth Score, costs, clinics, legal context, and patient interview data. Atlantic coast option destination." \
    '["ivf portugal","ivf in portugal cost"]' \
    '["ivf clinics lisbon","egg donation portugal","ivf abroad portugal","lisbon ivf"]' \
    COMMERCIAL Portugal "" "Rank for Portugal IVF destination searches and become the parent hub for Portugal pages." MEDICAL 12)")"

  SUBJECT_NORTH_MACEDONIA_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A_ID}" \
    "North Macedonia Country Guide" \
    "Country hub for IVF in North Macedonia with MedCover Truth Score, costs, clinics, legal context, and patient interview data. Budget-friendly destination." \
    '["ivf north macedonia","ivf in north macedonia cost"]' \
    '["ivf clinics skopje","fertility clinic north macedonia","ivf abroad north macedonia","skopje ivf"]' \
    COMMERCIAL "North Macedonia" "" "Rank for North Macedonia IVF destination searches and become the parent hub for North Macedonia pages." MEDICAL 12)")"

  SUBJECT_BARCELONA_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Barcelona City Guide" \
    "City guide for IVF in Barcelona with tracked clinics, logistics, costs, and patient insights." \
    '["ivf barcelona","egg donation barcelona"]' \
    '["fertility clinic barcelona","ivf clinic barcelona","barcelona ivf cost","ivf spain barcelona"]' \
    COMMERCIAL Spain Barcelona "Capture city-level Barcelona IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_MADRID_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Madrid City Guide" \
    "City guide for IVF in Madrid with tracked clinics, logistics, costs, and patient insights." \
    '["ivf madrid","fertility clinic madrid"]' \
    '["egg donation madrid","ivf clinic madrid","madrid ivf cost","ivf spain madrid"]' \
    COMMERCIAL Spain Madrid "Capture city-level Madrid IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_VALENCIA_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Valencia City Guide" \
    "City guide for IVF in Valencia with tracked clinics, logistics, costs, and patient insights." \
    '["ivf valencia","fertility clinic valencia"]' \
    '["egg donation valencia","ivf clinic valencia","valencia ivf cost","ivf spain valencia"]' \
    COMMERCIAL Spain Valencia "Capture city-level Valencia IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_ATHENS_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Athens City Guide" \
    "City guide for IVF in Athens with tracked clinics, logistics, costs, and patient insights." \
    '["ivf athens","fertility clinic athens"]' \
    '["egg donation athens","ivf clinic athens","athens ivf cost","ivf greece athens"]' \
    COMMERCIAL Greece Athens "Capture city-level Athens IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_THESSALONIKI_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Thessaloniki City Guide" \
    "City guide for IVF in Thessaloniki with tracked clinics, logistics, costs, and patient insights." \
    '["ivf thessaloniki","fertility clinic thessaloniki"]' \
    '["ivf clinic thessaloniki","thessaloniki ivf cost","ivf greece thessaloniki"]' \
    COMMERCIAL Greece Thessaloniki "Capture city-level Thessaloniki IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_PRAGUE_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Prague City Guide" \
    "City guide for IVF in Prague with tracked clinics, logistics, costs, and patient insights." \
    '["ivf prague","fertility clinic prague"]' \
    '["egg donation prague","ivf clinic prague","prague ivf cost","ivf czech republic prague"]' \
    COMMERCIAL "Czech Republic" Prague "Capture city-level Prague IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_BRNO_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Brno City Guide" \
    "City guide for IVF in Brno with tracked clinics, logistics, costs, and patient insights." \
    '["ivf brno","fertility clinic brno"]' \
    '["ivf clinic brno","brno ivf cost","ivf czech republic brno"]' \
    COMMERCIAL "Czech Republic" Brno "Capture city-level Brno IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_ISTANBUL_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Istanbul City Guide" \
    "City guide for IVF in Istanbul with tracked clinics, logistics, costs, and patient insights." \
    '["ivf istanbul","fertility clinic istanbul"]' \
    '["egg donation istanbul","ivf clinic istanbul","istanbul ivf cost","ivf turkey istanbul"]' \
    COMMERCIAL Turkey Istanbul "Capture city-level Istanbul IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_ANKARA_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Ankara City Guide" \
    "City guide for IVF in Ankara with tracked clinics, logistics, costs, and patient insights." \
    '["ivf ankara","fertility clinic ankara"]' \
    '["ivf clinic ankara","ankara ivf cost","ivf turkey ankara"]' \
    COMMERCIAL Turkey Ankara "Capture city-level Ankara IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_LISBON_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Lisbon City Guide" \
    "City guide for IVF in Lisbon with tracked clinics, logistics, costs, and patient insights." \
    '["ivf lisbon","fertility clinic lisbon"]' \
    '["egg donation lisbon","ivf clinic lisbon","lisbon ivf cost","ivf portugal lisbon"]' \
    COMMERCIAL Portugal Lisbon "Capture city-level Lisbon IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_PORTO_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Porto City Guide" \
    "City guide for IVF in Porto with tracked clinics, logistics, costs, and patient insights." \
    '["ivf porto","fertility clinic porto"]' \
    '["ivf clinic porto","porto ivf cost","ivf portugal porto"]' \
    COMMERCIAL Portugal Porto "Capture city-level Porto IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_SKOPJE_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_A2_ID}" \
    "Skopje City Guide" \
    "City guide for IVF in Skopje with tracked clinics, logistics, costs, and patient insights." \
    '["ivf skopje","fertility clinic skopje"]' \
    '["ivf clinic skopje","skopje ivf cost","ivf north macedonia skopje"]' \
    COMMERCIAL "North Macedonia" Skopje "Capture city-level Skopje IVF intent and link to clinic profiles." MEDICAL 8)")"

  SUBJECT_COST_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_D_ID}" \
    "Spain IVF Cost 2026" \
    "Cost transparency page for Spain IVF costs, add-ons, travel, hidden fees, and all-in scenarios for 2026." \
    '["ivf spain cost 2026","how much does ivf cost spain"]' \
    '["egg donation spain cost","ivf medication cost spain","hidden costs ivf spain","spain fertility treatment price"]' \
    INFORMATIONAL Spain "" "Win cost and hidden-fee searches with sourced, transparent tables." MEDICAL 10)")"

  SUBJECT_COMPARE_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_C_ID}" \
    "Spain vs USA IVF Comparison" \
    "Comparison page for IVF in Spain versus the USA across cost, wait time, regulation, travel, and patient-reported experience." \
    '["ivf spain vs usa","is ivf cheaper in spain"]' \
    '["ivf abroad vs usa","spain fertility treatment vs america","ivf cost usa vs spain","best country for ivf abroad"]' \
    COMMERCIAL Spain "" "Capture comparison intent and drive users to Spain guide, cost page, and origin journey." MEDICAL 8)")"

  SUBJECT_IVF_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_E_ID}" \
    "IVF Treatment Entity" \
    "Medically reviewed entity page explaining IVF, the process, success rates, reasons for travel, and related MedCover pages." \
    '["what is ivf","ivf process steps"]' \
    '["ivf success rates by age","in vitro fertilization explained","ivf abroad","ivf treatment guide"]' \
    INFORMATIONAL "" "" "Build topical authority for IVF and support all destination pages." MEDICAL 10)")"

  SUBJECT_EGG_DONATION_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_E_ID}" \
    "Egg Donation Entity" \
    "Medically reviewed entity page explaining egg donation abroad, anonymity, legal context, process, and patient considerations." \
    '["egg donation abroad","anonymous egg donation spain"]' \
    '["egg donation ivf","egg donor spain","egg donation law spain","ivf with donor eggs abroad"]' \
    INFORMATIONAL Spain "" "Build authority around donor egg travel intent and support Spain legal content." MEDICAL 10)")"

  SUBJECT_USA_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_F_ID}" \
    "From USA Origin Journey" \
    "Origin journey page for US patients considering IVF abroad, especially Spain, including cost comparison, insurance gaps, logistics, and legal considerations." \
    '["ivf abroad for us patients","american ivf abroad"]' \
    '["ivf overseas from usa","ivf spain for americans","ivf cheaper abroad","fertility tourism from usa"]' \
    INFORMATIONAL USA "" "Capture US origin-patient intent and route users to destination guides." MEDICAL 10)")"

  SUBJECT_FAQ_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_J_ID}" \
    "FAQ Hub" \
    "Central MedCover FAQ hub for IVF abroad basics, Spain, costs, clinic selection, egg donation law, travel, success rates, and platform questions." \
    '["ivf abroad faq","ivf spain questions"]' \
    '["ivf abroad questions","fertility tourism faq","egg donation spain faq","ivf cost questions"]' \
    INFORMATIONAL "" "" "Become the AEO hub for repeated IVF abroad questions." GENERAL 12)")"

  SUBJECT_CLINICS_ID="$(upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_K_ID}" \
    "For Clinics B2B" \
    "B2B landing page for clinics explaining MedCover verification, verified badge, lead generation, VaaS, and truth report claiming." \
    '["verify clinic reviews","patient verification"]' \
    '["clinic verified badge","fertility clinic lead generation","medical review verification","claim clinic profile"]' \
    COMMERCIAL "" "" "Convert clinics into verification and lead-gen partners." GENERAL 4)")"
}

rotate_content_api_key() {
  local site_id="$1"
  log "Rotating content API key"
  api_post "/api/v1/sites/${site_id}/rotate-content-api-key" "" | jq -r '.contentApiKey // .apiKey // .key // empty'
}

main() {
  log "Logging in as ${ADMIN_EMAIL}"
  login

  SITE_ID="$(create_or_update_site)"
  log "Using SITE_ID=${SITE_ID}"

  upsert_site_config "${SITE_ID}"
  patch_ai_pipeline "${SITE_ID}"
  create_templates
  create_subjects "${SITE_ID}"
  if [[ "${SKIP_KEY_ROTATION}" == "true" ]]; then
    log "Skipping content API key rotation (SKIP_KEY_ROTATION=true)"
    CONTENT_API_KEY="(unchanged — rotation skipped)"
  else
    CONTENT_API_KEY="$(rotate_content_api_key "${SITE_ID}")"
  fi

  cat <<SUMMARY

MedCover production setup complete.

Site:
  SITE_ID=${SITE_ID}
  DOMAIN=${SITE_DOMAIN}

Templates:
  A=${TEMPLATE_A_ID}
  A2=${TEMPLATE_A2_ID}
  B=${TEMPLATE_B_ID}
  C=${TEMPLATE_C_ID}
  D=${TEMPLATE_D_ID}
  E=${TEMPLATE_E_ID}
  F=${TEMPLATE_F_ID}
  G=${TEMPLATE_G_ID}
  H=${TEMPLATE_H_ID}
  J=${TEMPLATE_J_ID}
  K=${TEMPLATE_K_ID}

Subjects:
  Spain Country Guide=${SUBJECT_SPAIN_ID}
  Greece Country Guide=${SUBJECT_GREECE_ID}
  Czech Republic Country Guide=${SUBJECT_CZECH_ID}
  Turkey Country Guide=${SUBJECT_TURKEY_ID}
  Portugal Country Guide=${SUBJECT_PORTUGAL_ID}
  North Macedonia Country Guide=${SUBJECT_NORTH_MACEDONIA_ID}
  Barcelona City Guide=${SUBJECT_BARCELONA_ID}
  Madrid City Guide=${SUBJECT_MADRID_ID}
  Valencia City Guide=${SUBJECT_VALENCIA_ID}
  Athens City Guide=${SUBJECT_ATHENS_ID}
  Thessaloniki City Guide=${SUBJECT_THESSALONIKI_ID}
  Prague City Guide=${SUBJECT_PRAGUE_ID}
  Brno City Guide=${SUBJECT_BRNO_ID}
  Istanbul City Guide=${SUBJECT_ISTANBUL_ID}
  Ankara City Guide=${SUBJECT_ANKARA_ID}
  Lisbon City Guide=${SUBJECT_LISBON_ID}
  Porto City Guide=${SUBJECT_PORTO_ID}
  Skopje City Guide=${SUBJECT_SKOPJE_ID}
  Spain IVF Cost 2026=${SUBJECT_COST_ID}
  Spain vs USA IVF Comparison=${SUBJECT_COMPARE_ID}
  IVF Treatment Entity=${SUBJECT_IVF_ID}
  Egg Donation Entity=${SUBJECT_EGG_DONATION_ID}
  From USA Origin Journey=${SUBJECT_USA_ID}
  FAQ Hub=${SUBJECT_FAQ_ID}
  For Clinics B2B=${SUBJECT_CLINICS_ID}

Railway variables to set next:
  traffic-engine-backend: CLINIC_SITE_ID=${SITE_ID}
  clinic-inventory: TRAFFIC_ENGINE_WEBHOOK_URL=${BASE_URL}/api/v1/clinic-inventory/webhook

Content API key for frontend:
  ${CONTENT_API_KEY:-"(API did not return a key field; inspect rotate-content-api-key response/logs)"}

SUMMARY
}

main "$@"
