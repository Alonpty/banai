# UX: one wardrobe workspace (branch `uxui`)

The editor is one workspace around one wardrobe: **assistant** (left), **3D** (centre,
dominant, with the structure bar under it), **contextual inspector** (right), as
floating cards. Visual target: the `banai_ui_reference.html` prototype (blue accent for
selection/AI, navy primary actions, warm light canvas). All three read the same store state, so
they cannot drift apart. Frontend-only: no backend, database or domain-engine changes.

```
store.js  { design, revision, selection, proposal, proposalOutcome, history, ui }
   ├─ dispatch(ops)          manual edits (unchanged): validate → commit → revision+1
   ├─ proposeChanges({ops})  dry-run on a copy → proposal { previewDesign, diff, baseRevision }
   ├─ applyProposal()        commit only if revision === baseRevision, else STALE
   ├─ cancelProposal()       discard (client only)
   ├─ undo() / redo()        restore committed snapshots (≤ 100), revision+1
   └─ select(id)             global selection: 3D, inspector, structure strip, assistant chip
```

## Rules kept from the architecture
- **Nothing is committed before approval.** A proposal lives in `state.proposal`, separate from
  `state.design`. The viewer renders `proposal.previewDesign` while one is pending; the committed
  design, revision and history are untouched until **Apply changes**.
- **Stale proposals cannot overwrite newer work.** Any commit (manual edit, undo, redo) marks a
  pending proposal `stale`; applying it returns `STALE` and the card says "The design changed".
- **Undo never touches proposals**: only committed snapshots are recorded. An applied proposal is
  one undo step. Every undo/redo bumps the revision, so stale protection still holds.
- **Manual edits** still go through `store.dispatch(ops)` and commit immediately.

## Proposal preview (3D)
`viewer/proposalPreview.js` restyles the preview scene from `proposal.diff` (`state/diff.js`,
id-based): **added** = translucent sage ghost + outline, **changed** = ochre outline,
**removed** = faded brick copy from the committed design. A brand-new wardrobe
(`create_wardrobe`) is previewed as a whole. The 3D badge and the assistant card both offer
Cancel / Apply; `proposalOutcome` keeps them in sync. Interior changes switch the view to
Interior so they are visible.

## Assistant
- Message types: conversation, clarification, suggested-changes card, confirmation.
- The selected component is shown as a chip ("Selected: Shelf 2 · Left section") and sent with
  every message, so "move this 15 cm higher" works without ids.
- **Demo mode (until Phase 5):** `chat/demoAgent.js` is a small rule-based interpreter, clearly
  labelled "Demo assistant". It returns the same shape the real agent will
  (`{ kind, text, ops, summary }`) and its proposals go through the same preview/approval path.
  Phase 5 replaces `chat/agentClient.js` with `POST /api/chat`.

## View-only extras (never part of the design, never in undo history)
- **Opening doors:** clicking a door swings it open on its hinge (sliding panels glide
  along their track) with an eased ~0.65 s animation; clicking again closes it
  (`viewer/doorMotion.js`). Reduced-motion users get instant changes.
- **Empty room:** the wardrobe stands against the back wall of a simple room (floor, back
  and side wall, skirting, contact shadow; `viewer/room.js`). Walls are single-sided and turn
  see-through when orbiting behind them. **Room** (3D stage, top right) changes the wall
  colour (presets + custom) and floor type (light oak, walnut, concrete, stone tiles,
  carpet); remembered per browser. This is staging only, not room design;
  `viewer.setRoomVisible(false)` gives Phase 8 a clean background.

## Mirror doors
`Mirror glass` is a catalog **material** (`catalog.json`, served by `/api/catalog`), so a
mirror door is an ordinary `set_material` op: undoable, AI-proposable and validated by both
engines with no engine changes. The door inspector has a **Door front: Panel | Mirror**
switch; the assistant understands "make this a mirror door" / "mirror doors". The viewer
renders it as reflective glass whose reflection of the room is captured by a cube camera
only when the design or room style changes (not every frame).

## Customer-facing names (`ui/naming.js`)
compartment → section ("Left / Middle / Right section", "Section 4" for wider layouts),
partition → divider, carcass → wardrobe body, rail → hanging rail, override → custom finish,
proposal → suggested changes. Items are numbered bottom → top. Internal ids are never shown.

## Workspace tools
- **Top bar:** project name, save status, Undo / Redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y), Preview in
  room, Share. Save, Share and the room preview are **not connected yet** (Phases 7 and 8): the
  status reads "Not saved yet" and the dialogs say so. No fake links or images are produced.
- **3D toolbar:** Front, Interior, Dimensions (overall W/H/D with nothing selected; only the
  selection's measurements otherwise), Reset view.
- **Structure strip:** proportional sections and dividers; click to select.
- **Panels** collapse to 48 px rails (remembered per browser); the canvas grows.
- **Start screen:** "Design with AI" (prompt → first proposal → approve) or "Start from basic
  wardrobe".
- **Responsive:** ≤ 1100 px narrower panels and icon-only toolbar; ≤ 760 px one area at a time
  with Design / Assistant / Properties tabs.

## Tests
- Unit: `tests/unit/state/proposal.test.js` (proposal, stale, undo/redo, diff),
  `tests/unit/ui/naming.test.js`, `tests/unit/chat/demoAgent.test.js` (every demo proposal is
  validated by the domain engine), `duplicateOps` in `opsFromForm.test.js`.
- E2E: `tests/e2e/workspace.spec.js` (onboarding, selection context, preview/apply/cancel,
  stale, undo/redo, structure strip, panels, dimensions, duplicate, dialogs).
