# Performance Arena — Data Model and Metrics

## 1. Data model overview

The prototype uses a static seed dataset in `data.js`.

`data.js` exposes:

```js
window.SEED_DATA = { ... }
```

The data model is broad enough to support:

- Users, teams and processes
- KPI scorecards
- Daily performance and current agent snapshots
- Leaderboards
- Points and Level Progress ledgers
- Missions and mission progress
- Challenges and validation
- Badges
- Rewards and redemptions
- Communications/broadcasts
- Learning modules and PKTs
- SLA/commercial rules
- Commercial exposure
- What-if scenarios
- Coaching and recognition
- TL/Manager validation

## 2. Call-centre KPI model

The approved demo-facing call-centre KPI model is:

| KPI | Primary role visibility | Direction | Notes |
|---|---|---|---|
| ASA | TL / Manager | Lower is better | Access/capacity signal. Not an Agent-owned KPI. |
| AHT | Agent / TL / Manager | Lower is better | Efficiency metric; must be balanced with quality and resolution. |
| CSAT | Agent / TL / Manager | Higher is better | Member/customer satisfaction signal. |
| FCR Support / First Contact Support | Agent / TL / Manager | Higher is better | Agent supports first-contact resolution, but repeat calls are not purely agent-owned. |
| Quality Score | Agent / TL / Manager | Higher is better | QA/interaction quality signal. |
| Schedule Adherence | Agent / TL / Manager | Higher is better | Agent controllable within schedule, but capacity impact is TL/Manager. |
| Attendance | Agent / TL / Manager | Higher is better | Workforce reliability signal. |
| Call Abandonment | TL / Manager | Lower is better | Access/capacity signal, not an agent-owned KPI. |
| Calls Handled | Agent / TL / Manager | Higher is better | Replaces Productivity label for call-centre clarity. |
| Courtesy & Respect | Agent / TL / Manager | Higher is better | Post-call survey / customer experience behavior signal. |
| Call Resolved | Agent / TL / Manager | Higher is better | Post-call survey / resolution confidence signal. |
| Transfer Rate | Agent / TL / Manager | Lower is better | Member effort / routing friction signal. |

## 3. Removed or excluded KPIs

The following are removed from visible demo scorecards and trend pages:

- Claims Accuracy
- Compliance Score
- Claims Back Office metrics
- Claims Back Office terminology
- TAT Adherence if presented as claims/back-office TAT
- Productivity as a KPI label

Productivity has been replaced with **Calls Handled**.

ASA and Call Abandonment remain visible in TL/Manager access/capacity views but are not agent-owned scorecard metrics.

## 4. Role ownership of metrics

| Metric | Agent | Team Lead | Manager | Notes |
|---|---|---|---|---|
| ASA | No | Yes | Yes | Capacity/access planning metric. Driven by staffing, forecasting, interval and queue design. |
| AHT | Yes | Yes | Yes | Agent can influence handling efficiency; must be balanced with quality/resolution. |
| CSAT | Yes | Yes | Yes | Agent influence exists, but broader process and policy factors also matter. |
| FCR Support | Behavior support | Team pattern | Outcome driver | Do not treat repeat calls as purely agent-owned. |
| Quality Score | Yes | Yes | Yes | Used for interaction quality, coaching and experience driver health. |
| Schedule Adherence | Yes | Yes | Yes | Agent controllable behavior; TL/Manager use it for capacity/access impact. |
| Attendance | Yes | Yes | Yes | Workforce reliability. |
| Call Abandonment | No | Yes | Yes | Access/capacity signal. Not an agent-owned KPI. |
| Calls Handled | Yes | Yes | Yes | Volume/throughput; should be balanced with quality. |
| Courtesy & Respect | Yes | Yes | Yes | Post-call survey / member experience signal. |
| Call Resolved | Yes | Yes | Yes | Post-call survey / resolution signal. |
| Transfer Rate | Yes | Yes | Yes | Agent can influence avoidable transfers, but routing/process also matters. |
| Repeat Contact Risk | No direct blame | Yes | Yes | Team/process indicator. |
| Repeat Contact Leakage | No | Optional summary | Yes | Manager-level modeled avoidable cost indicator. |
| Revenue MTD | No | No or limited | Yes | Manager/account commercial view. |
| Penalty Exposure | No | Team-scoped | Account-level | TL exposure is intentionally low and team-scoped. |

