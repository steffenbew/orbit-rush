// All times are simulation seconds. No wall clock, controls, sounds or HUD here.
const shotInterval = .1, emptyInterval = .3, coolingDelay = .2;
const heatPerShot = 6.7, coolingPerSecond = 33, heavyRechargeSeconds = .81;
const epsilon = 1e-9; // A fixed step can land just below the next shot time.

export function playerLaserSpeed(flightMotion, heavy) {
  return (flightMotion.length() + 420) * (heavy ? 1.25 : 1.5);
}

export function createWeapons() {
  return { heat: 0, overheated: false, heavyCharge: 1, lastShot: -Infinity, lastEmpty: -Infinity };
}

export function advanceWeapons(weapons, time, dt) {
  weapons.heavyCharge = Math.min(1, weapons.heavyCharge + dt / heavyRechargeSeconds);
  if (!weapons.heat) return;
  const coolingTime = weapons.overheated ? dt : Math.min(dt, Math.max(0, time - weapons.lastShot - coolingDelay));
  weapons.heat = Math.max(0, weapons.heat - coolingPerSecond * coolingTime);
  if (weapons.heat === 0) weapons.overheated = false;
}

// null = silent cooldown, 'empty' = feedback only, 'shot' = spawn a projectile.
export function requestShot(weapons, time, heavy, manualAttempt) {
  if (heavy ? weapons.heavyCharge < 1 : weapons.overheated) {
    if (!manualAttempt && (time - weapons.lastShot < shotInterval - epsilon ||
        time - weapons.lastEmpty < emptyInterval - epsilon)) return null;
    weapons.lastEmpty = time;
    return 'empty';
  }
  if (heavy) {
    weapons.heavyCharge = 0;
  } else {
    if (time - weapons.lastShot < shotInterval - epsilon) return null;
    weapons.lastShot = time;
    weapons.heat = Math.min(100, weapons.heat + heatPerShot);
    weapons.overheated = weapons.heat === 100;
  }
  return 'shot';
}
