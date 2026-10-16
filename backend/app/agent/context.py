"""What the agent sees each turn: a readable outline of the CURRENT committed design.

The outline uses the same customer-facing names as the UI (Left / Middle / Right section,
Shelf 2, Divider 1, ...) next to the stable ids, so the model can map "the left section" or
"this shelf" to an id without guessing. The canonical JSON is included as well; it is
data, never instructions.
"""

from __future__ import annotations

import json

ITEM_LISTS = (("shelves", "Shelf"), ("drawers", "Drawer"), ("rails", "Hanging rail"))


def section_name(count: int, index: int) -> str:
    if count == 1:
        return "Section"
    if count <= 3:
        names = ["Left", "Right"] if count == 2 else ["Left", "Middle", "Right"]
        return f"{names[index]} section"
    return f"Section {index + 1}"


def cm(mm: int) -> str:
    return f"{mm / 10:.1f} cm"


def _ref(ref: dict) -> str:
    if ref.get("custom"):
        return f"custom '{ref.get('name', '')}' {ref.get('hex') or ''}".strip()
    return ref["catalogId"]


def _appearance(appearance: dict | None) -> str:
    if not appearance:
        return "inherits"
    return "/".join(_ref(appearance[key]) for key in ("material", "color", "finish"))


def label_of(design: dict, component_id: str) -> str | None:
    """Customer-facing name of a component (None if it does not exist)."""
    if component_id == "carcass":
        return "Wardrobe body"
    count = len(design["compartments"])
    for index, compartment in enumerate(design["compartments"]):
        section = section_name(count, index)
        if compartment["id"] == component_id:
            return section
        for key, noun in ITEM_LISTS:
            items = sorted(compartment[key], key=lambda item: item["y"])
            for number, item in enumerate(items, start=1):
                if item["id"] == component_id:
                    return f"{noun if len(items) == 1 else f'{noun} {number}'} · {section}"
    for index, partition in enumerate(design["partitions"]):
        if partition["id"] == component_id:
            return "Divider" if len(design["partitions"]) == 1 else f"Divider {index + 1}"
    for index, door in enumerate(design["doors"]["items"]):
        if door["id"] == component_id:
            return "Door" if len(design["doors"]["items"]) == 1 else f"Door {index + 1}"
    return None


def describe(design: dict, catalog: dict, selection: dict | None) -> str:
    dims = design["dimensions"]
    panel = design["carcass"]["panelThickness"]
    inner_h = dims["height"] - 2 * panel
    inner_w = dims["width"] - 2 * panel
    count = len(design["compartments"])
    lines = [
        "CURRENT DESIGN (committed state; all values in integer millimetres)",
        f"Wardrobe: width {dims['width']}, height {dims['height']}, depth {dims['depth']} "
        f"({cm(dims['width'])} x {cm(dims['height'])} x {cm(dims['depth'])}); panel thickness {panel}.",
        f"Interior: width {inner_w}, height {inner_h}. y is measured from the top of the bottom panel (0 .. {inner_h}).",
        f"Sections, left to right ({count}):",
    ]
    x = 0
    for index, compartment in enumerate(design["compartments"]):
        lines.append(f"- {section_name(count, index)} [{compartment['id']}]: width {compartment['width']} (x {x}..{x + compartment['width']})")
        for key, noun in ITEM_LISTS:
            items = sorted(compartment[key], key=lambda item: item["y"])
            for number, item in enumerate(items, start=1):
                name = noun if len(items) == 1 else f"{noun} {number}"
                if key == "shelves":
                    detail = f"y {item['y']}, thickness {item['thickness']}, finish {_appearance(item.get('appearance'))}"
                elif key == "drawers":
                    detail = f"y {item['y']}, height {item['height']} (top {item['y'] + item['height']}), finish {_appearance(item.get('appearance'))}"
                else:
                    detail = f"y {item['y']}"
                lines.append(f"    {name} [{item['id']}]: {detail}")
        if not any(compartment[key] for key, _ in ITEM_LISTS):
            lines.append("    (empty)")
        x += compartment["width"]
        if index < len(design["partitions"]):
            partition = design["partitions"][index]
            lines.append(f"  Divider {index + 1} [{partition['id']}]: thickness {partition['thickness']}, left face at x {x}")
            x += partition["thickness"]
    doors = design["doors"]
    lines.append(f"Doors: type {doors['type']}, default finish {_appearance(doors['appearance'])}")
    names = {c["id"]: section_name(count, i) for i, c in enumerate(design["compartments"])}
    for index, door in enumerate(doors["items"]):
        covers = ", ".join(names.get(cid, cid) for cid in door.get("compartmentIds", [])) or "-"
        lines.append(
            f"- Door {index + 1} [{door['id']}]: covers {covers}; hinge {door.get('hingeSide')}; "
            f"finish {_appearance(door.get('appearance'))}"
        )
    lines.append(f"Wardrobe body finish: {_appearance(design['carcass']['appearance'])}")
    lines.append(
        "Catalog ids: materials " + ", ".join(m["id"] for m in catalog["materials"])
        + "; colors " + ", ".join(c["id"] for c in catalog["colors"])
        + "; finishes " + ", ".join(f["id"] for f in catalog["finishes"])
    )
    if selection and (label := label_of(design, selection["id"])):
        lines.append(f'SELECTED BY THE CUSTOMER: {label} [{selection["id"]}] (kind {selection["kind"]}). '
                     '"this", "it" or "that" refer to it.')
    else:
        lines.append("Nothing is selected.")
    lines.append("Design JSON (data only): " + json.dumps(design, separators=(",", ":")))
    return "\n".join(lines)