## 5. RAG logic

### 5.1 RAG states

| RAG | Demo wording | Meaning |
|---|---|---|
| Green | On Target | Metric is healthy / meeting target. |
| Amber | Watch | Metric requires attention. |
| Red | Critical | Metric requires immediate intervention. |

### 5.2 Direction-aware interpretation

Some metrics are higher-is-better, others are lower-is-better.

Examples:

- Higher is better: CSAT, Quality Score, Schedule Adherence, Attendance, Calls Handled, Courtesy & Respect, Call Resolved, FCR Support.
- Lower is better: ASA, AHT, Call Abandonment, Transfer Rate.

### 5.3 RAG count derivation

RAG counts must be derived from the same metric rows shown in the detail view.

| Role | RAG count source |
|---|---|
| Agent | Visible agent scorecard metrics only. ASA and abandonment excluded. |
| Team Lead | TL team-level metric set. ASA and abandonment may be included. |
| Manager | Account-level KPI roll-up. ASA and abandonment may be included. |

### 5.4 Clickable RAG filters

Expected behavior:

- Clicking Green filters to Green metrics.
- Clicking Amber/Watch filters to Amber metrics.
- Clicking Red/Critical filters to Red metrics.
- Active filter should be visible.
- Show all/reset should restore all metrics.

## 6. Business Outcome layer

### 6.1 Member Effort Risk

**Definition:**  
A modeled indicator of how much effort members may be experiencing when trying to resolve issues.

**Inputs may include:**

- Repeat Contact Risk
- Call Resolved
- Transfer Rate
- CSAT
- Unclear next-step themes
- Escalations if available

**Why it matters:**  
High member effort creates friction, can increase repeat contacts and can weaken customer service experience.

**Role usage:**

| Role | Usage |
|---|---|
| Agent | Behavior focus: confirm resolution, clarify next steps, avoid unnecessary transfers. |
| TL | Identify team patterns and coaching opportunities. |
| Manager | Diagnose account-level experience friction and intervention priorities. |

**Guardrail:**  
Member Effort Risk is a modeled indicator. It should not be used as a standalone individual-agent blame metric.

### 6.2 Repeat Contact Risk / Repeat Contact Leakage

**Definition:**  
Repeat Contact Risk estimates the likelihood or level of members contacting again for the same or related issue within a defined window. Repeat Contact Leakage translates excess repeat contacts into modeled avoidable client cost, usually at Manager level.

**Inputs may include:**

- Repeat-contact rate, if available
- FCR Support
- Call Resolved
- Transfer Rate
- Call reason / root cause themes
- Quality defects
- CSAT

**Formula concept:**

```text
Expected repeat contacts = Total contacts × target repeat-contact rate
Excess repeat contacts = Actual repeat contacts - Expected repeat contacts
Modeled leakage = Excess repeat contacts × estimated cost per contact
```

**Why it matters:**  
Repeat contacts increase member effort, queue load and cost-to-serve.

**Guardrail:**  
Repeat contact is influenced by agent behavior, process, systems, benefits complexity, pending cases, policy rules and member behavior. It should be interpreted at team/process/account level unless validated at individual level.

### 6.3 Access Friction

**Definition:**  
A modeled indicator of how difficult it is for members to reach the right support at the right time.

**Inputs may include:**

- ASA
- Call Abandonment
- Schedule Adherence
- Queue stability
- Transfer/routing friction
- Peak interval risk

**Why it matters:**  
Access friction affects member experience, queue stability and service-level performance.

**Role usage:**

- Agent: schedule adherence and readiness behaviors.
- TL: interval adherence and team coverage.
- Manager: staffing, capacity planning and access strategy.

### 6.4 Experience Driver Health

**Definition:**  
A roll-up of operational KPIs that influence member/customer experience.

**Inputs:**

- CSAT
- Courtesy & Respect
- Quality Score
- Call Resolved
- Transfer Rate where applicable

**Why it matters:**  
Health plans and clients often track customer service, satisfaction, complaints and experience indicators. This outcome gives the operations team a forward-looking operating view.

**Guardrail:**  
It indicates operational drivers of experience. It is not a direct Star Rating formula.

### 6.5 Capacity Stability

**Definition:**  
A modeled indicator of whether the operation has enough stable capacity to handle call volume and maintain SLA/access performance.

**Inputs:**

