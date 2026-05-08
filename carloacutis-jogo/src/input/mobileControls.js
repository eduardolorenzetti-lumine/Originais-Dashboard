const controlState = {
  up: false,
  down: false,
  jump: false,
  record: false,
};

function bindHoldButton(elementId, key) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  const press = (event) => {
    event.preventDefault();
    controlState[key] = true;
  };

  const release = (event) => {
    event.preventDefault();
    controlState[key] = false;
  };

  element.addEventListener("pointerdown", press);
  element.addEventListener("pointerup", release);
  element.addEventListener("pointerleave", release);
  element.addEventListener("pointercancel", release);
}

export function setupMobileControls() {
  bindHoldButton("btn-up", "up");
  bindHoldButton("btn-down", "down");
  bindHoldButton("btn-jump", "jump");
  bindHoldButton("btn-record", "record");
}

export function readAndResetMobileAction(key) {
  const active = controlState[key];
  controlState[key] = false;
  return active;
}

export function readMobileHold(key) {
  return controlState[key];
}
