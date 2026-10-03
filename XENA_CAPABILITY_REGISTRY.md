# XENA_CAPABILITY_REGISTRY.md

**Version:** 1.0  
**Role:** Authoritative capability registry  
**Companion documents:** `XENA_IDENTITY.md`, `XENA_SYSTEM_PROMPT.md`  
**Status:** Foundational specification — requires codebase verification

---

# 1. Purpose

This document is the authoritative registry for what Xena AI can, cannot, and is intended to do.

Its primary purpose is to prevent a critical product failure:

> **Xena must never present a planned, assumed, partially implemented, or unverified capability as a verified working capability.**

This registry distinguishes product vision from implementation reality.

It should be updated whenever a capability is:

- implemented;
- tested;
- verified;
- changed;
- removed;
- replaced;
- discovered to be unavailable.

The registry is designed to be used by:

- developers;
- AI agents working on the codebase;
- product architects;
- testers;
- future system-prompt updates;
- feature-integration workflows.

---

# 2. Status Vocabulary

Every capability must have one of the following statuses.

## `VERIFIED`

The capability exists and has been tested sufficiently to confirm that it works in the current application.

Evidence should include:

- relevant implementation;
- successful runtime test;
- expected output;
- absence of known critical defects.

---

## `IMPLEMENTED_BUT_UNVERIFIED`

The capability appears to exist in the codebase, but there is not enough evidence to call it verified.

Examples:

- code exists but has not been tested end-to-end;
- UI exists but backend integration is uncertain;
- backend endpoint exists but current frontend integration is uncertain.

---

## `PLANNED`

The capability is part of the intended product design but is not confirmed as implemented.

A planned capability must never be described to a user as currently available.

---

## `UNCERTAIN`

Available evidence is insufficient to determine the current state.

Use:

```text
UNKNOWN
```

or:

```text
REQUIRES_CODEBASE_VERIFICATION
```

when appropriate.

---

# 3. Verification Rules

A capability should only become `VERIFIED` when all relevant layers have been checked.

Depending on the capability, verification may include:

1. UI exists;
2. user interaction works;
3. intent is correctly detected;
4. required parameters are extracted;
5. backend/tool is called correctly;
6. operation succeeds;
7. data is persisted correctly;
8. retrieved state is correct;
9. errors are handled;
10. user-facing confirmation matches the actual result.

A UI button alone does not prove a capability is verified.

A backend endpoint alone does not prove a capability is verified.

A generated AI response alone does not prove that an application action occurred.

---

# 4. Important Scope Rule

This registry is based on the known Xena product design and development history.

Where the current source code has not been inspected, the registry must **not invent implementation details**.

Such details must be marked:

`REQUIRES_CODEBASE_VERIFICATION`

This is intentional.

---

# 5. Capability Overview

| ID | Capability | Current status |
|---|---|---|
| XENA-CONV-001 | General Conversational Intelligence | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-CONV-002 | Identity / Capability Questions | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-CONV-003 | Contextual Conversation Continuity | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-CONV-004 | Intent Detection and Routing | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-CONV-005 | Natural-Language Action Extraction | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-CONV-006 | Multilingual Interaction | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-REM-001 | Reminder Creation | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-REM-002 | Reminder Editing | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-REM-003 | Reminder Deletion | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-REM-004 | Reminder Retrieval | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-REM-005 | Reminder Notification / Triggering | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-EVT-001 | Event Creation | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-EVT-002 | Event Editing | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-EVT-003 | Event Deletion | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-EVT-004 | Event Retrieval | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-STU-001 | Study Tracking Configuration | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-STU-002 | Personalized Study Plan Generation | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-PLAN-001 | Constraint-Aware Daily Planning | VERIFIED |
| XENA-PLAN-002 | Generated Plan Persistence & Timeline Storage | VERIFIED |
| XENA-PLAN-003 | Scheduling Conflict Detection & Protection | VERIFIED |
| XENA-PLAN-004 | Clean Task List Presentation (Names Only) | VERIFIED |
| XENA-CTX-001 | Profile Identity Retrieval & Academic Background | VERIFIED |
| XENA-CTX-002 | AI Memory Relationship Lookup & Fact Search | VERIFIED |
| XENA-CTX-003 | My Organizer Unified Context Integration | VERIFIED |
| XENA-CTX-004 | Cross-Source Personal Context Reasoning | VERIFIED |
| XENA-CTX-005 | Evidence Provenance Tracking & Missing Data Handling | VERIFIED |
| XENA-CTX-006 | Grounded Local Fallback Context Response Engine | VERIFIED |
| XENA-CTX-007 | Multimodal Shared Context (Chat, Live Voice, STT) | VERIFIED |
| XENA-CTX-008 | User Session Data Isolation & Strict Privacy | VERIFIED |
| XENA-VAULT-001 | Vault Memory Saving | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-VAULT-002 | Vault Memory Retrieval | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-VAULT-003 | Vault Memory Management | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-ITEM-001 | My Items Retrieval | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-ITEM-002 | My Items Editing | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-ITEM-003 | My Items Deletion | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-VOICE-001 | Voice Input / Transcription | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-VOICE-002 | Semantic Voice Correction | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-VOICE-003 | Voice Response / TTS | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-VOICE-004 | Conversational Voice Mode | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-ACAD-001 | Academic Assistance | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-APP-001 | Application Guidance | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-APP-002 | External App Launching | PLANNED |
| XENA-AUTH-001 | User Authentication | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-AUTH-002 | User Session Management | IMPLEMENTED_BUT_UNVERIFIED |
| XENA-DATA-001 | Per-User Data Isolation | REQUIRES_CODEBASE_VERIFICATION |
| XENA-DATA-002 | Persistent Cloud Data | REQUIRES_CODEBASE_VERIFICATION |

