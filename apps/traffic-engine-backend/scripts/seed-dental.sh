#!/usr/bin/env bash
# Seed MedCover ContentTemplates (DT-A through DT-F) and Subjects for dental care.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/seed-dental.sh

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

log() { printf '[dental-seed] %s\n' "$*" >&2; }

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
    --arg name "DT-${letter} - ${name}" \
    --arg description "MedCover dental ${name} for ${url_pattern}" \
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
          imageAltText: "Dental care [subject] in [city], [country] - MedCover.",
          ymylCompliance: "Surgical claims require sources; treatment page requires medical reviewer."
        },
        schema: $schema,
        templateRules: $extraRules
      },
      faqStructure: $faq,
      ctaPlacement: $cta,
      internalLinkingRules: { requiredLinks: $links, density: "At least one contextual internal link per 200 words." },
      formattingInstructions: "Answer-first MedCover tone for dental tourism. Include implant/veneer pricing tables, material comparisons, and trip-count guidance.",
      isActive: true
    }' > "${output}"
  printf '%s\n' "${output}"
}

create_templates() {
  TEMPLATE_DT_A_ID="$(upsert_template "$(template_payload \
    A "Country Destination Guide" LANDING_PAGE "/guides/[country]-dental-guide/" COMMERCIAL 0.9 1500 \
    "Dental Care in [Country]: What [N] Real Patients Told Us" \
    "End: Get Your Personalized [Country] Dental Report -> /start/" \
    '["Breadcrumb","H1 + hero answer","Truth Score card","Implant pricing table","Veneer vs implant overview","Top clinics","Cost breakdown","Trip planning","Country comparison","FAQ","CTA"]' \
    '["MedCover Truth Score for [Country]","Dental Cost in [Country]","Implants vs Veneers in [Country]","Top Dental Clinics","Materials and Pricing","Trip Count and Logistics","[Country] vs UK/USA Comparison","FAQ"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList","SpeakableSpecification"]' \
    '["/treatments/dental/","/costs/dental-[country]-cost-[year]/","city guides","clinic profiles"]' \
    '{"questionCount":"10-14"}' \
    '{"treatment":"DENTAL","dataRequired":["interviewCount","implantPriceRange","proceduresOffered"]}')")"

  TEMPLATE_DT_A2_ID="$(upsert_template "$(template_payload \
    A2 "City Destination Guide" CITY_PAGE "/guides/[country]/[city]-dental-guide/" COMMERCIAL 0.85 1500 \
    "Dental Care in [City]: [N] Clinics, Real Costs & Patient Insights" \
    "End: View all [City] clinics" \
    '["Breadcrumb","H1","City stats","Clinics list","City cost","Travel logistics","Hotels near clinics","City comparison","FAQ","CTA"]' \
    '["Dental Care in [City]","Cost in [City] vs [Country]","Clinics in [City]","Travel Logistics","Hotels Near Clinics","[City] vs [Other City]","FAQ"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList"]' \
    '["parent country guide","city clinic PLP","city cost page"]' \
    '{"questionCount":"8-10"}' \
    '{"dataRequired":["clinicsTracked","implantPriceRange","airport"]}')")"

  TEMPLATE_DT_C_ID="$(upsert_template "$(template_payload \
    C "Country vs Country Comparison" COMPARISON "/compare/[a]-vs-[b]-dental/" COMMERCIAL 0.8 1500 \
    "Is [Country A] or [Country B] Better for Dental Work Abroad?" \
    "End: Get a Personalized Comparison Report -> /start/" \
    '["Breadcrumb","H1 verdict","Comparison table","Cost breakdown","Patient quotes","Material quality","Decision tree","FAQ","CTA"]' \
    '["Quick Verdict","Full Comparison Table","Cost Breakdown","Patient Quotes","Material Quality","Which Country Is Right","FAQ"]' \
    '["Article","FAQPage","BreadcrumbList"]' \
    '["country guide A","country guide B","cost pages"]' \
    '{"questionCount":"8-12"}' \
    '{"dataRequired":["costRangeA","costRangeB","proceduresA","proceduresB"]}')")"

  TEMPLATE_DT_D_ID="$(upsert_template "$(template_payload \
    D "Cost Transparency Page" LANDING_PAGE "/costs/dental-[country]-cost-[year]/" INFORMATIONAL 0.8 1800 \
    "Dental Cost in [Country]: What Patients Actually Paid" \
    "End: Get a Full Cost Breakdown -> /start/" \
    '["Breadcrumb","H1 cost answer","Implant pricing table","Veneer costs","All-on-4 costs","Add-ons","Travel costs","All-in scenarios","Hidden costs","Origin comparison","FAQ","CTA"]' \
    '["Direct Cost Answer","Implant Costs per Tooth","Veneer and Crown Prices","All-on-4 Pricing","Add-On Costs","Travel Costs","All-In Scenarios","Hidden Costs","vs UK/USA","What Affects Price","FAQ"]' \
    '["MedicalWebPage","FAQPage","BreadcrumbList"]' \
    '["country guide","clinic profiles","/treatments/dental/"]' \
    '{"questionCount":"8-10"}' \
    '{"dataRequired":["implantPricingTiers","veneerCosts","allInScenarios"]}')")"

  TEMPLATE_DT_E_ID="$(upsert_template "$(template_payload \
    E "Treatment Glossary Entity" ARTICLE "/treatments/dental/" INFORMATIONAL 0.8 1800 \
    "What Is Dental Tourism? Implants, Veneers & Crowns Explained" \
    "End: Compare Dental Options Abroad" \
    '["Breadcrumb","H1 definition","Implant HowTo","Veneer overview","Crown overview","All-on-4","Why travel abroad","Patient reports","Countries","Glossary","FAQ","External resources"]' \
    '["What Is Dental Tourism","How Dental Implants Work","Veneers Explained","Crowns and Materials","All-on-4 Overview","Why Travel Abroad","MedCover Patient Reports","Where Available","Glossary","FAQ"]' \
    '["MedicalWebPage","MedicalProcedure","HowTo","FAQPage","BreadcrumbList"]' \
    '["country guides","cost pages","/faq/"]' \
    '{"questionCount":"10-15"}' \
    '{"requiresMedicalReviewer":true,"treatmentCode":"DENTAL"}')")"

  TEMPLATE_DT_F_ID="$(upsert_template "$(template_payload \
    F "Origin Patient Journey" LANDING_PAGE "/from/[country]/dental-abroad/" INFORMATIONAL 0.8 1800 \
    "Dental Treatment Abroad for [Origin] Patients: What You Need to Know" \
    "End: Find Your Best Destination" \
    '["Breadcrumb","H1 answer","Why travel","Top destinations","Cost comparison","Clinic selection","Trip planning","Insurance","Patient stories","FAQ","CTA"]' \
    '["Why [Origin] Patients Travel","Best Destinations","Cost Comparison","Choosing a Clinic","Trip Planning","Insurance","Patient Stories","FAQ"]' \
    '["Article","FAQPage","BreadcrumbList"]' \
    '["/guides/turkey-dental-guide/","/guides/spain-dental-guide/","/guides/greece-dental-guide/"]' \
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
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_A_ID}" \
    "Turkey Dental Country Guide" \
    "Country hub for dental care in Turkey — Istanbul, implant/veneer pricing, clinic rankings." \
    '["dental turkey","dental implants turkey"]' \
    '["dentist istanbul","dental clinic turkey","dental tourism turkey"]' \
    COMMERCIAL Turkey "" "Rank for Turkey dental destination searches." 12)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_A_ID}" \
    "Spain Dental Country Guide" \
    "Country hub for dental care in Spain — Barcelona, Madrid, EU-regulated clinics." \
    '["dental spain","dental implants spain"]' \
    '["dentist barcelona","dentist madrid","dental clinic spain"]' \
    COMMERCIAL Spain "" "Rank for Spain dental destination searches." 12)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_A_ID}" \
    "Greece Dental Country Guide" \
    "Country hub for dental care in Greece — Athens, mid-range implant pricing." \
    '["dental greece","dental implants greece"]' \
    '["dentist athens","dental clinic greece"]' \
    COMMERCIAL Greece "" "Rank for Greece dental destination searches." 12)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_A2_ID}" \
    "Istanbul Dental City Guide" \
    "City guide for dental care in Istanbul." \
    '["dental istanbul","dentist istanbul"]' \
    '["dental implants istanbul","dental clinic istanbul"]' \
    COMMERCIAL Turkey Istanbul "Capture Istanbul dental city intent." 8)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_A2_ID}" \
    "Barcelona Dental City Guide" \
    "City guide for dental care in Barcelona." \
    '["dental barcelona","dentist barcelona"]' \
    '["dental implants barcelona","dental clinic barcelona"]' \
    COMMERCIAL Spain Barcelona "Capture Barcelona dental city intent." 8)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_A2_ID}" \
    "Madrid Dental City Guide" \
    "City guide for dental care in Madrid." \
    '["dental madrid","dentist madrid"]' \
    '["dental implants madrid","dental clinic madrid"]' \
    COMMERCIAL Spain Madrid "Capture Madrid dental city intent." 8)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_A2_ID}" \
    "Athens Dental City Guide" \
    "City guide for dental care in Athens." \
    '["dental athens","dentist athens"]' \
    '["dental implants athens","dental clinic athens"]' \
    COMMERCIAL Greece Athens "Capture Athens dental city intent." 8)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_E_ID}" \
    "Dental Treatment Entity" \
    "Medically reviewed entity page for implants, veneers, crowns, and all-on-4." \
    '["what is dental tourism","dental implants abroad"]' \
    '["dental veneers abroad","all on 4 dental implants","dental crowns abroad"]' \
    INFORMATIONAL "" "" "Build topical authority for dental tourism." 10)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_F_ID}" \
    "From UK Dental Abroad" \
    "Origin journey for UK patients considering dental treatment abroad." \
    '["dental treatment abroad uk","cheap dental implants abroad"]' \
    '["turkey dental uk","dental implants turkey from uk"]' \
    INFORMATIONAL UK "" "Capture UK origin-patient dental intent." 10)"
  upsert_subject "${site_id}" "$(subject_payload "${site_id}" "${TEMPLATE_DT_F_ID}" \
    "From USA Dental Abroad" \
    "Origin journey for US patients considering dental treatment abroad." \
    '["dental tourism usa","dental implants abroad from usa"]' \
    '["cheap dental work abroad american","dental turkey from usa"]' \
    INFORMATIONAL USA "" "Capture US origin-patient dental intent." 10)"
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

Dental seed complete.

Site: SITE_ID=${site_id} DOMAIN=${SITE_DOMAIN}

Templates:
  DT-A=${TEMPLATE_DT_A_ID}
  DT-A2=${TEMPLATE_DT_A2_ID}
  DT-C=${TEMPLATE_DT_C_ID}
  DT-D=${TEMPLATE_DT_D_ID}
  DT-E=${TEMPLATE_DT_E_ID}
  DT-F=${TEMPLATE_DT_F_ID}

Next: run generate-dental-country-guides-direct.sh
SUMMARY
}

main "$@"
