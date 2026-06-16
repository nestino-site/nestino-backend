#!/usr/bin/env bash
# Seed MedCover ContentTemplates (HR-A through HR-F) and Subjects for hair restoration.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/seed-hair-restoration.sh

set -euo pipefail

BASE_URL="${BASE_URL:-${1:-}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-www.medcover.io}"
UPSERT_EXISTING="${UPSERT_EXISTING:-true}"

if [[ -z "${BASE_URL}" || -z "${ADMIN_PASSWORD}" ]]; then
  echo "Usage: BASE_URL=https://... ADMIN_PASSWORD=... $0" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "curl and jq are required." >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ACCESS_TOKEN=""

log() { printf '[hair-restoration-seed] %s\n' "$*" >&2; }

request() {
  local method="$1" path="$2" payload_file="${3:-}"
  local response_file="${TMP_DIR}/response.json" status
  local curl_args=(-sS --http1.1 -o "${response_file}" -w "%{http_code}" -X "${method}" "${BASE_URL}${path}" -H "Accept: application/json")
  : > "${response_file}"
  [[ -n "${ACCESS_TOKEN}" ]] && curl_args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  [[ -n "${payload_file}" ]] && curl_args+=(-H "Content-Type: application/json" --data-binary "@${payload_file}")
  status="$(curl "${curl_args[@]}" 2>/dev/null || echo 000)"
  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "Request failed: ${method} ${path} (${status})" >&2
    [[ -s "${response_file}" ]] && sed 's/^/  /' "${response_file}" >&2
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
  payload="$(write_json login --arg email "${ADMIN_EMAIL}" --arg password "${ADMIN_PASSWORD}" '{email:$email,password:$password}')"
  ACCESS_TOKEN="$(request POST /api/v1/identity/login "${payload}" | jq -r '.accessToken')"
  [[ -n "${ACCESS_TOKEN}" && "${ACCESS_TOKEN}" != "null" ]] || { echo "Login failed." >&2; exit 1; }
}

get_site_id() {
  request GET /api/v1/sites | jq -r --arg domain "${SITE_DOMAIN}" 'first(.[] | select(.domain == $domain) | .id) // empty'
}

get_template_id_by_name() {
  request GET /api/v1/templates | jq -r --arg name "$1" 'first(.[] | select(.name == $name) | .id) // empty'
}

upsert_template() {
  local payload_file="$1" name template_id response
  name="$(jq -r '.name' "${payload_file}")"
  template_id="$(get_template_id_by_name "${name}")"
  if [[ -n "${template_id}" && "${UPSERT_EXISTING}" == "true" ]]; then
    log "Updating template ${name} (id=${template_id})"
    response="$(request PATCH "/api/v1/templates/${template_id}" "${payload_file}")"
  else
    log "Creating template ${name}"
    response="$(request POST /api/v1/templates "${payload_file}")"
  fi
  printf '%s\n' "${response}" | jq -r '.id'
}

template_payload() {
  local letter="$1" name="$2" content_type="$3" url_pattern="$4" intent="$5"
  local priority="$6" words="$7" h1="$8" cta="$9"
  shift 9
  local sections_json="$1" h2s_json="$2" schema_json="$3" links_json="$4" faq_json="$5" extra_rules_json="$6"
  local output="${TMP_DIR}/template-${letter}.json"

  jq -n \
    --arg name "HR-${letter} - ${name}" \
    --arg description "MedCover hair restoration ${name} for ${url_pattern}" \
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
      requiredSections: { templateLetter: $letter, urlPattern: $urlPattern, approximateWords: $words, sections: $sections },
      headingStructure: { h1: $h1, h2s: $h2s },
      seoRules: {
        keywordIntent: $intent,
        priority: $priority,
        canonical: $urlPattern,
        robots: "index, follow",
        sitemap: { priority: $priority, changefreq: "monthly" },
        globalRules: {
          imageAltText: "Hair transplant [subject] in [city], [country] - MedCover.",
          ymylCompliance: "Surgical claims require sources; treatment page requires medical reviewer."
        },
        schema: $schema,
        templateRules: $extraRules
      },
      faqStructure: $faq,
      ctaPlacement: $cta,
      internalLinkingRules: { requiredLinks: $links, density: "At least one contextual internal link per 200 words." },
      formattingInstructions: "Answer-first MedCover tone for hair restoration. Include graft pricing tables, FUE/DHI comparisons, and recovery timelines.",
      isActive: true
    }' > "${output}"
  printf '%s\n' "${output}"
}