These statuses are intentionally conservative. They must be updated after codebase inspection and runtime testing.

---

# 6. Conversation and Intelligence

## XENA-CONV-001 — General Conversational Intelligence

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Allow Xena to hold natural conversations that are not application actions.

### Problem solved

Students should be able to interact naturally with Xena without every message being interpreted as a productivity command.

### Supported interactions

Examples:

- greetings;
- casual conversation;
- general questions;
- short personal statements;
- follow-up discussion.

### Inputs

Natural-language text or supported voice transcription.

### Outputs

Natural-language response.

### Required information

No fixed parameters.

### Dependencies

- conversational AI model;
- message processing;
- conversation context.

### Authorization

No persistent action authorization required for ordinary conversation.

### Constraints

Must not invoke unrelated tools.

### Failure scenarios

- model unavailable;
- network/API failure;
- invalid conversation state;
- timeout.

### Verification requirements

Test:

> Good evening Xena, how are you?

Expected:

Natural response without reminder/event/study/Vault operations.

---

# 7. Identity and Capability Questions

## XENA-CONV-002 — Identity / Capability Questions

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Answer questions about Xena's identity, role, purpose, and capabilities.

### Examples

- Who are you?
- What is Xena?
- What can you do?
- Can you create reminders?

### Critical constraint

Capability questions must not authorize execution.

### Dependencies

- `XENA_IDENTITY.md`;
- runtime system prompt;
- capability registry.

### Verification

Test:

> Can you create reminders?

Expected:

Capability explanation, no reminder creation.

---

# 8. Contextual Conversation Continuity

## XENA-CONV-003 — Contextual Conversation Continuity

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Allow Xena to understand references to recent conversation.

### Examples

- “that reminder”
- “the event I just told you”
- “change it”
- “save what I just said”

### Inputs

Current message + relevant conversation state.

### Outputs

Resolved interpretation.

### Constraints

Must not use unrelated old context.

### Failure scenarios

- ambiguous reference;
- stale context;
- context overflow;
- wrong object resolution.

### Verification

Create multiple recent objects and test references such as:

> Change that reminder to 5 PM.

---

# 9. Intent Detection and Routing

## XENA-CONV-004 — Intent Detection and Routing

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Determine whether a message is:

- conversation;
- question;
- information;
- reminder action;
- event action;
- study planning action;
- Vault action;
- retrieval;
- edit;
- deletion;
- continuation;
- correction.

### Dependencies

AI model and/or application intent router.

### Critical constraint

Keyword matching alone is insufficient.

### Verification

Test capability questions against actual action requests.

---

# 10. Natural-Language Action Extraction

## XENA-CONV-005 — Natural-Language Action Extraction

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Convert natural-language action requests into structured parameters.

### Example

Input:

> Hello Xena, please create me a reminder to study CSC305 at 3 PM.

