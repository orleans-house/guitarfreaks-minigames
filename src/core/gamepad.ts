export const NECK_BUTTONS = { r: 4, g: 3, b: 2, y: 1, p: 0 } as const;
export const PICK_UP = 11;
export const PICK_DOWN = 12;
export const START_BUTTON = 9;
export const SELECT_BUTTON = 8;

export type NeckKey = keyof typeof NECK_BUTTONS; // 'r' | 'g' | 'b' | 'y' | 'p'
export type NeckState = Record<NeckKey, boolean>;

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

  poll(): void {
    // Save previous state
    this.prevNeck = { ...this.currNeck };
    this.prevPick = { ...this.currPick };
    this.prevStart = this.currStart;
    this.prevSelect = this.currSelect;

    const gamepads = navigator.getGamepads();
    let found = false;

    for (const gp of gamepads) {
      if (!gp) continue;
      found = true;

      for (const key of Object.keys(NECK_BUTTONS) as NeckKey[]) {
        const idx = NECK_BUTTONS[key];
        this.currNeck[key] = gp.buttons[idx]?.pressed ?? false;
      }

      this.currPick.down = gp.buttons[PICK_DOWN]?.pressed ?? false;
      this.currPick.up = gp.buttons[PICK_UP]?.pressed ?? false;
      this.currStart = gp.buttons[START_BUTTON]?.pressed ?? false;
      this.currSelect = gp.buttons[SELECT_BUTTON]?.pressed ?? false;
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

  getNeckState(): NeckState {
    return { ...this.currNeck };
  }

  getNeckJustPressed(): NeckState {
    const result = emptyNeck();
    for (const key of Object.keys(NECK_BUTTONS) as NeckKey[]) {
      result[key] = this.currNeck[key] && !this.prevNeck[key];
    }
    return result;
  }

  getNeckJustReleased(): NeckState {
    const result = emptyNeck();
    for (const key of Object.keys(NECK_BUTTONS) as NeckKey[]) {
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