- Calls Handled
- AHT
- Call volume
- Schedule Adherence
- Attendance
- ASA / abandonment at TL/Manager level

**Why it matters:**  
Capacity instability can create queues, abandonment, higher wait times and pressure on quality.

### 6.6 Revenue & Commercial

**Revenue formula:**

```text
Revenue MTD = Billable Calls × Rate per Call
```

**Commercial fields:**

- Billable Calls MTD
- Rate per Call
- Revenue MTD
- Penalty Exposure
- Penalty as % of Revenue
- Reward Opportunity
- Net Commercial Impact
- Client Value Bridge

**Business rules in the prototype:**

- Manager sees account-level revenue and penalty.
- TL sees team-scoped exposure.
- Overall account penalty exposure should not exceed 5% of modeled revenue.
- TL penalty exposure should be less than 10% of Manager account penalty for demo credibility.

## 7. Commercial model

### 7.1 Manager account revenue

Manager revenue is modeled as:

```text
Billable Calls MTD × Rate per Call
```

The latest package’s verification report cites:

- Manager modeled revenue: about `$1.82M`
- Manager account penalty: about `$57.7K`
- Penalty as % revenue: about `3.17%`

### 7.2 TL penalty exposure

TL exposure is team-scoped and intentionally much lower than Manager/account exposure. The latest verification report cites team exposures between about 3.0% and 5.5% of Manager penalty.

### 7.3 Account-level vs team-scoped exposure

| Field | TL | Manager |
|---|---|---|
| Scope | One team | Whole account |
| Purpose | Coaching and team focus | Executive/client conversation |
| Scale | Intentionally low | Meaningful account-level exposure |
| Label | Team-scoped exposure | Account-level exposure |

## 8. Metric definition tooltips

Each modeled or potentially misunderstood metric should have a visible question-mark definition. Definitions should include:

- What it means
- Inputs
- Why it matters
- How to use it
- Confidence / guardrail

Metrics requiring definitions:

| Metric | Tooltip emphasis |
|---|---|
| Member Effort Risk | Team/process indicator, not agent blame. |
| Repeat Contact Risk | Repeat contacts are multi-factor. |
| Access Friction | Driven by capacity, staffing, queue and adherence. |
| Experience Driver Health | Operational driver, not direct Star Rating formula. |
| Capacity Stability | Volume/capacity indicator. |
| Revenue MTD | Billable calls multiplied by rate per call. |
| Penalty Exposure | Modeled commercial risk. |
| Penalty % of Revenue | Penalty divided by modeled revenue. |
| RAG Status | Green/Watch/Critical status. |
| FCR Support | Supports first-contact resolution, not full ownership. |
| Courtesy & Respect | Survey/experience signal. |
| Call Resolved | Survey/resolution confidence signal. |
| Transfer Rate | Lower transfer rate reduces member effort if transfer is avoidable. |

## 9. Assumptions

The prototype includes the following assumptions:

- Data is synthetic.
- Volumes are synthetic.
- Rate per call is a demo assumption.
- Revenue is modeled, not actual finance data.
- Penalty exposure is modeled and capped for demo credibility.
- Repeat-contact and rework leakage are modeled indicators.
- RCA themes are synthetic.
- Trend movement is synthetic.
- Confidence/guardrail language is used to avoid overclaiming.
- Production use requires calibration with client data, contracts, CRM, WFM, QA, survey and contact-center feeds.

---

## Excel-first workbook source

The data model can now be exported to and edited in `Performance_Arena_Dataset.xlsx`. Each workbook sheet maps one-to-one to an entity in `window.SEED_DATA` inside `data.js`.

### Round-trip commands

```cmd
python export_to_excel.py
python export_to_json.py
python validate_data.py
node test_prototype.js
```

The workbook README documents each sheet's purpose, editable fields, generated/calculated fields, and linked ID guardrails. Several categorical columns include Excel dropdown validation, including role, RAG status, risk level, direction, audience type, challenge status, reward status, and verification status.

### Validation rules

`validate_data.py` checks:

- Agents and TLs have TeamID and ProcessID.
- Teams have TeamLeadID and ManagerID.
- KPI and User references in Performance_Data exist.
- Challenge participants and mission assignments reference valid users.
- TL commercial rows map to the TL's own TeamID.
- Manager commercial rows are account-level.
- Manager account penalty is greater than individual TL team penalties.
- INR/Indian currency markers are absent from active data.