Expected semantic extraction:

```text
intent = CREATE_REMINDER
task = Study CSC305
time = 15:00
```

### Constraints

Do not store conversational wrappers as task titles.

Do not invent missing parameters.

---

# 11. Multilingual Interaction

## XENA-CONV-006 — Multilingual Interaction

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Allow users to interact in supported languages.

### Known behavior

Xena should adapt to the user's language.

### Example

French:

> Rappelle-moi d'étudier CSC305 à 15h.

Expected semantic meaning:

```text
CREATE_REMINDER
Study CSC305
15:00
```

### Verification

Test English, French, and mixed-language messages.

---

# 12. Reminder Management

## XENA-REM-001 — Reminder Creation

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Create scheduled reminders from natural-language or manual input.

### Problem

Students need actionable reminders without manually managing separate systems.

### Supported interactions

- create reminder by text;
- create reminder by voice;
- specify date;
- specify time;
- specify repeat where supported;
- specify priority where supported;
- specify notification mode where supported.

### Required information

At minimum, according to the current product design:

- reminder/task content;
- required scheduling information.

Exact required fields must be verified against the actual implementation.

### Outputs

Created reminder object and confirmation.

### Critical constraints

- preserve AM/PM;
- preserve exact date;
- preserve exact task;
- do not invent missing fields;
- do not reuse stale payloads.

### Failure scenarios

- missing time;
- missing task;
- invalid date;
- notification failure;
- backend failure;
- duplicate/conflicting reminder;
- persistence failure.

---

## XENA-REM-002 — Reminder Editing

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Modify an existing reminder.

### Examples

- change time;
- change title;
- change date;
- change repeat;
- change notification behavior where supported.

### Required information

Target reminder + fields to change.

### Failure scenarios

- ambiguous target;
- reminder not found;
- unsupported field;
- persistence failure.

---

## XENA-REM-003 — Reminder Deletion

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Delete a reminder.

### Required information

Reliable target identifier or unambiguous contextual reference.

### Critical constraint

Never delete an arbitrary reminder.

---

## XENA-REM-004 — Reminder Retrieval

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Retrieve reminders.

### Examples

- reminders today;
- upcoming reminders;
- specific reminder.

### Output

Only records actually returned by the application.

### Failure distinction

`NO_RECORDS` ≠ `RETRIEVAL_FAILURE`.

---

## XENA-REM-005 — Reminder Notification / Triggering

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Trigger reminder notifications at configured times.

### Product requirement

Reminder behavior should follow the configured schedule and should not trigger merely because the user logs in or opens the app.

### Dependencies

Notification infrastructure, scheduling mechanism, device permissions, and/or backend scheduling.

### Requires codebase verification

Exact implementation is unknown.

---

# 13. Event Management

## XENA-EVT-001 — Event Creation

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Create calendar-style events distinct from reminders.

### Example

> Save my Majestical Night event for Sunday at 3 PM.

### Constraints

Must not automatically become a reminder solely because a time is present.

---

## XENA-EVT-002 — Event Editing

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Modify existing events.

### Examples

- move date;
- change time;
- change event title.

### Failure scenarios

- ambiguous target;
- event not found;
- persistence failure.

---

## XENA-EVT-003 — Event Deletion

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Delete existing events.

### Constraint

Target must be unambiguous.

---

## XENA-EVT-004 — Event Retrieval

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Retrieve saved events.

### Examples

- today's events;
- upcoming events;
- a specific event.

---

# 14. Study Tracking

## XENA-STU-001 — Study Tracking Configuration

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Collect student academic planning inputs.

### Known inputs

- normal exam session period;
- continuous assessment period;
- subjects;
- percentage representing current ability/confidence/mastery;
- available study time per day.

### Important distinction

This is configuration/input collection.

It is not automatically the generated study plan.

### Verification

Confirm all fields persist correctly and remain associated with the correct student.

---

## XENA-STU-002 — Personalized Study Plan Generation

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Generate a personalized study timetable based on student context.

### Expected behavior

If:

```text
CSC305 = 30%
Java = 60%
Database = 75%
```

and the user has limited study time, the system should generally allocate more study attention to weaker subjects while still covering all relevant subjects.

### Inputs

- study tracking configuration;
- available study time;
- academic periods;
- subject mastery/confidence;
- explicit planning request.

