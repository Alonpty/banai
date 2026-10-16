// DEMO assistant: a small, deterministic, rule-based interpreter that stands in for the
// OpenAI agent until Phase 5. It is NOT the product's AI. It produces the same response
// shape the real agent will ({ kind: 'reply' | 'clarification' | 'proposal', text, ops,
// summary }) so the proposal/preview/approval UX can be built and tested end to end.
// It never applies anything: proposals go through store.proposeChanges() and wait for
// the customer's approval like any AI proposal.
import { applyOps } from '../domain/apply.js';
import { DomainError } from '../domain/errors.js';
import { COMPARTMENT, PARTITION, newId } from '../domain/ids.js';
import { addItemOps } from '../editor/opsFromForm.js';
import { describeOps, labelOf, sectionName } from '../ui/naming.js';

const NUMBER_WORDS = Object.freeze({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 });
const COUNT = '(\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight)';
const POSITION = '(left|middle|center|centre|right)';
const ITEM = '(shel(?:f|ves)|drawers?|hanging(?:\\s+(?:clothes|rails?|space))?|(?:hanging\\s+)?rails?)';
const ITEM_HEIGHT_DRAWER = 200; // ASSUMPTION: demo default drawer height (mm)
const RAIL_BELOW_TOP = 100; // ASSUMPTION: demo default rail position below the top (mm)

const toCount = (word) => (word ? NUMBER_WORDS[word.toLowerCase()] ?? Number(word) : null);
const itemKind = (word) => (/^shel/i.test(word) ? 'shelf' : /^drawer/i.test(word) ? 'drawer' : 'rail');

/** First "<number> cm|mm|m" (or bare number) after a keyword pattern, in millimetres. */
function lengthMm(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  const unit = (match[2] ?? 'cm').toLowerCase();
  const mm = unit === 'mm' ? value : unit === 'm' ? value * 1000 : value * 10;
  return Number.isFinite(mm) ? Math.round(mm) : null;
}
const LEN = '(\\d+(?:[.,]\\d+)?)\\s*(cm|mm|m)?';

/** Index of a section named in the text ("left", "middle", "section 2"), or null. */
function sectionFromText(text, count) {
  // "section 2", but not "section 80 cm wide"
  const numbered = text.match(/section\s*(\d{1,2})\b(?!\s*(?:cm|mm|m)\b)/i);
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    if (index >= 0 && index < count) return index;
  }
  const match = text.match(new RegExp(`\\b${POSITION}\\b`, 'i'));
  return match ? positionIndex(match[1], count) : null;
}

function positionIndex(word, count) {
  const w = word.toLowerCase();
  if (w === 'left') return 0;
  if (w === 'right') return count - 1;
  return count >= 3 ? Math.floor((count - 1) / 2) : null;
}

const parentSectionIndex = (design, selection) => {
  if (!selection) return null;
  return design.compartments.findIndex((c) => c.id === selection.id
    || [...c.shelves, ...c.drawers, ...c.rails].some((item) => item.id === selection.id));
};

function catalogMatch(text, entries) {
  const lower = text.toLowerCase();
  // Longest names first, so "natural oak" wins over a plain "oak".
  const sorted = [...entries].sort((a, b) => b.name.length - a.name.length);
  return sorted.find((entry) => lower.includes(entry.name.toLowerCase()))
    ?? (lower.includes('oak') ? entries.find((entry) => entry.id.includes('oak')) : undefined)
    ?? (/\bgr[ae]y\b/.test(lower) ? entries.find((entry) => entry.id.includes('grey')) : undefined);
}

// ---------------------------------------------------------------- new wardrobe

/** Shelf heights spread evenly over [from, to) (mm, bottom face). */
function spread(count, from, to, thickness = 18) {
  return Array.from({ length: count }, (_, k) => Math.floor(from + ((to - from) * (k + 1)) / (count + 1) - thickness / 2));
}

function contentsByPosition(text, count) {
  const contents = Array.from({ length: count }, () => ({}));
  const record = (index, word, n) => {
    if (index === null || index === undefined) return;
    const kind = itemKind(word);
    contents[index][kind] = kind === 'rail' ? 1 : n ?? (kind === 'shelf' ? 4 : 3);
  };
  const forward = new RegExp(`(?:${COUNT}\\s+)?${ITEM}\\s+(?:on|in|at|for)?\\s*(?:the\\s+)?${POSITION}`, 'gi');
  for (const m of text.matchAll(forward)) record(positionIndex(m[3], count), m[2], toCount(m[1]));
  const backward = new RegExp(`${POSITION}(?:\\s+section)?\\s*(?::|-|with|has|gets)?\\s*(?:${COUNT}\\s+)?${ITEM}`, 'gi');
  for (const m of text.matchAll(backward)) record(positionIndex(m[1], count), m[3], toCount(m[2]));
  return contents;
}