create_templates() {
  TEMPLATE_HR_A_ID="$(upsert_template "$(template_payload \
    A "Country Destination Guide" LANDING_PAGE "/guides/[country]-hair-restoration-guide/" COMMERCIAL 0.9 1500 \
    "Hair Transplant in [Country]: What [N] Real Patients Told Us" \
    "End: Get Your Personalized [Country] Hair Transplant Report -> /start/" \
    '["Breadcrumb","H1 + hero answer","Truth Score card","Graft pricing table","FUE vs DHI overview","Top clinics","Cost breakdown","Recovery timeline","Country comparison","FAQ","CTA"]' \
    '["MedCover Truth Score for [Country]","Hair Transplant Cost in [Country]","FUE vs DHI vs FUT in [Country]","Top Hair Transplant Clinics","Graft Counts and Pricing","Recovery and Downtime","[Country] vs UK/USA Comparison","FAQ"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList","SpeakableSpecification"]' \
    '["/treatments/hair-restoration/","/costs/hair-restoration-[country]-cost-[year]/","city guides","clinic profiles"]' \
    '{"questionCount":"10-14"}' \
    '{"treatment":"HAIR_RESTORATION","dataRequired":["interviewCount","graftPriceRange","techniquesOffered"]}')")"

  TEMPLATE_HR_A2_ID="$(upsert_template "$(template_payload \
    A2 "City Destination Guide" CITY_PAGE "/guides/[country]/[city]-hair-restoration-guide/" COMMERCIAL 0.85 1500 \
    "Hair Transplant in [City]: [N] Clinics, Real Costs & Patient Insights" \
    "End: View all [City] clinics" \
    '["Breadcrumb","H1","City stats","Clinics list","City cost","Travel logistics","Recovery hotels","City comparison","FAQ","CTA"]' \
    '["Hair Transplant in [City]","Cost in [City] vs [Country]","Clinics in [City]","Travel Logistics","Recovery Hotels","[City] vs [Other City]","FAQ"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList"]' \
    '["parent country guide","city clinic PLP","city cost page"]' \
    '{"questionCount":"8-10"}' \
    '{"dataRequired":["clinicsTracked","graftPriceRange","airport"]}')")"

  TEMPLATE_HR_C_ID="$(upsert_template "$(template_payload \
    C "Country vs Country Comparison" COMPARISON "/compare/[a]-vs-[b]-hair-restoration/" COMMERCIAL 0.8 1500 \
    "Is [Country A] or [Country B] Better for a Hair Transplant?" \
    "End: Get a Personalized Comparison Report -> /start/" \
    '["Breadcrumb","H1 verdict","Comparison table","Cost breakdown","Patient quotes","Technique comparison","Decision tree","FAQ","CTA"]' \
    '["Quick Verdict","Full Comparison Table","Cost Breakdown","Patient Quotes","Technique Comparison","Which Country Is Right","FAQ"]' \
    '["Article","FAQPage","BreadcrumbList"]' \
    '["country guide A","country guide B","cost pages"]' \
    '{"questionCount":"8-12"}' \
    '{"dataRequired":["costRangeA","costRangeB","techniquesA","techniquesB"]}')")"

  TEMPLATE_HR_D_ID="$(upsert_template "$(template_payload \
    D "Cost Transparency Page" LANDING_PAGE "/costs/hair-restoration-[country]-cost-[year]/" INFORMATIONAL 0.8 1800 \
    "Hair Transplant Cost in [Country]: What Patients Actually Paid" \
    "End: Get a Full Cost Breakdown -> /start/" \
    '["Breadcrumb","H1 cost answer","Graft pricing table","FUE vs DHI costs","Add-ons","Travel costs","All-in scenarios","Hidden costs","Origin comparison","FAQ","CTA"]' \
    '["Direct Cost Answer","Base Costs by Graft Count","FUE vs DHI Prices","Add-On Costs","Travel Costs","All-In Scenarios","Hidden Costs","vs UK/USA","What Affects Price","FAQ"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList"]' \
    '["country guide","clinic profiles","/treatments/hair-restoration/"]' \
    '{"questionCount":"8-10"}' \
    '{"dataRequired":["graftPricingTiers","addonCosts","allInScenarios"]}')")"

  TEMPLATE_HR_E_ID="$(upsert_template "$(template_payload \
    E "Treatment Glossary Entity" ARTICLE "/treatments/hair-restoration/" INFORMATIONAL 0.8 1800 \
    "What Is Hair Restoration? FUE, DHI, and FUT Explained" \
    "End: Compare Hair Restoration Options Abroad" \
    '["Breadcrumb","H1 definition","FUE HowTo","DHI HowTo","FUT overview","Graft counts","Success rates","Why travel abroad","Patient reports","Countries","Glossary","FAQ","External resources"]' \
    '["What Is Hair Restoration","How FUE Works","How DHI Works","FUT Strip Method","Graft Counts","Success Rates","Why Travel Abroad","MedCover Patient Reports","Where Available","Glossary","FAQ"]' \
    '["MedicalWebPage","MedicalProcedure","HowTo","FAQPage","BreadcrumbList"]' \
    '["country guides","cost pages","/faq/"]' \
    '{"questionCount":"10-15"}' \
    '{"requiresMedicalReviewer":true,"treatmentCode":"HAIR_RESTORATION"}')")"

  TEMPLATE_HR_F_ID="$(upsert_template "$(template_payload \
    F "Origin Patient Journey" LANDING_PAGE "/from/[country]/hair-restoration-abroad/" INFORMATIONAL 0.8 1800 \
    "Hair Transplant Abroad for [Origin] Patients: What You Need to Know" \
    "End: Find Your Best Destination" \
    '["Breadcrumb","H1 answer","Why travel","Top destinations","Cost comparison","Clinic selection","Travel logistics","Insurance","Patient stories","FAQ","CTA"]' \
    '["Why [Origin] Patients Travel","Best Destinations","Cost Comparison","Choosing a Clinic","Travel Logistics","Insurance","Patient Stories","FAQ"]' \
    '["Article","FAQPage","BreadcrumbList"]' \
    '["/guides/turkey-hair-restoration-guide/","/guides/spain-hair-restoration-guide/","/guides/greece-hair-restoration-guide/"]' \
    '{"questionCount":"10"}' \
    '{"hreflang":"origin-country-specific"}')")"
}

