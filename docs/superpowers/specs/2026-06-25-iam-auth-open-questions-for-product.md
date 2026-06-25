# IAM & Auth — Open Questions for Product (Signals + Aggregator)

**Date:** 2026-06-25 · **For:** Product Manager · **From:** Engineering (auth/IAM design)
**Scope:** Signals-DPG + aggregator-dpg only. (ai-diffusion / voice service reviewed later.)

## Why this document

We're designing the **shared identity & access layer** for the network — one place that handles *who you are* (login) and *what you're allowed to do* (permissions) across Signals and the Aggregator. This is the layer the **consent/T&C** work depends on, and it's a prerequisite for fixing **cross-instance actions** and tightening **PII access**.

The technical shape (how identities are organised, what roles and permission-scopes exist, how external services are granted access) is determined by a set of **behaviour and policy choices that are product's to make**. Each question below notes *why it matters* and *what it changes*. The aim is a short, decisive set of answers — not detail — so we can finalise the design.

---

## 1. Identity uniqueness & scope

**1.1 Does a person register once for the whole network, or once per instance?**
*Why it matters:* networks may run multiple instances (e.g. `up-blue-dots`, `ka-blue-dots`). If one registration should be recognised everywhere, identity must be **network-level** (one account, one identity, discoverable across instances). If registration is per-instance, the same person becomes several separate accounts. This is the single biggest decision — it sets whether we have one central identity store or many.

**1.2 Should a person be discoverable across all instances of a network from a single registration?**
*Why it matters:* drives whether "register in UP, get found by a provider in KA" works. Couples directly to the cross-instance behaviour in §6.

**1.3 When two domains/networks co-exist on the same deployment (e.g. blue + purple together), is that one identity or two?**
*Why it matters:* decides whether a person's core profile is shared across domains or kept separate. Affects whether they consent / are gated once or per-domain.

**1.4 Are the *core* attributes of a person (name, phone, etc.) intended to be common across network/domain/instance (the Beckn v2 registry direction)?**
*Why it matters:* confirms whether we build toward a single network-wide identity/registry record vs. per-context copies. Shapes the whole data model.

## 2. Seeker / Provider exclusivity

**2.1 Is "a user is a seeker OR a provider, never both" a permanent rule, or can they switch later?**
*Why it matters:* if it can ever change, we must model role as mutable from day one (and decide what happens to their existing items on switch). If it's truly permanent, we can hard-enforce it.

**2.2 Same question for aggregators (seeker-type OR provider-type) — you noted this "may change in future." Design for switching now, or defer?**
*Why it matters:* designing for a future switch costs more now; locking it is cheaper but expensive to undo later.

**2.3 Could one real-world person/organisation legitimately need both roles (via separate accounts)?**
*Why it matters:* decides whether "one human = one identity" holds, or whether we must allow multiple role-scoped identities per person.

## 3. Aggregator organisation, roles & approvals

**3.1 Please confirm the two-level approval chain:** (a) org owner registers the org → **network admin** approves/rejects → org active; (b) further users register against that org → **org admin** approves/rejects.
*Why it matters:* defines who the approval authority is at each level and what "active" unlocks.

**3.2 What roles exist *inside* an organisation, and what can each do?**
*Why it matters:* you mentioned "multiple users for the same org with different access privileges." We need the **role catalogue** and the actions each gates — e.g. onboard participants, view participant PII, manage QR/links, edit org profile, manage billing, manage other users. Without this we can't define permissions.

**3.3 Is there a single "org owner" with transferable ownership, or multiple co-admins?**
*Why it matters:* affects account recovery, deletion, and who can remove whom.

## 4. Acting on behalf of participants (delegated authority)

**4.1 After an aggregator onboards a participant, what may the aggregator do on that participant's behalf, and for how long?**
*Why it matters:* today the aggregator creates the user + item via a shared service key. We need to know the limits: can it later **edit/delete** that participant's item? **Read their PII?** Indefinitely, or only until the participant takes over?

**4.2 Is "onboarded-via aggregator X" just provenance (a tag), or does it grant the aggregator ongoing authority over that participant?**
*Why it matters:* decides whether onboarding is a one-time act or a standing permission relationship.

**4.3 When (if ever) does authority transfer fully to the participant — e.g. once they log in themselves?**
*Why it matters:* defines the hand-off and whether the aggregator's access should then shrink.

## 5. PII visibility & sharing

**5.1 Who can see a participant's PII, and at what moment?**
*Why it matters:* candidates are the participant, the onboarding aggregator, a counterparty after a connect/apply action, the voice bot, and the network admin. We need a simple **who-sees-what-when** matrix. This builds on the consent design (PII revealed on action + consent), but the role-based view rules are product's to set.

**5.2 Which fields are "always private," which are "shared on action," which are "public/discoverable"?**
*Why it matters:* drives field-level access rules and what discovery search can return.

## 6. Cross-instance & multi-instance behaviour

**6.1 Is performing actions *across instances* a required behaviour (e.g. a seeker on `up-blue` connecting to a provider on `ka-blue`)?**
*Why it matters:* current APIs don't support this. If required, the identity/permission layer must be **network-shared** so a login/permission at one instance is honoured at another.

**6.2 Should permissions/sessions be honoured network-wide, or re-established per instance?**
*Why it matters:* "minimal-scope access shared across the network" implies network-wide; confirm. This decides whether IAM is centralised for the network or per-instance.

**6.3 What is the trust relationship between instances of the same network?**
*Why it matters:* cross-instance calls are currently unauthenticated. Product confirming that cross-instance action is in-scope lets us design mutual trust rather than leave it open.

## 7. Status & lifecycle gating

**7.1 What should an *unverified* or *terms-not-agreed* user be blocked from doing?**
*Why it matters:* options are browse, create items, perform actions, or be discovered by others. We need the **gate matrix** for user status (ties into the consent design's gating).

**7.2 Please confirm what each item lifecycle state permits** (e.g. draft = editable/not discoverable; live = discoverable + actionable; paused = hidden).
*Why it matters:* the access layer enforces these; we need the authoritative meaning of each state.

## 8. External agents (voice bots & other services)

**8.1 What exactly should an external agent (e.g. Raya voice bot) be allowed to do — and on whose behalf?**
*Why it matters:* you noted voice bots need create/read/update on users, items, and actions. We need the **minimal scope**: can it act for *any* user, or only the caller in a session it's handling? Which fields/actions are off-limits?

**8.2 Should each external service get its own narrowly-scoped credentials, or share one?**
*Why it matters:* "minimal-scope, limited access" implies per-service scoped credentials; confirm so we can revoke/limit one service without affecting others.

---

## How answers feed the design

- §1, §6 → **where identities live** (one network-wide store vs per-instance) and whether IAM is centralised.
- §2, §3 → the **role & permission catalogue** (what roles exist, what each can do).
- §4, §5, §7, §8 → the **access rules** (on-behalf authority, PII visibility, status/lifecycle gates, external-agent scopes).

Even partial answers unblock us. Where product is undecided, tell us whether to **design-for-future-flexibility** (costs more now) or **lock-the-simple-rule** (cheaper, harder to change later) — that choice is itself useful.