### Outputs

Generated study plan.

### Constraints

- respect available study time;
- preserve durations;
- do not invent study time;
- distinguish plan from ordinary tasks.

### Verification

Use controlled subjects with deliberately different mastery percentages and inspect generated allocation.

---

# 15. Daily Planning & Constraint-Aware Scheduling

## XENA-PLAN-001 — Constraint-Aware Daily Planning

**Status:** `VERIFIED`

### Purpose
Organize daily activities into a valid, non-overlapping chronological schedule strictly respecting user-specified start times, activity durations, deadlines, and task priorities.

### Implemented Model & Rules
- **Fixed-Time Constraints**: Explicit start times (e.g. 6:48 AM, 3 PM) are hard constraints and are placed at their exact requested clock times.
- **Duration Preservation**: Requested durations (e.g. 1h, 2h, 45 mins, 90 mins) are strictly preserved without truncation or rounding.
- **Flexible Activities**: Tasks without fixed times are scheduled into feasible open windows around fixed commitments.
- **Deadline Handling**: Tasks with deadlines (e.g. "finish assignment before 5 PM") are placed in open periods ending prior to the deadline.
- **Priority-Guided Placement**: Higher-priority flexible tasks receive preferred placement without overriding hard constraints.

### Inputs
- Natural language query (text/speech in English or French) or structured task array.
- Target planning date (YYYY-MM-DD).

### Outputs
- Chronologically sorted array of `ScheduleTimeBlock` objects containing exact start/end times, durations, titles, and priorities.

---

## XENA-PLAN-002 — Generated Plan Persistence & Timeline Storage

**Status:** `VERIFIED`

### Purpose
Persist generated daily plans and time blocks into the database (`db.json`) under the user's isolated profile, generating notification ledger history and enabling retrieval through My Items and Planning views.

### Constraints
- Never confirm persistence unless the database record is successfully created.

---

## XENA-PLAN-003 — Scheduling Conflict Detection & Protection

**Status:** `VERIFIED`

### Purpose
Detect overlapping hard constraints (e.g., studying 8–11 AM and a meeting at 10 AM, or collisions with existing calendar events) before saving to the database.

### Behavior
- Aborts invalid persistence and returns a clear, actionable explanation of the conflict with a clarification prompt to the user.

---

## XENA-PLAN-004 — Clean Task List Presentation (Names Only)

**Status:** `VERIFIED`

### Purpose
Display generated daily plans in the user interface and chat summaries with clean task titles only (e.g., `- Dance`, `- Exercise`, `- Study`), without repeating redundant time ranges beside each task, while preserving full timing coordinates internally and in detailed audit views.

---

# 16. Vault Memory

## XENA-VAULT-001 — Vault Memory Saving

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Allow users to explicitly save information they want Xena to keep.

### Explicit signal

The product defines `Vault` as an explicit save signal.

Example:

> Vault: my favorite programming language is Python.

### Expected behavior

Save the meaningful user information, not merely the word `Vault`.

### Output

Verified save confirmation.

### Failure scenarios

- persistence failure;
- missing user identity;
- unavailable Vault capability.

---

## XENA-VAULT-002 — Vault Memory Retrieval

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Retrieve relevant information previously saved in Vault.

### Example

> What is my favorite programming language?

### Constraints

Only return data belonging to the current user.

---

## XENA-VAULT-003 — Vault Memory Management

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Allow supported editing/deletion/organization of Vault information.

### Exact supported operations

`REQUIRES_CODEBASE_VERIFICATION`

Do not assume every CRUD operation is implemented.

---

# 17. My Items

## XENA-ITEM-001 — My Items Retrieval

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Provide access to persisted user-created items.

Potential categories include:

- reminders;
- events;
- plans;
- Vault Memory;
- other supported items.

### Constraint

Only show records actually associated with the current user.

---

## XENA-ITEM-002 — My Items Editing

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Edit supported persisted items.

### Constraint

Actual editable item types must be verified against the codebase.

---

## XENA-ITEM-003 — My Items Deletion

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Delete supported persisted items.

### Constraint

Target must be reliably identified.

---

# 18. Voice

## XENA-VOICE-001 — Voice Input / Transcription

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Convert user speech into text usable by Xena.

### Expected behavior

After recording:

