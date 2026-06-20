# Performance Arena — Demo Walkthrough

## 1. Pre-demo setup

### 1.1 Recommended browser

Use a Chromium-based browser for the cleanest demo:

- Microsoft Edge
- Google Chrome

Safari should be tested separately before any live demo.

### 1.2 Reset state before demo

Use one of the following:

**In-app:**

```text
Agent → Profile → Reset prototype state
```

**Browser console:**

```js
localStorage.removeItem('arena_state_v7'); location.reload();
```

### 1.3 Recommended deployment

For mobile and Teams demos, the most reliable path is static hosting such as Netlify.

The site root must directly contain:

```text
index.html
styles.css
data.js
app-core.js
app-views-agent.js
app-views-lead-mgr.js
app-modals.js
```

### 1.4 Desktop launch

If running locally, double-click `launch_desktop.bat` or run:

```cmd
cd <app-folder>
python -m http.server 5173
```

Then open:

```text
http://localhost:5173/index.html
```

### 1.5 Mobile demo setup

Best path:

1. Deploy to Netlify.
2. Open the Netlify URL on iPhone/Android.
3. Use the phone as the mobile demo device.

### 1.6 Teams demo setup

Recommended setup:

| Device | Role |
|---|---|
| Laptop | Join Teams for audio, camera, speaker notes. |
| Phone | Join same Teams meeting muted and share phone screen. |

Before demo:

- Put phone on Do Not Disturb.
- Mute phone audio in Teams.
- Keep laptop audio active.
- Test the Netlify URL on phone.
- Reset prototype state.

## 2. Opening pitch

Use this senior-leader talk track:

> “Performance Arena is not just gamification. It is a client outcome intelligence layer that uses gamification to move the right behaviors. Agents see what they can control. Team Leads see team patterns and coaching actions. Managers see client outcomes, revenue, penalty exposure and intervention planning.”

Then continue:

> “The operating model is simple: Agent behavior drives team patterns; team patterns influence client outcomes; client outcomes connect to revenue, penalty exposure and avoidable cost. The app makes that line of sight visible.”

## 3. Agent walkthrough

### 3.1 Agent Home

Start as:

```text
Agent / AG001 / Myra Kumar
```

Show:

- Overall Performance Index
- RAG counts
- Arena Points
- Level Progress
- Active mission
- Active challenge

Talk track:

> “For agents, we keep the experience motivational and controllable. Myra sees her performance state, points, progress, missions and challenges. She does not see artificial dollar savings or account-level commercial numbers.”

### 3.2 Overall Performance Index

Explain:

> “This is a weighted performance index across the agent-visible scorecard metrics. Green or Watch counts are based only on the KPIs shown to the agent.”

### 3.3 ASA is not an agent-owned KPI

Say:

> “ASA is intentionally not an agent KPI. ASA is primarily impacted by staffing, forecasting, interval adherence, queue design and capacity planning. It belongs in TL and Manager access/capacity views, not as an individual-agent score.”

### 3.4 Scorecard

Navigate to Scorecard.

Show:

- AHT
- CSAT
- FCR Support
- Quality Score
- Schedule Adherence
- Attendance
- Calls Handled
- Courtesy & Respect
- Call Resolved
- Transfer Rate

Talk track:

> “The agent scorecard focuses on controllable or behavior-supporting metrics. FCR is treated as FCR Support, because repeat calls are influenced by many factors beyond a single agent.”

### 3.5 Points vs Level Progress

Explain:

> “Arena Points are the spendable currency. Level Progress is growth and status progression. Points are for rewards and challenges. Level Progress is not spendable.”

### 3.6 Missions

Show Missions.

Talk track:

> “Missions turn coaching focus into bite-sized actions. A TL can use outcome and RCA insights to launch missions that guide behavior.”

### 3.7 Challenges

Show Challenges.

Talk track:

> “Challenges use points, not XP. When an agent submits a win, it goes to the TL for validation before points are awarded.”

### 3.8 Store

Show Store.

Talk track:

> “The store closes the motivation loop. Agents earn points through good behaviors and can redeem them for rewards.”

### 3.9 Training / PKT

Show Training/PKT.

Talk track:

> “Learning is part of the performance loop. Training and knowledge checks help close skill gaps identified by TLs and managers.”

### 3.10 What not to say in Agent demo

Avoid:

- “Myra saved the client $X.”
- “Myra directly reduced repeat calls by X dollars.”
- “FCR is fully owned by the agent.”
- “ASA is her KPI.”

Use instead:

- “Myra supports first-contact resolution.”
- “Myra follows behaviors that reduce member effort.”
- “Myra contributes to team outcome improvement.”

## 4. Team Lead walkthrough

Switch to:

```text
Team Lead / TL001 / Ayaan Sharma
```

### 4.1 Client Outcomes as focal page

Open TL → Client Outcomes.

Show:

- Member Effort Risk
- Experience Driver Health
- Access Friction
- Capacity Stability
- Outcome RAG
- Primary drivers
- Root-cause themes
- Recommended actions

Talk track:

> “The TL starts from client outcomes, not just agent scores. Ayaan sees which team pattern is moving the client outcome and what coaching action to take.”

### 4.2 SLA/KPI Trends

Open TL → SLA/KPI Trends.

Show:

- Current week vs previous week
- Team-only scope
- KPI trend table
- Trend direction
- RAG
- View RCA / Create action

Talk track:

> “This is where a TL sees whether the team improved or worsened week over week, and which KPI is driving the movement.”

### 4.3 Driving Client Outcomes

Open TL → Driving Client Outcomes.

Show:

- Symptom
- Driver KPIs
- Root-cause themes
- Hotspot agents or groups
- Recommended intervention
- Confidence and guardrail

Talk track:

> “RCA is not for blame. It is a team/process diagnostic. It helps Ayaan choose the right coaching action.”

### 4.4 Team Pulse

Open Team Pulse.

Show:

- Team snapshot
- Team RAG count
- Agent list
- Action buttons

Talk track:

> “Team Pulse gives Ayaan the daily team view: who needs support, who deserves recognition and what the team pattern looks like today.”

### 4.5 Coach Console

Show Coach Console.

Talk track:

> “Coach Console turns outcome intelligence into day-to-day coaching, recognition and reward approvals.”

### 4.6 Missions / Challenges

Show creating an action or challenge.

Talk track:

> “From an outcome or RCA insight, the TL can launch a mission or challenge targeted at the behavior that matters.”

### 4.7 Commercial team-scoped exposure

Open TL Commercial.

Talk track:

> “A TL sees team-scoped exposure only. This is intentionally much lower than account-level exposure and is used to understand the commercial importance of coaching actions.”

## 5. Manager walkthrough

Switch to:

```text
Manager / MGR001 / Anika Mehra
```

### 5.1 Client Outcomes as focal page

Open Manager → Client Outcomes.

Show:

- Account-level outcome scores
- RAG
- WoW movement
- Primary drivers
- Client metrics influenced
- Recommended interventions

Talk track:

> “The Manager view starts with client outcomes. Anika sees the account-level outcome, the KPI drivers, the teams contributing, and the action plan.”

### 5.2 SLA/KPI Trends

Open Manager → SLA/KPI Trends.

Show:

- Account-level current week vs previous week
- Team contribution
- KPI trend table
- RAG and movement

Talk track:

> “This gives the account leader a week-on-week performance narrative. It tells what moved, which team contributed and what needs RCA.”

### 5.3 Driving Client Outcomes

Open Manager → Driving Client Outcomes.

Show:

- Account-level root causes
- Top contributing teams
- Driver KPIs
- Recommended interventions

Talk track:

> “This is the root-cause layer for client conversations. It moves the discussion from ‘the KPI is amber’ to ‘this is why the outcome is moving and what we will do about it.’”

### 5.4 Revenue & Commercial

Open Revenue & Commercial.

Show:

- Total Billable Calls MTD
- Rate per Call
- Total Revenue MTD
- Penalty Exposure
- Penalty as % of Revenue
- Reward Opportunity
- Net Commercial Impact
- Client Value Bridge

Talk track:

> “Revenue is modeled as billable calls times rate per call. Penalty exposure is kept below five percent of modeled revenue for demo credibility. This lets managers discuss client value, not just SLA color.”

### 5.5 What-If / Action Planner

Open What-If.

Show:

- KPI selection
- Improvement assumption
- Projected commercial impact
- Create recovery mission/action

Talk track:

> “What-If turns the dashboard into an action planner. The manager can model an improvement and create a recovery intervention.”

### 5.6 Team Comparison

Show Team Comparison.

Talk track:

> “This helps managers identify which teams contribute most to outcome risk or improvement.”

### 5.7 Adoption

Show Adoption.

Talk track:

> “The platform also measures itself: mission uptake, challenge participation, learning completion and engagement.”

## 6. Key wow moments

1. **Business Outcomes as separate section**  
   TL and Manager have dedicated Client Outcomes views.

2. **RCA from client metric to root cause**  
   Outcome → symptom → driver KPI → root-cause theme → intervention.

3. **SLA/KPI Trends**  
   Week-on-week trend for TL team and Manager account.

4. **RAG click filtering**  
   Green/Watch/Critical counts filter to matching details.

5. **Manager revenue and penalty %**  
   Revenue MTD and penalty as percentage of revenue are visible.

6. **TL penalty much lower than Manager exposure**  
   Demonstrates correct scope.

7. **Challenge win goes to TL validation**  
   Points are awarded only after TL validation.

## 7. Demo warnings

Do not overclaim:

- Star Rating impact.
- Direct agent dollar savings.
- FCR as fully agent-owned.
- Repeat contacts as purely agent-caused.
- RCA as production-ready statistical causation.

Say instead:

- “This influences client outcomes.”
- “This is a modeled indicator.”
- “This is team/process diagnostic intelligence.”
- “This should be calibrated with client data in a pilot.”

## 8. Leadership questions and answers

### Q1. How is this different from Centrical?

**Answer:** Centrical is strong at gamification and engagement mechanics. Performance Arena is positioned as a Client Outcome Intelligence layer. It explains which behaviors matter, why they matter to the client and what action should move the outcome. It can complement Centrical rather than replace it.

### Q2. Is this replacing Centrical?

**Answer:** Not necessarily. The prototype should be treated as a business-outcome design blueprint. If Centrical can support these outcome models, it could be integrated/configured. If not, this becomes an extension layer.

### Q3. How are revenue and penalty numbers calculated?

**Answer:** Revenue is modeled as billable calls multiplied by rate per call. Penalty exposure is a modeled risk tied to SLA/KPI performance and capped below five percent of modeled revenue for demo credibility. Production would require client-specific contracts and rate cards.

### Q4. Why is ASA not an agent KPI?

**Answer:** ASA is mainly driven by staffing, interval management, forecasting, queue design and capacity planning. It belongs in TL and Manager access/capacity views, not as a direct individual-agent score.

### Q5. Why not show dollar savings to agents?

**Answer:** It can feel artificial and unfair. Agents influence behaviors that support outcomes, but commercial impact is a team/account model. Dollars are better used in TL and Manager views.

### Q6. Is RCA real?

**Answer:** In this prototype, RCA is modeled/synthetic. It demonstrates the intended operating model. In production, it should be calibrated with call reason, repeat-contact, QA, survey, WFM and CRM data.

### Q7. Can this integrate with live data?

**Answer:** Yes. The static prototype uses `data.js`, but the same model can be connected to PMS, WFM, QA, LMS, CRM/contact-center and BI/data-lake feeds.

### Q8. What would a pilot look like?

**Answer:** One account, 8–12 weeks, using historical baseline and then live feeds. Focus on a few outcomes such as Member Effort, Experience Driver Health and Access Friction. Measure adoption, coaching action closure, KPI movement and client outcome movement.
