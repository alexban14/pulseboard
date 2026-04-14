# 01 — Market Positioning & Competitive Landscape

## Target Market

### Primary: European SMBs (10–500 employees)

Companies with data in multiple systems (CRM, accounting, telephony, e-commerce)
who need consolidated analytics but can't afford (or don't need) enterprise BI
tools like Tableau, Power BI, or Looker.

### Secondary: Agencies & Consultancies

Firms that manage data for multiple clients and need white-label, multi-tenant
analytics to deliver reporting as a service.

### Tertiary: SaaS Companies (Embedded Analytics)

SaaS products that want to embed analytics dashboards inside their own app
rather than building from scratch.

---

## Competitive Analysis

### Direct Competitors

| Product | Strengths | Weaknesses | Pricing |
|---------|-----------|------------|---------|
| **Metabase** | Open-source, easy SQL queries, good community | No semantic layer, limited API connectors, basic multi-tenancy, embedding is enterprise-only | Free (OSS) / $85/user/mo (Pro) |
| **Apache Superset / Preset** | Powerful, open-source, rich chart types | Steep learning curve, complex self-hosting, requires SQL knowledge | Free (OSS) / $20/user/mo (Preset) |
| **Holistics** | Strong modeling layer, code-based transforms | Expensive, developer-focused, small community | $100+/mo |
| **Redash** | Simple, open-source, good SQL interface | Abandoned by maintainers, no semantic layer, limited connectors | Free (OSS) |
| **Lightdash** | dbt-native, good semantic layer | Requires dbt, developer-focused, limited non-SQL users | Free (OSS) / paid cloud |
| **Google Looker Studio** | Free, Google ecosystem integration | Limited data sources, no multi-tenancy, no self-hosting, basic customization | Free |
| **Microsoft Power BI** | Enterprise-grade, deep Microsoft integration | Complex licensing, Windows-centric, expensive at scale | $10–20/user/mo |

### Indirect Competitors

| Product | Why They're Not Ideal |
|---------|-----------------------|
| **Retool** | App builder, not analytics-first |
| **Grafana** | Infrastructure monitoring, not business analytics |
| **Mixpanel / Amplitude** | Product analytics only, not general-purpose |
| **Databox** | Dashboard aggregator, no raw data access, limited customization |

---

## Our Differentiation

### 1. Schema Auto-Discovery + Visual Semantic Layer

When a tenant connects a database, the platform:
- Introspects all tables and columns
- Detects relationships (foreign keys, naming conventions)
- Suggests metrics and dimensions
- Lets the user visually define a semantic model (no SQL, no code)

This is the **key differentiator**. Metabase requires SQL knowledge. Holistics
requires code. Preset requires Superset expertise. We make data modeling
accessible to non-technical users.

### 2. Connector Marketplace

A growing library of pre-built connectors:
- Databases: MySQL, PostgreSQL, MariaDB, SQL Server, MongoDB, ClickHouse
- SaaS: Stripe, HubSpot, Salesforce, QuickBooks, Shopify, Google Analytics
- APIs: Any REST/GraphQL endpoint (generic connector with visual mapping)
- Files: CSV, Excel, Google Sheets
- Messaging: WhatsApp (WATI), Twilio, telecom APIs

Third-party developers can build and publish connectors via an SDK.

### 3. True Multi-Tenancy

Not bolted on — designed from the start:
- Tenant data isolation (PostgreSQL RLS)
- Per-tenant auth providers (Azure AD, Google, OIDC)
- Custom domains
- White-label branding
- Embeddable dashboards with tenant-scoped tokens

### 4. Progressive Complexity

| User Level | Experience |
|-----------|------------|
| **Viewer** | See dashboards, filter data, export |
| **Explorer** | Use visual query builder, create widgets |
| **Builder** | Design dashboards, define semantic models |
| **Admin** | Manage connections, users, billing |
| **Developer** | API access, embedded analytics, custom connectors |

---

## Go-to-Market Strategy

### Phase 1: Validate with MigroNet (Internal)

- Onboard MigroNet as tenant #1
- Prove the platform handles a complex multi-source setup
- Document the onboarding journey for marketing content

### Phase 2: Closed Beta (5–10 tenants)

- Recruit from professional network and Romanian tech community
- Target: accounting firms, consulting agencies, small SaaS companies
- Free tier, gather feedback, iterate on UX

### Phase 3: Public Launch

- Landing page, documentation, self-service signup
- Freemium model (free tier with limits, paid tiers for scale)
- Content marketing: "How we built our own analytics platform" story
- Product Hunt launch

### Phase 4: Growth

- Connector marketplace opens to third-party developers
- Embedded analytics SDK for SaaS companies
- Partnership with consulting firms for white-label deals
- Consider EU-specific compliance features (GDPR, data residency) as a selling point

---

## Pricing Model (Draft)

| Plan | Price | Data Sources | Users | Dashboards | Refresh | Key Features |
|------|-------|-------------|-------|------------|---------|-------------|
| **Free** | €0/mo | 1 | 3 | 2 | 1 hour | Basic charts, CSV export |
| **Starter** | €29/mo | 3 | 10 | 10 | 15 min | Visual query builder, scheduled reports |
| **Pro** | €79/mo | 10 | 50 | Unlimited | 5 min | Semantic layer, alerts, API access, custom domain |
| **Business** | €199/mo | 25 | 200 | Unlimited | 1 min | White-label, embedded analytics, SSO |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Real-time | Schema isolation, SLA, dedicated support |

Revenue model: subscription-based, per-tenant. No per-query or per-row charges
(simplicity wins for SMBs).

---

## Name Candidates

The product should have a standalone brand, not associated with Migro:

| Name | Domain Availability | Vibe |
|------|-------------------|------|
| **Insightflow** | insightflow.io | Professional, clear purpose |
| **Datapulse** | datapulse.io | Dynamic, real-time feel |
| **ChartDeck** | chartdeck.io | Visual, approachable |
| **QueryBase** | querybase.io | Technical but friendly |
| **MetricForge** | metricforge.io | Builder-oriented |

Domain and trademark checks needed before committing.