1. recording ends;
2. transcription completes;
3. semantic processing occurs;
4. user can submit the resulting request.

### Known UX requirements

- microphone permission should be handled clearly;
- transcription state should end when transcription is complete;
- send action should become available;
- mobile should not rely on desktop keyboard instructions.

### Exact provider

`REQUIRES_CODEBASE_VERIFICATION`

---

## XENA-VOICE-002 — Semantic Voice Correction

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Correct likely transcription errors using semantic/contextual information.

### Examples

- `CEE-305` → `CSC305` when context strongly supports it;
- `Volts` → `Vault` when the user clearly refers to the Vault feature.

### Constraint

Critical ambiguity must be clarified rather than guessed.

---

## XENA-VOICE-003 — Voice Response / TTS

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Convert Xena responses into spoken output.

### Requirements

- natural speech;
- concise voice responses;
- same factual result as text;
- no invented result.

### Provider

`REQUIRES_CODEBASE_VERIFICATION`

---

## XENA-VOICE-004 — Conversational Voice Mode

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Allow natural spoken conversation with Xena.

### Expected flow

```text
User speaks
→ transcription
→ intent/semantic understanding
→ response generation
→ TTS
→ spoken response
```

### Performance requirement

Avoid unnecessary parser/tool calls for general conversation.

### Verification

Measure:

```text
speech end
→ transcription
→ AI request
→ first token/response
→ TTS start
→ first audio
```

---

# 19. Academic Assistance

## XENA-ACAD-001 — Academic Assistance

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Help students understand academic concepts and coursework.

### Examples

- explain programming concepts;
- explain algorithms;
- explain code;
- answer educational questions;
- provide learning guidance.

### Constraints

Academic assistance should not automatically create reminders or study plans.

### Verification

Test direct educational questions without any productivity action.

---

# 20. Application Guidance

## XENA-APP-001 — Application Guidance

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Help users understand how to use Xena.

### Examples

- where reminders are stored;
- how Vault works;
- how to create an event;
- how to access Study Tracking.

### Constraint

Only describe UI/capabilities verified in the current application.

---

# 21. External App Launching

## XENA-APP-002 — External App Launching

**Status:** `PLANNED`

### Product vision

Xena may eventually be able to open selected mobile applications in connection with reminders or study sessions, subject to operating-system permissions and implementation.

### Current registry rule

Do not claim this capability is currently available.

### Required verification before changing status

- Android implementation;
- app-launch permissions/intent behavior;
- selected-app configuration;
- security model;
- foreground/background restrictions;
- actual device test.

---

# 22. Authentication

## XENA-AUTH-001 — User Authentication

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Allow users to:

- create an account;
- log in;
- log out;
- maintain an authenticated identity.

### Current product direction

Authentication has been designed as part of the Xena architecture.

### Exact implementation

`REQUIRES_CODEBASE_VERIFICATION`

### Verification

Test:

1. account creation;
2. login;
3. logout;
4. invalid credentials;
5. session persistence;
6. account separation.

---

## XENA-AUTH-002 — User Session Management

**Status:** `IMPLEMENTED_BUT_UNVERIFIED`

### Purpose

Maintain the authenticated user's session.

### Requirements

- correct user identity;
- session persistence where intended;
- logout invalidation;
- correct association of application data.

### Verification

Switch between users and confirm that data does not cross accounts.

---

# 23. Per-User Data Isolation

## XENA-DATA-001 — Per-User Data Isolation

**Status:** `REQUIRES_CODEBASE_VERIFICATION`

### Purpose

Ensure user A cannot access user B's persisted data.

### Data that must be isolated

- reminders;
- events;
- plans;
- Vault Memory;
- profile information;
- conversations where persisted;
- future user-specific records.

### Criticality

This is a security requirement, not merely a feature.

### Required verification

Create at least two test users.

Verify:

```text
User A → only A's data
User B → only B's data
```

Test both reads and writes.

---

# 24. Persistent Cloud Data

## XENA-DATA-002 — Persistent Cloud Data

**Status:** `REQUIRES_CODEBASE_VERIFICATION`

### Purpose

Persist Xena user data beyond a single local application session.

### Possible product architecture

Cloud database/authentication infrastructure has been part of the planned architecture.

### Exact provider/status

`REQUIRES_CODEBASE_VERIFICATION`