function createOps(text, catalog) {
  const width = lengthMm(text, new RegExp(`${LEN}\\s*(?:wide|width)\\b`, 'i')) ?? lengthMm(text, new RegExp(`width\\s*(?:of|is|:)?\\s*${LEN}`, 'i'));
  const height = lengthMm(text, new RegExp(`${LEN}\\s*(?:tall|high)\\b`, 'i')) ?? lengthMm(text, new RegExp(`height\\s*(?:of|is|:)?\\s*${LEN}`, 'i'));
  const depth = lengthMm(text, new RegExp(`${LEN}\\s*(?:deep|depth)`, 'i'));
  const countMatch = text.match(new RegExp(`${COUNT}\\s+(?:sections?|compartments?|parts|columns)`, 'i'));
  const count = toCount(countMatch?.[1]) ?? (width ? Math.max(1, Math.min(6, Math.round(width / 800))) : 3);
  const compartmentIds = Array.from({ length: count }, () => newId(COMPARTMENT));
  const ops = [{
    op: 'create_wardrobe',
    width: width ?? 2000,
    height: height ?? 2400,
    depth: depth ?? 600,
    compartmentCount: count,
    compartmentIds,
    partitionIds: Array.from({ length: count - 1 }, () => newId(PARTITION)),
  }];
  const top = (height ?? 2400) - 36;
  contentsByPosition(text, count).forEach((wanted, index) => {
    const compartmentId = compartmentIds[index];
    const drawers = wanted.drawer ?? 0;
    for (let k = 0; k < drawers; k += 1) ops.push({ op: 'add_drawer', compartmentId, y: k * ITEM_HEIGHT_DRAWER, height: ITEM_HEIGHT_DRAWER });
    const shelvesTop = wanted.rail ? top - 400 : top;
    if (wanted.rail) ops.push({ op: 'add_rail', compartmentId, y: top - RAIL_BELOW_TOP });
    spread(wanted.shelf ?? 0, drawers * ITEM_HEIGHT_DRAWER, shelvesTop).forEach((y) => ops.push({ op: 'add_shelf', compartmentId, y }));
  });
  const [doors] = doorOps(text) ?? [{ op: 'configure_doors', type: 'hinged' }];
  ops.push(doors);
  const color = catalogMatch(text, catalog.colors);
  if (color) {
    ops.push({ op: 'set_material', target: 'carcass', color: { catalogId: color.id } });
    if (doors.type !== 'none') ops.push({ op: 'set_material', target: 'doors', color: { catalogId: color.id } });
  }
  return ops;
}

// ---------------------------------------------------------------- edits

function doorOps(text) {
  if (/\b(no doors|without doors|remove (?:the|all) doors|open wardrobe)\b/i.test(text)) return [{ op: 'configure_doors', type: 'none' }];
  if (/\bsliding\b/i.test(text)) return [{ op: 'configure_doors', type: 'sliding' }];
  if (/\bhinged\b/i.test(text)) return [{ op: 'configure_doors', type: 'hinged' }];
  return null;
}

const ITEM_OP = Object.freeze({ shelf: 'modify_shelf', drawer: 'modify_drawer', rail: 'modify_rail' });

function findItemById(design, id) {
  for (const compartment of design.compartments) {
    const item = [...compartment.shelves, ...compartment.drawers, ...compartment.rails].find((i) => i.id === id);
    if (item) return item;
  }
  return null;
}

