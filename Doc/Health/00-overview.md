# MedicalVera.com — Project Overview

## Project Identity

| Field | Value |
|---|---|
| Domain | MedicalVera.com |
| Category | Medical Tourism / Health Information (YMYL) |
| Primary Niche (Phase 1) | IVF & Fertility — US patients traveling to Spain |
| Core Differentiator | AI-conducted patient interviews → verified ground-truth data |
| Business Model | Lead gen (B2B), Insight reports (B2C), Verification-as-a-Service (VaaS), Affiliate |

---

## Mission Statement (for schema & brand copy)

> MedicalVera is an AI-driven patient verification platform that extracts ground-truth data from real fertility patients through deep-dive AI interviews — replacing marketing claims with verified, structured patient experience.

---

## The Tech Flywheel

```
Real Patients (Reddit / FB / Google)
        ↓
AI Interviewer conducts structured interview
        ↓
Knowledge Graph: 10 verified dimensions per patient
        ↓
┌─────────────────────────────────────────────┐
│  Truth Reports  │  Country Guides  │  FAQs  │
│  Cost Pages     │  Clinic Profiles │  Blog  │
└─────────────────────────────────────────────┘
        ↓
SEO + AEO traffic
        ↓
More patients discover MedicalVera
        ↓
More interviews (flywheel repeats)
```

---

## Target Audience

### Patients (B2C)
| Segment | Description |
|---|---|
| Primary | US couples/individuals priced out of domestic IVF (~$15,000–$30,000 per cycle) |
| Secondary | UK patients on NHS waitlists (12–24 months average) |
| Tertiary | Canadian patients facing access + cost issues |

### Clinics (B2B)
- High-quality IVF clinics in Spain, Greece, Czech Republic, Cyprus
- Clinics who want verified leads and a trust badge that stands apart from Trustpilot gaming

---

## Destination Scope

| Phase | Countries |
|---|---|
| Phase 1 | Spain |
| Phase 2 | Greece, Czech Republic |
| Phase 3 | Cyprus, then dental (Mexico, Turkey) |

---

## The 10 Knowledge Graph Dimensions

Every patient interview is structured to extract exactly these 10 dimensions. These feed ALL auto-generated content.

| # | Dimension | Data Type | Source |
|---|---|---|---|
| 1 | Overall satisfaction | Score 1–10 | Interview |
| 2 | Cost accuracy (quoted vs actual) | % variance + narrative | Interview |
| 3 | Treatment outcome | Y / N / Ongoing + context | Interview |
| 4 | Staff English proficiency | Score 1–5 | Interview |
| 5 | Lab quality perception | Score 1–5 | Interview |
| 6 | Days from first contact to treatment start | Integer | Interview |
| 7 | Hidden costs discovered | List + amounts | Interview |
| 8 | Communication quality (pre/during/post) | Score 1–5 | Interview |
| 9 | Protocol transparency | Score 1–5 | Interview |
| 10 | Would recommend | Y / N + reason | Interview |

---

## Interview Sources (3 Types)

| Type | Source | Volume target |
|---|---|---|
| Direct AI Interview | Patients recruited from Reddit / FB / Trustpilot outreach | Primary |
| Imported Review | AI processes existing Google / Trustpilot reviews | Secondary (enrichment) |
| Community Sourced | Micro-influencers, patient advocates, FB group admins | Supplementary |

---

## Revenue Streams Summary

| Stream | Model | Phase |
|---|---|---|
| Lead Generation (B2B) | Pay-per-qualified-inquiry from clinics | Phase 3+ |
| Premium Insight Reports | $49–$99 country-specific guides (B2C) | Phase 2+ |
| Verification-as-a-Service | Annual fee, clinic pays MedicalVera to independently interview patients | Phase 3+ |
| Affiliate | Insurance, legal, relocation, pharmacy referrals | Phase 2+ |

---

## Document Index

| File | Contents |
|---|---|
| `01-architecture.md` | URL taxonomy, navigation, sitemap, slug patterns |
| `02-page-templates.md` | All page templates with sections, schema fired, internal links required |
| `03-seo-aeo-schema.md` | Schema map, meta tags framework, AEO rules, external authority links, entity building |
| `04-interview-pipeline.md` | AI interview system, content pipeline, auto-generation rules, GDPR/HIPAA, data model |
| `05-technical.md` | Technical SEO, Core Web Vitals, robots.txt, llms.txt, root files |
| `06-launch-roadmap.md` | Phase 1 MVP page list, KPIs, launch checklist |