Do not assume Supabase is currently integrated merely because it is part of the architecture plan.

### Verification

Confirm:

- actual database provider;
- schema;
- authentication linkage;
- persistence;
- user isolation;
- read/write behavior;
- offline/error behavior.

---

# 25. Capability Dependencies

The capabilities above may depend on several layers.

Conceptually:

```text
Xena AI reasoning
        ↓
Intent / semantic routing
        ↓
Capability layer
        ↓
Backend / application services
        ↓
Persistence / external services
        ↓
UI / notification / voice interfaces
```

A failure at any layer can make the end-to-end capability unavailable.

Therefore:

> A capability is only end-to-end verified when the complete required chain works.

---

# 26. Capability Verification Matrix

For each capability, future verification should record:

| Field | Requirement |
|---|---|
| UI | Does the user have a working interface? |
| Intent | Is the request correctly recognized? |
| Parameters | Are values extracted correctly? |
| Validation | Are missing/invalid values handled? |
| Authorization | Is the user allowed to perform it? |
| Execution | Does the backend/tool execute it? |
| Persistence | Is the result stored correctly? |
| Retrieval | Can the result be retrieved correctly? |
| Error handling | Does failure produce truthful feedback? |
| UX | Does the user see the correct result? |
| Voice | If supported, does voice work? |
| Mobile | If supported, does mobile work? |

A capability should not be upgraded to `VERIFIED` if a critical required layer remains untested.

---

# 27. Known High-Risk Verification Areas

The following deserve explicit testing because incorrect behavior can damage trust:

## 27.1 AM/PM

Verify:

- 3 AM;
- 3 PM;
- 6:48 AM;
- 6:48 PM.

---

## 27.2 Exact Durations

Verify:

- 3 minutes;
- 30 minutes;
- 2 hours;
- 20 minutes.

The model must not confuse similar values.

---

## 27.3 Stale Payloads

Create different objects sequentially.

Verify that a new request never receives the parameters of an older request.

---

## 27.4 Topic Switching

Start a pending operation, change topic, then return to it.

Verify both operations remain semantically separate.

---

## 27.5 Capability Questions

Ask:

> Can you create reminders?

Verify no reminder is created.

---

## 27.6 Event vs Reminder

Create both with similar time/date language.

Verify correct routing.

---

## 27.7 Vault Explicitness

Say:

> My favorite language is Python.

Verify that it does not automatically become persistent Vault data unless the application's memory rules explicitly say so.

Then:

> Vault: my favorite language is Python.

Verify persistence.

---

## 27.8 Failed Operations

Force backend/tool failure.

Verify Xena does not say:

> Done.

---

## 27.9 User Isolation

Use two accounts.

Verify no cross-account data appears.

---

## 27.10 New Conversation

Start a new conversation.

Verify:

- conversational context resets;
- persistent items remain.

---

# 28. What Must Not Be Assumed

The following must not be treated as verified without codebase evidence:

- exact Gemini model;
- exact API provider;
- exact database provider;
- exact database schema;
- exact notification provider;
- exact TTS provider;
- exact transcription provider;
- exact backend routes;
- exact function/tool names;
- exact Android automation capabilities;
- exact cloud deployment;
- exact authentication implementation;
- exact persistence mechanism.

Mark unknown details:

```text
UNKNOWN
```

or:

```text
REQUIRES_CODEBASE_VERIFICATION
```

---

# 29. Capability Addition Protocol

When adding a new Xena capability:

## Step 1 — Define

Create:

- unique ID;
- official name;
- purpose;
- user problem;
- supported interactions.

## Step 2 — Define Contract

Specify:

- inputs;
- outputs;
- required information;
- dependencies;
- authorization;
- constraints;
- failure scenarios.

## Step 3 — Implement

Implement the actual UI/backend/tool behavior.

## Step 4 — Test

Test:

- normal path;
- missing parameters;
- invalid parameters;
- errors;
- user isolation;
- edge cases.

## Step 5 — Verify

Only after successful end-to-end testing may status become:

```text
VERIFIED
```

## Step 6 — Update System Prompt

If the new capability changes Xena's behavioral routing, update `XENA_SYSTEM_PROMPT.md`.

## Step 7 — Update Identity Only if Necessary

Only update `XENA_IDENTITY.md` if the capability changes Xena's fundamental product identity or publicly stated role.