/** Interpret one message against the current design. Returns ops or a clarification. */
function editOps(text, design, selection, catalog) {
  const ops = [];
  const n = design.compartments.length;
  const named = sectionFromText(text, n);
  const selectedSection = parentSectionIndex(design, selection);
  const sectionIndex = named ?? (selectedSection >= 0 ? selectedSection : null);
  const refersToThis = /\b(this|it|that|selected)\b/i.test(text);

  const doors = doorOps(text);
  if (doors) ops.push(...doors);

  // Mirror doors ("make this a mirror door", "mirror doors")
  const mirror = /\bmirror(ed)?\b/i.test(text) && catalog.materials.some((m) => m.id === 'mirror');
  if (mirror) {
    if (design.doors.type === 'none') return { clarification: 'This wardrobe has no doors yet. Shall I add hinged or sliding doors first?' };
    const target = selection?.kind === 'door' && refersToThis ? selection.id : 'doors';
    ops.push({ op: 'set_material', target, material: { catalogId: 'mirror' } });
  }

  // Colour / finish
  const color = catalogMatch(text, catalog.colors);
  const finish = catalog.finishes.find((f) => new RegExp(`\\b${f.name}\\b`, 'i').test(text));
  if (color || finish) {
    const patch = { ...(color ? { color: { catalogId: color.id } } : {}), ...(finish ? { finish: { catalogId: finish.id } } : {}) };
    let targets;
    if (/\bdoors?\b/i.test(text)) targets = ['doors'];
    else if (/\b(body|carcass|frame|inside|interior)\b/i.test(text)) targets = ['carcass'];
    else if (selection && ['shelf', 'drawer', 'door'].includes(selection.kind) && refersToThis) targets = [selection.id];
    else targets = design.doors.type === 'none' ? ['carcass'] : ['carcass', 'doors'];
    targets.forEach((target) => ops.push({ op: 'set_material', target, ...patch }));
  }

  // Remove
  if (/\b(remove|delete)\b/i.test(text) && !doors) {
    if (selection && selection.kind !== 'carcass' && (refersToThis || named === null)) ops.push({ op: 'remove_component', id: selection.id });
    else if (named !== null && /\bsection\b/i.test(text) && n > 1) ops.push({ op: 'remove_component', id: design.compartments[named].id });
    else return { clarification: 'Which part should I remove? Click it in the 3D view, then ask again.' };
  }

  // Move an item up / down
  const move = text.match(new RegExp(`${LEN}\\s*(higher|up|lower|down)`, 'i')) ?? text.match(new RegExp(`(raise|lift|lower|drop)\\b.*?by\\s*${LEN}`, 'i'));
  if (move) {
    const [amountText, unit, direction] = /^(raise|lift|lower|drop)$/i.test(move[1]) ? [move[2], move[3], move[1]] : [move[1], move[2], move[3]];
    const delta = lengthMm(`${amountText}${unit ?? 'cm'}`, new RegExp(`^${LEN}$`, 'i'));
    const item = selection && ITEM_OP[selection.kind] ? findItemById(design, selection.id) : null;
    if (!item) return { clarification: 'Which shelf, drawer or hanging rail should I move? Click it in the 3D view first.' };
    const sign = /^(higher|up|raise|lift)$/i.test(direction) ? 1 : -1;
    ops.push({ op: ITEM_OP[selection.kind], id: selection.id, y: item.y + sign * delta });
  }

  // Add items
  const add = text.match(new RegExp(`\\badd\\b\\s+(?:${COUNT}\\s+)?(?:more\\s+)?${ITEM}`, 'i'));
  if (add) {
    if (sectionIndex === null) return { clarification: 'Which section should I add it to: left, middle or right? You can also click a section first.' };
    const kind = itemKind(add[2]);
    const count = Math.min(toCount(add[1]) ?? 1, 10);
    let draft = applyOps(design, ops, catalog);
    let compartmentId = design.compartments[sectionIndex].id;
    if (!draft.compartments.some((c) => c.id === compartmentId)) {
      // The named section is being removed in this same request: use the selected one.
      const selectedId = selectedSection >= 0 ? design.compartments[selectedSection]?.id : null;
      if (!selectedId || !draft.compartments.some((c) => c.id === selectedId)) {
        return { clarification: 'Which section should the new items go in? Click a section first.' };
      }
      compartmentId = selectedId;
    }
    for (let k = 0; k < count; k += 1) {
      const next = addItemOps(draft, compartmentId, kind);
      ops.push(...next);
      draft = applyOps(draft, next, catalog);
    }
  }

  // Width: of a section ("make this 80 cm wide", "middle section wider by 10 cm") or the wardrobe
  const wardrobeWide = /\bwardrobe\b/i.test(text) && named === null;
  const setWidth = lengthMm(text, new RegExp(`${LEN}\\s*(?:wide|width)\\b`, 'i')) ?? lengthMm(text, new RegExp(`width\\s*(?:to|of)?\\s*${LEN}`, 'i'));
  const widen = text.match(new RegExp(`(wider|narrower)\\s*(?:by\\s*)?${LEN}`, 'i')) ?? text.match(new RegExp(`${LEN}\\s*(wider|narrower)`, 'i'));
  if (setWidth || widen) {
    let deltaMm = 0;
    if (widen) {
      const [word, amount, unit] = /wider|narrower/i.test(widen[1]) ? [widen[1], widen[2], widen[3]] : [widen[3], widen[1], widen[2]];
      deltaMm = lengthMm(`${amount}${unit ?? 'cm'}`, new RegExp(`^${LEN}$`, 'i')) * (/wider/i.test(word) ? 1 : -1);
    }
    const sectionTarget = !wardrobeWide && sectionIndex !== null && (named !== null || selection?.kind !== 'carcass');
    if (sectionTarget && n > 1) {
      const compartment = design.compartments[sectionIndex];
      ops.push({ op: 'modify_compartment', compartmentId: compartment.id, width: setWidth ?? compartment.width + deltaMm });
    } else {
      ops.push({ op: 'update_dimensions', width: setWidth ?? design.dimensions.width + deltaMm });
    }
  }
  const height = lengthMm(text, new RegExp(`${LEN}\\s*(?:tall|high)\\b`, 'i'));
  if (height) ops.push({ op: 'update_dimensions', height });
  const depth = lengthMm(text, new RegExp(`${LEN}\\s*(?:deep)\\b`, 'i'));
  if (depth) ops.push({ op: 'update_dimensions', depth });

  return { ops };
}

