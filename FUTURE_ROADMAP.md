# Performance Arena — Future Roadmap

## 1. Product direction

Performance Arena should evolve from a gamified scorecard into a **Client Outcome Intelligence operating layer**.

Strategic direction:

```text
Operational KPI data
→ Client outcome driver model
→ RCA and recommendations
→ Gamified interventions
→ Closed-loop measurement
```

Gamification remains the engagement layer. Client Outcome Intelligence becomes the focal point.

## 2. Positioning with Centrical and existing tools

The prototype should not be positioned as a default replacement for Centrical or similar platforms.

Recommended positioning:

> Centrical motivates activity. Performance Arena’s Client Outcome Intelligence layer explains which activity matters, why it matters to the client, and what action will move the business outcome.

Potential future paths:

1. Configure/extend Centrical with the outcome model.
2. Use Performance Arena as a design blueprint for business-outcome gamification.
3. Build a custom overlay that integrates with Centrical and source systems.
4. Use it as a client-facing operating cockpit for QBRs and governance.

## 3. Next feature improvements

### 3.1 Real client data integration

Replace synthetic `data.js` with live or scheduled data feeds from:

- Contact-center platform
- QA system
- WFM system
- CRM
- Survey/post-call feedback system
- LMS
- PMS / performance management system
- BI/data lake

### 3.2 Real repeat-contact tracking

Add true repeat-contact detection:

- Same member ID
- Same issue/call reason
- Repeat within configured window, such as 3/7/14 days
- Exclude non-avoidable repeat contacts where appropriate
- Attribute to process/team/theme, not only individual agent

### 3.3 Real call reason and root-cause tagging

Add call reason and RCA data:

- Benefit explanation unclear
- Authorization follow-up
- Claim status follow-up
- Transfer/routing issue
- Unclear next step
- System update delay
- Plan policy complexity
- Member behavior / external dependency

### 3.4 Post-call survey ingestion

Integrate post-call survey fields:

- Courtesy & Respect
- Call Resolved
- CSAT
- Ease of resolution
- Transfer experience
- Agent clarity

### 3.5 Revenue and rate-card configuration

Move rate card assumptions from demo constants/data into configurable fields:

- Rate per call
- Rate by call type
- Rate by queue/process
- Billable/non-billable call rules
- Penalty/reward terms
- SLA thresholds

### 3.6 RCA model improvements

Move from static/synthetic RCA to evidence-based diagnostic scoring:

- Correlation with call themes
- Driver contribution analysis
- Team and interval contribution
- Trend-based anomaly detection
- Confidence scoring
- Intervention effectiveness tracking

### 3.7 AI-driven recommendations

Future AI features:

- Recommend missions based on RCA.
- Recommend coaching scripts.
- Recommend knowledge articles.
- Summarize outcome movement.
- Explain “why this metric moved.”
- Draft TL coaching conversation.
- Draft manager client update.

### 3.8 Trend forecasting

Add forecast capability:

- KPI forecast EOM
- SLA breach risk forecast
- Revenue/penalty projection
- Repeat-contact trend forecast
- Intervention impact forecast

### 3.9 Client QBR export

Add export capability:

- Outcome summary
- SLA/KPI trend pack
- RCA summary
- Action taken
- Expected impact
- Commercial bridge
- Next-period plan

### 3.10 TL coaching playbooks

Create structured coaching playbooks tied to RCA themes:

- Transfer Avoidance Sprint
- Resolution Confidence Sprint
- Courtesy & Respect refresh
- Clear Next Step checklist
- AHT-quality balance coaching
- Peak adherence reinforcement

### 3.11 Manager action planner

Evolve What-If into a full action planner:

- Select outcome
- Identify driver
- Select target team
- Estimate impact
- Create intervention
- Track action status
- Measure post-action trend

### 3.12 Agent behavior nudges

Add personalized nudges:

- “Confirm next step before closure.”
- “Avoid unnecessary transfer.”
- “Use resolution checklist.”
- “Courtesy score is trending up; keep it going.”
- “Call Resolved is Watch; review the top call-reason guide.”

## 4. Data maturity roadmap

| Level | Name | Description |
|---|---|---|
| Level 1 | Synthetic prototype | Static seed data; no live integration. |
| Level 2 | Historical data pilot | Load 3–6 months of historical KPI, volume, QA, survey and commercial data. |
| Level 3 | Live feeds | Scheduled or near-real-time feeds from source systems. |
| Level 4 | Predictive outcome intelligence | Forecast outcome risk and recommend interventions. |
| Level 5 | Closed-loop action measurement | Track whether missions/coaching/actions actually moved outcomes. |