get_subject_id_by_title() {
  request GET "/api/v1/subjects?siteId=$1" | jq -r --arg title "$2" 'first(.[] | select(.title == $title) | .id) // empty'
}

subject_payload() {
  local site_id="$1" template_id="$2" title="$3" description="$4"
  local primary_json="$5" secondary_json="$6" intent="$7" country="$8" city="$9"
  local seo_goal="${10}" content_count="${11}"
  local output="${TMP_DIR}/subject-$(echo "${title}" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-').json"
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
    --argjson contentCountTarget "${content_count}" \
    '{
      siteId: $siteId, templateId: $templateId, title: $title, description: $description,
      primaryKeywords: $primaryKeywords, secondaryKeywords: $secondaryKeywords,
      searchIntent: $searchIntent, language: "EN", seoGoal: $seoGoal,
      contentCountTarget: $contentCountTarget, hallucinationSensitivity: "HIGH",
      riskCategory: "MEDICAL", requiresFactualValidation: true, strictReviewMode: true, status: "ACTIVE"
    }
    + (if $country != "" then {country: $country} else {} end)
    + (if $city != "" then {city: $city} else {} end)' > "${output}"
  printf '%s\n' "${output}"
}

upsert_subject() {
  local site_id="$1" payload_file="$2" title subject_id response
  title="$(jq -r '.title' "${payload_file}")"
  subject_id="$(get_subject_id_by_title "${site_id}" "${title}")"
  if [[ -n "${subject_id}" && "${UPSERT_EXISTING}" == "true" ]]; then
    log "Updating subject ${title} (id=${subject_id})"
    response="$(request PATCH "/api/v1/subjects/${subject_id}" "${payload_file}")"
  else
    log "Creating subject ${title}"
    response="$(request POST /api/v1/subjects "${payload_file}")"
  fi
  printf '%s\n' "${response}" | jq -r '.id'
}

