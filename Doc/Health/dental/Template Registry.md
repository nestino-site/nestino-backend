# MedCover — Dental Template Registry

**Treatment:** `DENTAL` · **Slug:** `dental`

---

## Template Index

| # | Letter | Name | URL Pattern | Intent | Priority | ~Words |
|---|---|---|---|---|---|---|
| 1 | DT-A | Country Destination Guide | `/guides/[country]-dental-guide/` | COMMERCIAL | 0.9 | 1,500 |
| 2 | DT-A2 | City Destination Guide | `/guides/[country]/[city]-dental-guide/` | COMMERCIAL | 0.85 | 1,500 |
| 3 | DT-C | Country Comparison | `/compare/[a]-vs-[b]-dental/` | COMMERCIAL | 0.8 | 1,500 |
| 4 | DT-D | Cost Transparency Page | `/costs/dental-[country]-cost-[year]/` | INFORMATIONAL | 0.8 | 1,800 |
| 5 | DT-E | Treatment Glossary | `/treatments/dental/` | INFORMATIONAL | 0.8 | 1,800 |
| 6 | DT-F | Origin Patient Journey | `/from/[country]/dental-abroad/` | INFORMATIONAL | 0.8 | 1,800 |

---

## Template DT-A — Country Guide

**H1:** `Dental Care in [Country]: What [N] Real Patients Told Us`

**H2s:** Truth Score · Implant/Veneer Costs · Top Clinics · Materials (Zirconia vs Porcelain) · All-on-4 Availability · Travel & Trip Count · vs UK/USA Comparison · FAQ

---

## Template DT-D — Cost Page

**H1:** `Dental Cost in [Country]: What Patients Actually Paid`

**Required tables:** per-implant pricing, veneer tiers, full-arch/all-on-4, add-ons, all-in scenarios, hidden costs.

---

## Template DT-E — Treatment Glossary

**H1:** `What Is Dental Tourism? Implants, Veneers & Crowns Explained`

**Schema:** `MedicalProcedure`, `HowTo`, `FAQPage` · **requiresMedicalReviewer:** true

---

## Template DT-F — Origin Journey

**H1:** `Dental Treatment Abroad for [Origin] Patients: What You Need to Know`

**H2s:** Why travel · Best destinations · Cost comparison · Clinic selection · Trip planning (1 vs 2 visits) · Insurance/NHS · FAQ
