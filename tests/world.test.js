import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleHour, daylight, groundHeight, movePosition, shore } from '../src/world.js';
import { noteFrequency, TRACKS } from '../src/audio.js';

test('walking stays on land for every camera heading, including diagonal movement', () => {
  for (let heading = 0; heading < 360; heading += 15) {
    for (const input of [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: -1, y: -1 }]) {
      let position = { x: 0, z: 10 };
      for (let step = 0; step < 800; step++) position = movePosition(position, input, heading * Math.PI / 180, 0.05);
      assert.ok(position.x >= -30 && position.x <= 30);
      assert.ok(position.z <= 30 && position.z >= shore(position.x) + 1.699);
      assert.ok(groundHeight(position.x, position.z) > 0);
    }
  }
});

test('camera-relative walking and diagonal speed remain consistent', () => {
  const start = { x: 0, z: 10 };
  const forward = movePosition(start, { x: 0, y: 1 }, 0, 0.05);
  const turned = movePosition(start, { x: 0, y: 1 }, Math.PI / 2, 0.05);
  assert.ok(forward.z < start.z && forward.x === 0);
  assert.ok(turned.x < start.x && Math.abs(turned.z - start.z) < 1e-10);
  const diagonal = movePosition(start, { x: 1, y: 1 }, 0, 0.05);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z - start.z) - 0.15) < 1e-10);
  assert.deepEqual(movePosition(start, { x: 1, y: 1 }, 0, 5), diagonal, 'resuming from a stalled frame must not teleport');
});

test('time wraps through midnight and completes a day in 12 minutes', () => {
  assert.ok(Math.abs(cycleHour(23.99, 0.6) - 0.01) < 1e-10);
  assert.equal(cycleHour(14, 720), 14);
  assert.equal(daylight(12), 1);
  assert.equal(daylight(0), 0);
  for (let h = 0; h <= 24; h += 0.1) assert.ok(daylight(h) >= 0 && daylight(h) <= 1);
});

test('shore slope is continuous and finite throughout the walking area', () => {
  for (let x = -30; x <= 30; x++) {
    assert.ok(Math.abs(groundHeight(x, shore(x) - 0.01) - groundHeight(x, shore(x) + 0.01)) < 0.05);
    for (let z = -20; z <= 40; z++) assert.ok(Number.isFinite(groundHeight(x, z)));
  }
});

test('all music presets use audible finite frequencies and safe tempos', () => {
  assert.equal(noteFrequency(69), 440);
  for (const track of Object.values(TRACKS)) {
    assert.ok(track.tempo >= 40 && track.tempo <= 120);
    for (const note of track.notes.filter(n => n !== null)) {
      const hz = noteFrequency(track.root + note);
      assert.ok(Number.isFinite(hz) && hz >= 100 && hz <= 2000);
    }
  }
});