create_subjects() {
  local site_id="$1"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_A_ID}" \
    "Turkey Hair Restoration Country Guide" \
    "Country hub for hair transplant in Turkey — Istanbul, FUE/DHI pricing, clinic rankings." \
    '["hair transplant turkey","fue turkey"]' \
    '["hair transplant istanbul","fue clinic turkey","hair restoration turkey"]' \
    COMMERCIAL Turkey "" "Rank for Turkey hair transplant destination searches." 12)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_A_ID}" \
    "Spain Hair Restoration Country Guide" \
    "Country hub for hair transplant in Spain — Barcelona, Madrid, EU-regulated clinics." \
    '["hair transplant spain","fue spain"]' \
    '["hair transplant barcelona","hair transplant madrid","hair restoration spain"]' \
    COMMERCIAL Spain "" "Rank for Spain hair transplant destination searches." 12)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_A_ID}" \
    "Greece Hair Restoration Country Guide" \
    "Country hub for hair transplant in Greece — Athens, mid-range FUE/DHI pricing." \
    '["hair transplant greece","fue greece"]' \
    '["hair transplant athens","hair restoration greece"]' \
    COMMERCIAL Greece "" "Rank for Greece hair transplant destination searches." 12)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_A2_ID}" \
    "Istanbul Hair Restoration City Guide" \
    "City guide for hair transplant in Istanbul — world's hair transplant capital." \
    '["hair transplant istanbul","fue istanbul"]' \
    '["istanbul hair clinic","hair restoration istanbul"]' \
    COMMERCIAL Turkey Istanbul "Capture Istanbul hair transplant city intent." 8)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_A2_ID}" \
    "Barcelona Hair Restoration City Guide" \
    "City guide for hair transplant in Barcelona." \
    '["hair transplant barcelona"]' \
    '["fue barcelona","hair clinic barcelona"]' \
    COMMERCIAL Spain Barcelona "Capture Barcelona hair transplant city intent." 8)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_A2_ID}" \
    "Athens Hair Restoration City Guide" \
    "City guide for hair transplant in Athens." \
    '["hair transplant athens"]' \
    '["fue athens","hair clinic athens"]' \
    COMMERCIAL Greece Athens "Capture Athens hair transplant city intent." 8)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_E_ID}" \
    "Hair Restoration Treatment Entity" \
    "Medically reviewed entity page for FUE, DHI, FUT, graft counts, and results timeline." \
    '["what is hair restoration","fue hair transplant"]' \
    '["dhi hair transplant","hair transplant grafts","fue vs dhi"]' \
    INFORMATIONAL "" "" "Build topical authority for hair restoration." 10)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_F_ID}" \
    "From UK Hair Restoration Abroad" \
    "Origin journey for UK patients considering hair transplant abroad." \
    '["hair transplant abroad uk","cheap hair transplant abroad"]' \
    '["turkey hair transplant uk","hair transplant turkey from uk"]' \
    INFORMATIONAL UK "" "Capture UK origin-patient hair transplant intent." 10)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_HR_F_ID}" \
    "From USA Hair Restoration Abroad" \
    "Origin journey for US patients considering hair transplant abroad." \
    '["hair transplant abroad usa","hair transplant turkey from usa"]' \
    '["cheap hair transplant abroad american","fue abroad usa"]' \
    INFORMATIONAL USA "" "Capture US origin-patient hair transplant intent." 10)"
}

main() {
  local site_id
  log "Logging in as ${ADMIN_EMAIL}"
  login
  site_id="$(get_site_id)"
  if [[ -z "${site_id}" ]]; then
    echo "Site not found: ${SITE_DOMAIN}" >&2
    exit 1
  fi
  log "SITE_ID=${site_id} DOMAIN=${SITE_DOMAIN}"
  create_templates
  create_subjects "${site_id}"
  cat <<SUMMARY

Hair restoration seed complete.

Site: SITE_ID=${site_id} DOMAIN=${SITE_DOMAIN}

Templates:
  HR-A=${TEMPLATE_HR_A_ID}
  HR-A2=${TEMPLATE_HR_A2_ID}
  HR-C=${TEMPLATE_HR_C_ID}
  HR-D=${TEMPLATE_HR_D_ID}
  HR-E=${TEMPLATE_HR_E_ID}
  HR-F=${TEMPLATE_HR_F_ID}

Next: run generate-hair-restoration-country-guides-direct.sh
SUMMARY
}

main "$@"
