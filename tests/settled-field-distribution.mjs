// Settled debris should bunch unevenly, not repeat equal spacing or a sorted size catalogue.
import assert from 'node:assert/strict';
import { makeGame, randomState } from './helpers/flight-game.mjs';

{
  const gaps = [], localSizeRatios = [], populationRatios = [], sizes = [], slots = [];
  for (const level of [2, 5, 8, 11, 17, 20]) for (const seed of [123, 456, 789]) {
    randomState.seed = seed;
    const game = makeGame(); game.setLevel(level); game.setupLevelFleet(); game.updateAsteroidShower(0);
    const group = game.fieldGroups[0], pieces = game.fieldDebris;
    assert.equal(group.diffuse, true);
    assert.ok(pieces.some(piece => piece.pocket === -1), 'Some isolated pieces remain outside the pockets');
    assert.ok(pieces.filter(piece => piece.pocket >= 0).length > pieces.length / 2, 'Most debris belongs to local pockets, not a uniform filler');
    const populations = group.pockets.map((pocket, index) => {
      const members = pieces.filter(piece => piece.pocket === index);
      for (const piece of members) {
        assert.ok(piece.position.distanceTo(pocket.center) <= Math.max(...pocket.spread.toArray()) + 1e-7,
          'The actual positions occupy the authored pockets');
      }
      return members;
    }).filter(members => members.length >= 5);
    assert.ok(populations.length >= 2, 'Multiple populated pockets, not one compact replacement cloud');
    const means = populations.map(members => members.reduce((sum, piece) => sum + piece.size, 0) / members.length);
    localSizeRatios.push(Math.max(...means) / Math.min(...means));
    populationRatios.push(Math.max(...populations.map(members => members.length)) / Math.min(...populations.map(members => members.length)));
    pieces.forEach((piece, index) => {
      const nearest = Math.min(...pieces.filter((_, other) => other !== index)
        .map(other => piece.position.distanceTo(other.position) - (piece.size + other.size) * 1.7));
      assert.ok(nearest >= 1 - 1e-7, 'Tight groups still have disjoint conservative hulls');
      gaps.push(nearest);
      sizes.push(Math.log(piece.size)); slots.push(index % 10);
    });
  }
  // Evaluate populations across fields, not a forced small/medium/large quota in every batch.
  gaps.sort((a, b) => a - b);
  const tight = gaps[Math.floor(gaps.length * .1)], loose = gaps[Math.floor(gaps.length * .9)];
  assert.ok(tight < 10 && loose > 30 && loose / tight > 6, 'Close neighbours and genuinely sparse areas, not the old even padding');
  assert.ok(localSizeRatios.filter(ratio => ratio > 2).length > localSizeRatios.length / 2,
    'Different regions have measurably different size mixes');
  assert.ok(populationRatios.filter(ratio => ratio > 2).length > populationRatios.length / 2,
    'Pockets have unequal populations, not identical repeated clumps');
  const meanSlot = slots.reduce((sum, value) => sum + value, 0) / slots.length;
  const meanSize = sizes.reduce((sum, value) => sum + value, 0) / sizes.length;
  const covariance = slots.reduce((sum, value, index) => sum + (value - meanSlot) * (sizes[index] - meanSize), 0);
  const correlation = covariance / Math.sqrt(slots.reduce((sum, value) => sum + (value - meanSlot) ** 2, 0)
    * sizes.reduce((sum, value) => sum + (value - meanSize) ** 2, 0));
  assert.ok(Math.abs(correlation) < .2, 'No repeating ten-piece small-to-large size sequence');
}
console.log('PASS uneven settled spacing, unequal local populations and size families, isolated outliers and no periodic size quotas');