## 5. Integration roadmap

Potential integrations:

| System | Purpose |
|---|---|
| Centrical | Gamification mechanics, missions, leaderboards, rewards, coaching. |
| WFM | ASA, interval staffing, adherence, capacity stability. |
| QA | Quality Score, defect themes, coaching triggers. |
| LMS | Training modules, PKT status, learning assignments. |
| CRM/contact-centre platform | Call volume, call reason, transfer, AHT, resolution status. |
| Survey platform | CSAT, Courtesy & Respect, Call Resolved. |
| BI/data lake | Unified analytics and historical trends. |
| HR/rewards | Recognition, awards, approved reward fulfilment. |
| Client reporting | QBR packs, SLA reporting, outcome summaries. |

## 6. Pilot plan

### 6.1 Scope

Start with one account and one call-centre process.

Suggested pilot length:

```text
8–12 weeks
```

### 6.2 Baseline period

Use 4–8 weeks of historical baseline:

- AHT
- CSAT
- FCR/Repeat-contact proxy
- Quality
- Courtesy & Respect
- Call Resolved
- Transfer Rate
- ASA and abandonment
- Calls handled
- Revenue and penalty assumptions

### 6.3 Focus outcomes

Start with 2–3 outcomes only:

1. Member Effort Risk
2. Experience Driver Health
3. Access Friction

Do not start with too many outcomes.

### 6.4 Success metrics

Pilot success metrics:

- Adoption: daily/weekly active users.
- Mission acceptance and completion.
- Challenge participation and validation.
- Coaching actions created and closed.
- Week-on-week movement in target KPIs.
- Improvement in selected client outcome indicators.
- Reduction in repeat-contact proxy or transfer friction if data is available.
- Manager/TL satisfaction with actionability.

### 6.5 Governance model

Pilot governance should include:

- Operations owner
- Transformation/product owner
- Data owner
- TL champion group
- Manager/account sponsor
- Client stakeholder if appropriate
- Weekly tuning forum

### 6.6 Data required

Minimum useful data:

- Agent/team hierarchy
- Daily KPI data
- Call volume
- AHT
- CSAT/post-call survey
- QA score
- Schedule adherence/attendance
- Transfer rate
- Call resolved survey response
- Repeat-contact proxy if available
- Commercial/rate-card assumptions

## 7. Risks and mitigations

| Risk | Description | Mitigation |
|---|---|---|
| Agent blame risk | Repeat contacts and FCR can be misused as individual blame metrics. | Use team/process guardrails and avoid agent dollar savings. |
| Overclaiming client metric impact | Star/CAHPS/revenue impact may be overstated. | Use “influence,” “modeled,” and confidence levels. |
| Data quality | Source data may be incomplete or delayed. | Start with limited outcomes and validate data definitions. |
| Adoption risk | Users may not engage with another dashboard. | Use gamified actions, mobile-friendly UX and TL coaching loops. |
| Integration complexity | Multiple systems are needed for production. | Start with flat-file/historical data pilot. |
| Commercial assumptions | Penalty/revenue models may not match contracts. | Calibrate with finance/client contracts before production use. |
| Privacy/compliance | Call/member data may include sensitive information. | Use aggregated metrics, least-privilege access and compliance review. |

## 8. Recommended roadmap phases

### Phase 1 — Prototype hardening

- Finalize demo UX.
- Stabilize Netlify/mobile deployment.
- Ensure documentation and acceptance coverage.
- Keep synthetic data.

### Phase 2 — Historical data pilot

- Load historical data for one account.
- Validate KPI definitions.
- Calibrate RAG thresholds.
- Build initial repeat-contact proxy.
- Validate TL/Manager usefulness.

### Phase 3 — Live operating pilot

- Add scheduled data refresh.
- Run TL coaching board weekly.
- Run Manager outcome review weekly.
- Measure actions and trend movement.

### Phase 4 — Integration / platform decision

Evaluate:

- Can this be configured in Centrical?
- Should it integrate with Centrical?
- Should it become an internal outcome intelligence layer?
- What source systems are required?

### Phase 5 — Predictive and closed-loop intelligence

- Forecast outcome risk.
- Recommend interventions.
- Track whether intervention moved the outcome.
- Generate client-ready QBR insights.

## 9. Executive positioning

Use this line:

> Centrical motivates activity. Performance Arena’s Client Outcome Intelligence layer explains which activity matters, why it matters to the client, and what action will move the business outcome.

Alternative short version:

> Performance Arena is not a gamification product. It is a client outcome operating layer that uses gamification to move the right behaviors.
