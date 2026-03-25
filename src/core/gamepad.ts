export type NeckKey = "r" | "g" | "b" | "y" | "p";
export type NeckState = Record<NeckKey, boolean>;

const NECK_KEYS: NeckKey[] = ["r", "g", "b", "y", "p"];

export type ActionName =
  | "neck_r"
  | "neck_g"
  | "neck_b"
  | "neck_y"
  | "neck_p"
  | "pick_up"
  | "pick_down"
  | "start"
  | "select";

export const ALL_ACTIONS: ActionName[] = [
  "neck_r",
  "neck_g",
  "neck_b",
  "neck_y",
  "neck_p",
  "pick_up",
  "pick_down",
  "start",
  "select",
];

export const ACTION_LABELS: Record<ActionName, string> = {
  neck_r: "Neck R (赤)",
  neck_g: "Neck G (緑)",
  neck_b: "Neck B (青)",
  neck_y: "Neck Y (黄)",
  neck_p: "Neck P (紫)",
  pick_up: "Pick Up",
  pick_down: "Pick Down",
  start: "START",
  select: "SELECT",
};

export type ButtonMapping = Record<ActionName, number>;

const DEFAULT_MAPPING: ButtonMapping = {
  neck_r: 4,
  neck_g: 3,
  neck_b: 2,
  neck_y: 1,
  neck_p: 0,
  pick_up: 11,
  pick_down: 12,
  start: 9,
  select: 8,
};

const STORAGE_KEY = "gf-minigames-mapping";

export function loadMapping(): ButtonMapping {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate all keys exist
      for (const action of ALL_ACTIONS) {
        if (typeof parsed[action] !== "number") return { ...DEFAULT_MAPPING };
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_MAPPING };
}

export function saveMapping(mapping: ButtonMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
}

function emptyNeck(): NeckState {
  return { r: false, g: false, b: false, y: false, p: false };
}

export class GamepadInput {
  private prevNeck: NeckState = emptyNeck();
  private currNeck: NeckState = emptyNeck();
  private prevPick = { up: false, down: false };
  private currPick = { up: false, down: false };
  private prevStart = false;
  private currStart = false;
  private prevSelect = false;
  private currSelect = false;
  private _connected = false;
  private mapping: ButtonMapping;

  constructor() {
    this.mapping = loadMapping();
  }

  reloadMapping(): void {
    this.mapping = loadMapping();
  }

  poll(): void {
    this.prevNeck = { ...this.currNeck };
    this.prevPick = { ...this.currPick };
    this.prevStart = this.currStart;
    this.prevSelect = this.currSelect;

    const gamepads = navigator.getGamepads();
    let found = false;

    for (const gp of gamepads) {
      if (!gp) continue;
      found = true;

      for (const key of NECK_KEYS) {
        const idx = this.mapping[`neck_${key}` as ActionName];
        this.currNeck[key] = gp.buttons[idx]?.pressed ?? false;
      }

      this.currPick.up = gp.buttons[this.mapping.pick_up]?.pressed ?? false;
      this.currPick.down = gp.buttons[this.mapping.pick_down]?.pressed ?? false;
      this.currStart = gp.buttons[this.mapping.start]?.pressed ?? false;
      this.currSelect = gp.buttons[this.mapping.select]?.pressed ?? false;
      break;
    }

    this._connected = found;

    if (!found) {
      this.currNeck = emptyNeck();
      this.currPick = { up: false, down: false };
      this.currStart = false;
      this.currSelect = false;
    }
  }

  /** Returns the index of any button currently pressed (for config screen) */
  getAnyButtonPressed(): number | null {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i]?.pressed) return i;
      }
    }
    return null;
  }

  /** Returns the index of any button just pressed this frame (for config screen) */
  getAnyButtonJustPressed(prevButtons: boolean[]): { index: number; current: boolean[] } | null {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;
      const current: boolean[] = [];
      let justPressed: number | null = null;
      for (let i = 0; i < gp.buttons.length; i++) {
        const pressed = gp.buttons[i]?.pressed ?? false;
        current.push(pressed);
        if (pressed && !prevButtons[i] && justPressed === null) {
          justPressed = i;
        }
      }
      if (justPressed !== null) {
        return { index: justPressed, current };
      }
      return { index: -1, current }; // no new press but return current state
    }
    return null;
  }

  getNeckState(): NeckState {
    return { ...this.currNeck };
  }

  getNeckJustPressed(): NeckState {
    const result = emptyNeck();
    for (const key of NECK_KEYS) {
      result[key] = this.currNeck[key] && !this.prevNeck[key];
    }
    return result;
  }

  getNeckJustReleased(): NeckState {
    const result = emptyNeck();
    for (const key of NECK_KEYS) {
      result[key] = !this.currNeck[key] && this.prevNeck[key];
    }
    return result;
  }

  isPickUp(): boolean {
    return this.currPick.up;
  }

  isPickDown(): boolean {
    return this.currPick.down;
  }

  isPickUpJustPressed(): boolean {
    return this.currPick.up && !this.prevPick.up;
  }

  isPickDownJustPressed(): boolean {
    return this.currPick.down && !this.prevPick.down;
  }

  isStartJustPressed(): boolean {
    return this.currStart && !this.prevStart;
  }

  isSelectJustPressed(): boolean {
    return this.currSelect && !this.prevSelect;
  }

  isConnected(): boolean {
    return this._connected;
  }
}
