# Excel Data Source and Round-Trip Workflow Report

## Files added

- `Performance_Arena_Dataset.xlsx`
- `export_to_excel.py`
- `export_to_json.py`
- `validate_data.py`

## Workbook structure

The workbook contains 37 sheets:

- `README`
- 36 entity sheets matching `window.SEED_DATA` in `data.js`

Entity sheets:

- Users
- Teams
- Processes
- KPI_Master
- Performance_Data
- Daily_Agent_Score
- Agent_Current
- Leaderboard
- Points_Ledger
- XP_Ledger
- Missions
- Mission_Assignments
- Challenges
- Challenge_Participants
- Challenge_Results
- Badges
- Agent_Badges
- Rewards
- Reward_Redemptions
- Communications
- Communication_Status
- Learning_Modules
- Learning_Assignments
- Learning_Completion_Status
- PKT_Assessments
- PKT_Questions
- PKT_Attempts
- SLA_Commercial_Rules
- Penalty_Reward_Slabs
- Commercial_Exposure
- Commercial_Verification
- What_If_Scenarios
- Coaching
- Recognition
- Learning_Points_Rules
- TL_Manager_Verification

## Excel validation added

Excel dropdown validation is applied where useful, including:

- Role
- Status
- RAG status
- Risk level
- Verification status
- KPI direction
- Audience type
- Challenge status
- Reward status

## Round-trip workflow

1. Run `python export_to_excel.py` to regenerate the workbook from `data.js`.
2. Edit `Performance_Arena_Dataset.xlsx` in Excel.
3. Save the workbook.
4. Run `python export_to_json.py` to regenerate `data.js`.
5. Run `python validate_data.py`.
6. Run `node test_prototype.js`.
7. Reset browser localStorage after changing `data.js`.

## Validation result

`python validate_data.py` passes.

## Regression result

`node test_prototype.js` passes with:

```text
140 PASS / 0 FAIL
```

## Guardrails

- Do not change primary IDs unless all dependent sheets are updated.
- Keep TL commercial rows team-scoped.
- Keep Manager commercial rows account-level.
- Keep Manager account penalty higher than each individual TL team penalty.
- Keep active data in USD notation only.