const HELP = 'In this demo I understand requests like "move this 15 cm higher", "add 2 drawers to the right section", '
  + '"make the middle section 80 cm wide", "sliding doors", "walnut doors" or "remove this". '
  + 'The full AI designer arrives in Phase 5.';

/**
 * @param {{ message: string, design: object|null, selection: object|null, catalog: object, mode?: 'create'|'edit' }} input
 */
export function respond({ message, design, selection, catalog, mode = 'edit' }) {
  const text = String(message ?? '').slice(0, 2000);
  if (!text.trim()) return { kind: 'clarification', text: 'Tell me what you would like to change.' };
  const creating = mode === 'create' || /\b(new wardrobe|start over|from scratch)\b/i.test(text);
  let result;
  try {
    result = creating ? { ops: createOps(text, catalog) } : editOps(text, design, selection, catalog);
  } catch (error) {
    if (error instanceof DomainError) return { kind: 'reply', text: 'I could not work that out on this design. Could you rephrase it?' };
    throw error;
  }
  if (result.clarification) return { kind: 'clarification', text: result.clarification };
  if (!result.ops.length) return { kind: 'clarification', text: HELP };
  const summary = creating
    ? summarizeNewWardrobe(result.ops)
    : describeOps(design, result.ops);
  const about = selection && !creating && /\b(this|it|that)\b/i.test(text) ? ` for ${labelOf(design, selection.id)}` : '';
  return {
    kind: 'proposal',
    text: creating ? 'Here is a first design. Check it in 3D, then apply it or ask for changes.' : `Here is what I would change${about}.`,
    ops: result.ops,
    summary,
  };
}

function summarizeNewWardrobe(ops) {
  const [create] = ops;
  const design = { compartments: create.compartmentIds.map((id) => ({ id })) };
  const lines = [`New wardrobe ${create.width / 10} × ${create.height / 10} × ${create.depth / 10} cm, ${create.compartmentCount} sections`];
  create.compartmentIds.forEach((id, index) => {
    const parts = ['shelf', 'drawer', 'rail'].map((kind) => {
      const k = ops.filter((op) => op.op === `add_${kind}` && op.compartmentId === id).length;
      if (!k) return null;
      if (kind === 'rail') return 'hanging rail';
      return `${k} ${kind === 'shelf' ? (k === 1 ? 'shelf' : 'shelves') : k === 1 ? 'drawer' : 'drawers'}`;
    }).filter(Boolean);
    if (parts.length) lines.push(`${sectionName(design, index)}: ${parts.join(', ')}`);
  });
  const doors = ops.find((op) => op.op === 'configure_doors');
  if (doors) lines.push(doors.type === 'none' ? 'No doors' : `${doors.type === 'sliding' ? 'Sliding' : 'Hinged'} doors`);
  const color = ops.find((op) => op.op === 'set_material' && op.color);
  if (color) lines.push(`Colour: ${color.color.catalogId.replace(/_/g, ' ')}`);
  return lines;
}

export const DEMO_NOTICE = 'Demo assistant: a simple built-in interpreter, not the real AI. The AI designer connects in Phase 5.';