---

# 30. Capability Removal Protocol

If a capability is removed:

1. remove or disable its runtime route;
2. update this registry;
3. update system behavior;
4. update UI;
5. ensure Xena no longer claims the feature is available;
6. test old prompts against the removed capability.

---

# 31. Capability Status Change Protocol

Status transitions should generally follow:

```text
PLANNED
   ↓
IMPLEMENTED_BUT_UNVERIFIED
   ↓
VERIFIED
```

A verified capability may return to:

```text
IMPLEMENTED_BUT_UNVERIFIED
```

if a major implementation change invalidates previous verification.

A capability may become:

```text
UNCERTAIN
```

when the current implementation state cannot be established.

---

# 32. Machine-Readable Conceptual Structure

The registry can later be represented in JSON/YAML for runtime use.

Conceptual example:

```json
{
  "id": "XENA-REM-001",
  "name": "Reminder Creation",
  "status": "VERIFIED",
  "requires": [
    "authenticated_user",
    "reminder_service"
  ],
  "inputs": [
    "task",
    "date",
    "time"
  ],
  "outputs": [
    "reminder"
  ]
}
```

This example is illustrative.

The production machine-readable schema must be defined only after the actual application/tool architecture is verified.

---

# 33. Recommended Registry Fields for Future Expansion

Every future capability should ideally include:

```text
ID
Official Name
Domain
Status
Purpose
User Problem
Description
Supported Interactions
Inputs
Required Inputs
Optional Inputs
Outputs
Dependencies
Authorization
User Scope
Constraints
Failure Scenarios
Edge Cases
UI Surface
Voice Support
Mobile Support
Backend Support
Persistence
Verification Evidence
Last Verified
Known Bugs
Open Questions
```

---

# 34. Capability Gaps

The following areas require explicit codebase/runtime verification before the registry can be considered complete:

1. exact conversational model integration;
2. exact intent-routing implementation;
3. actual reminder backend;
4. actual notification scheduling;
5. event persistence;
6. study-plan persistence;
7. Vault persistence;
8. My Items aggregation;
9. voice transcription implementation;
10. semantic voice correction;
11. TTS implementation;
12. authentication;
13. session management;
14. per-user authorization;
15. database provider;
16. database schema;
17. mobile integration;
18. Android permissions;
19. external app launching;
20. deployment architecture;
21. backend/frontend environment configuration;
22. exact production model and API configuration.

These are verification requirements, not claims that the features are absent.

---

# 35. Integration Recommendations

## Recommendation 1 — Keep this file authoritative

AI agents working on Xena should consult this file before adding or claiming capabilities.

## Recommendation 2 — Never silently upgrade status

Changing:

```text
PLANNED
```

to:

```text
VERIFIED
```

requires evidence.

## Recommendation 3 — Keep implementation facts separate

This registry should describe capability contracts and verified status.

Detailed code implementation belongs in the codebase and technical documentation.

## Recommendation 4 — Update after major changes

Any change to:

- backend;
- database;
- voice;
- notifications;
- authentication;
- mobile architecture;
- AI routing;

should trigger registry review.

## Recommendation 5 — Use automated capability tests

Where practical, each capability should have a corresponding automated or repeatable end-to-end test.

---

# 36. Final Capability Principle

The authoritative rule of this registry is:

> **If Xena has not been verified to perform a capability, Xena must not present that capability as verified.**

The registry exists to maintain alignment between:

```text
PRODUCT VISION
      ↓
DESIGNED CAPABILITY
      ↓
IMPLEMENTED CAPABILITY
      ↓
TESTED CAPABILITY
      ↓
VERIFIED CAPABILITY
```

These states must never be confused.

---

# 37. Final Verification Requirement

Before this registry is considered production-authoritative, the actual Xena codebase must be inspected.

The first technical verification pass should inspect:

1. frontend capability surfaces;
2. backend routes/services;
3. AI prompt/routing code;
4. reminder implementation;
5. event implementation;
6. study planning implementation;
7. Vault implementation;
8. My Items implementation;
9. voice implementation;
10. authentication;
11. persistence;
12. user isolation;
13. notification scheduling;
14. mobile behavior.

After that audit, every capability should be assigned an evidence-backed status.

**Until then, conservative statuses are intentional.**
