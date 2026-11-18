import { t } from '../presentation/i18n.js';

export function createTargetHud(root) {
  const targetMarker = root.querySelector('#target');
  const targetHealth = targetMarker.querySelector('.health');
  return function render(lock, viewCamera, width, height) {
    const selected = lock.ship;
    targetMarker.hidden = !selected;
    targetMarker.classList.toggle('locked', lock.locked);
    targetMarker.style.setProperty('--lock-progress', String(lock.progress));
    if (selected) {
      root.querySelector('#target-name').textContent = selected.userData.type.name;
      const segments = selected.userData.type.capital ? 10 : Math.min(12, selected.userData.maxHealth);
      if (targetHealth.childElementCount !== segments) {
        targetHealth.replaceChildren(...Array.from({ length: segments }, () => root.createElement('i')));
      }
      const hitsPerSegment = selected.userData.maxHealth / segments;
      [...targetHealth.children].forEach((bar, index) => {
        const remaining = Math.min(1, Math.max(0, (selected.userData.health - index * hitsPerSegment) / hitsPerSegment));
        bar.classList.toggle('spent', remaining === 0);
        bar.style.setProperty('--health-fill', String(remaining));
      });
      const projectedShip = selected.position.clone().project(viewCamera);
      targetMarker.style.left = `${(projectedShip.x * .5 + .5) * width}px`;
      targetMarker.style.top = `${(-projectedShip.y * .5 + .5) * height}px`;
    }
  };
}

const heatColors = [[126, 255, 213], [255, 178, 77], [255, 61, 72]];

export function createWeaponHud(root, reticle) {
  const heavyEnergyBar = root.querySelector('#heavy-energy');
  const energyRing = root.querySelector('.weapon-ring');
  const cooldownFill = root.querySelector('.cooldown-fill');
  return function render({ heat: heatValue, overheated, heavyCharge: heavyEnergy }) {
    heavyEnergyBar.hidden = heavyEnergy === 1;
    heavyEnergyBar.value = heavyEnergy;
    heavyEnergyBar.setAttribute('aria-valuetext', heavyEnergy < 1
      ? t('recharging', { percent: Math.round(heavyEnergy * 100) })
      : t('powerReady'));

    const energy = Math.round(100 - heatValue);
    const heat = heatValue / 100;
    // Smoothstep eases the color at both ends; the energy ring stays linear.
    const colorProgress = heat * heat * (3 - 2 * heat) * 2;
    const segment = colorProgress < 1 ? 0 : 1;
    const blend = colorProgress - segment;
    const color = heatColors[segment].map((channel, i) =>
      Math.round(channel + (heatColors[segment + 1][i] - channel) * blend));
    reticle.style.setProperty('--heat-color', `rgb(${color.join(' ')})`);
    reticle.classList.toggle('has-heat', heatValue > 0);
    cooldownFill.setAttribute('stroke-dashoffset', heatValue.toFixed(2));
    reticle.classList.toggle('overheated', overheated);
    energyRing.setAttribute('aria-valuenow', String(energy));
    energyRing.setAttribute('aria-valuetext', t(overheated ? 'overheated' : 'energyPercent', { percent: energy }));
  };
}
