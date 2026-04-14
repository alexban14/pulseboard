# Pulseboard — Multi-Tenant Analytics SaaS Platform

## Document Index

| # | Document | Purpose |
|---|----------|---------|
| 00 | [OVERVIEW.md](00-OVERVIEW.md) | This file — vision, positioning, document map |
| 01 | [MARKET-POSITIONING.md](01-MARKET-POSITIONING.md) | Competitive landscape, differentiation, target market |
| 02 | [REQUIREMENTS.md](02-REQUIREMENTS.md) | Functional & non-functional requirements |
| 03 | [TECHNOLOGY-EVALUATION.md](03-TECHNOLOGY-EVALUATION.md) | PHP vs TypeScript vs Python deep comparison |
| 04 | [ARCHITECTURE.md](04-ARCHITECTURE.md) | System architecture, CQRS, DDD, microservices design |
| 05 | [SEMANTIC-LAYER.md](05-SEMANTIC-LAYER.md) | Schema discovery, dynamic data modeling, metric definitions |
| 06 | [CONNECTOR-FRAMEWORK.md](06-CONNECTOR-FRAMEWORK.md) | Plugin-based connector system, SDK, built-in connectors |
| 07 | [DATA-PIPELINE.md](07-DATA-PIPELINE.md) | ETL engine, warehouse schema, transformation layer |
| 08 | [MULTI-TENANCY.md](08-MULTI-TENANCY.md) | Tenant isolation, resolution, onboarding, plan gating |
| 09 | [FRONTEND-DASHBOARDS.md](09-FRONTEND-DASHBOARDS.md) | Dashboard UI, widget system, query builder, chart engine |
| 10 | [SECURITY-AUTH.md](10-SECURITY-AUTH.md) | Authentication, authorization, data isolation, encryption |
| 11 | [INFRASTRUCTURE.md](11-INFRASTRUCTURE.md) | Deployment, CI/CD, observability, scaling |
| 12 | [IMPLEMENTATION-ROADMAP.md](12-IMPLEMENTATION-ROADMAP.md) | Phased delivery plan with milestones |
| 13 | [RISK-REGISTER.md](13-RISK-REGISTER.md) | Risks, mitigations, decision log |

---

## Vision

Build a **self-service, multi-tenant analytics SaaS platform** that allows any
business to:

1. **Connect** their data sources (databases, APIs, SaaS tools, files).
2. **Model** their data through a visual semantic layer — define metrics,
   dimensions, and relationships without writing SQL.
3. **Visualize** with fully configurable drag-and-drop dashboards.
4. **Share** insights across their organization with role-based access.
5. **Automate** with scheduled reports, threshold alerts, and API access.

**MigroNet (Migro Consult)** is the first tenant — used to validate the platform
with real-world data before going to market.

## Product Positioning

> "Metabase meets Preset meets Holistics — but simpler to set up, with a
> connector marketplace and a semantic layer that non-technical users can
> configure."

### Target Users

| Persona | Need |
|---------|------|
| **SMB Operations Manager** | See business KPIs without asking engineering |
| **Data Analyst** | Build queries and dashboards without infrastructure setup |
| **CTO / Tech Lead** | Connect company databases and APIs in minutes |
| **Agency / Consultancy** | White-label analytics for their clients |

### What Makes This Different

| Competitor | Gap We Fill |
|-----------|-------------|
| Metabase | No semantic layer, limited connector ecosystem, self-hosted bias |
| Preset (Superset) | Complex setup, steep learning curve, enterprise-focused |
| Holistics | Expensive, code-heavy modeling |
| Retool | App builder, not analytics-native |
| Google Looker Studio | Limited data sources, no multi-tenancy, no self-hosting |

Our edge: **schema auto-discovery + visual semantic layer + connector marketplace
+ true multi-tenancy** — all in a product simple enough for a 10-person company.

## Guiding Principles

- **SaaS-first** — every design decision assumes multiple tenants from day one.
- **Zero domain assumptions** — the platform knows nothing about "cases", "invoices",
  or "tax recovery". It works with tables, columns, metrics, and dimensions.
- **Progressive disclosure** — simple for viewers, powerful for builders.
- **Connector-driven** — the platform is only as valuable as the data it can reach.
  Invest heavily in the connector framework.
- **API-first** — every capability is an API endpoint. The dashboard is a consumer.
- **Embeddable** — tenants should be able to embed dashboards in their own products.

## Success Metrics (Platform)

| Metric | Target (6 months post-launch) |
|--------|------|
| Tenants onboarded | >= 10 |
| Data sources connected (total) | >= 30 |
| Dashboards created (total) | >= 100 |
| Dashboard load time (P95) | < 2 s |
| Connector types available | >= 15 |
| Monthly recurring revenue | Validation signal (any paying tenant) |

## Validation Tenant: MigroNet

MigroNet will be onboarded as tenant #1 using only the generic platform features:

- Connect: MySQL (MigroNet DB), REST APIs (BT, InsideTelecom, WATI, BNR, FGO)
- Model: Define semantic layer for case pipeline, revenue, team performance
- Visualize: Build dashboards for tax recovery KPIs
- Automate: Schedule weekly reports for management

If the platform can serve MigroNet's complex, multi-source analytics needs through
generic configuration alone (no custom code), it can serve any SMB.
