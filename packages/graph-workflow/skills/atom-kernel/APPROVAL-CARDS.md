# approval() — Card Format, Mode Dispatch, Main-Node Checkpoints

Detail companion to atom-kernel §approval() (cold sections — SKILL.md body stays within the reference-skill length band).

## Contract Shape

```
approval({ header, options, custom, recommendation?, rationale? }) → decision
```

- `header` - noun phrase. <=30 chars. Topic, not outcome.
- `options` - `[{ label, description }]`. Label: concrete answer phrase. Description: single line.
- `custom` - free-text input, mandatory `true`.
- `recommendation` - the AI's proposed option (label or index). The discriminator: present -> auto mode may execute it; absent -> ALWAYS a card (interviews, consensus turns).
- `rationale` - one-line basis for the recommendation (observable fields / decision values). Recorded when the recommendation is auto-executed.
- Returns `decision` - `{ label?, value?, note?, custom? }`: the chosen option + free text; auto-executed decisions carry note `'run mode: auto'` + rationale.

## Mode Dispatch

1. Read the `## Run Mode: <mode>` context block (present on every graph node dispatch; absent -> `manual` - absence never auto).
2. **Manual / absent / no recommendation** -> decision card (options + custom). Return the user's choice.
3. **Auto + recommendation** -> execute the recommendation: no card; record the decision + rationale (observability). Return it.
4. **Auto without recommendation** -> decision card (`Run mode: auto — no recommendation; decide manually`). NEVER guess an action.

## 8 Format Rules

1. Header: noun phrase <=30 chars. Topic, not outcome.
2. Label: concrete answer phrase. Recommended first.
3. Description: single line. May note next step.
4. Pre-call text: background + option meanings + recommendation, same message.
5. Body: forbidden.
6. Custom: mandatory `true`.
7. One question per call.
8. No control chars (`\r`, `\t`, `\n`).

**Decision card mapping** (manual/absent branch): `topic`->`header`; `routingActions[].label/description`->`options[].label/description`; `routingActions[].action`->decision routing; `pre_text`->pre-call text. `custom: true` mandatory - card input maps to `decision.note`. Free-text: continue -> remark, retry -> upstream, jump -> target override.

## Main-Node Checkpoints

Main nodes receive a `## Decision UI` block (atom-phase-handler context assembly) declaring that every user-confirmation point in the node's execution - including prose instructions in the dispatched skill ("ask the user" / "check with the user" / "quiz" / question()-style) - executes per the approval() contract. Upstream skill content is never modified; the atom layer is the single interpretation site. Skills run outside a graph get no block -> their confirmation points present cards (manual default).
