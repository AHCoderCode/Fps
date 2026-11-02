import test from "node:test";
import assert from "node:assert/strict";
import { BOT_DIFFICULTIES, WEAPONS, calculateAreaDamage, formatClock, getBotProfile, isBackstab } from "../src/game/rules.js";

test("starter arsenal contains the five required distinct weapon roles", () => {
  assert.deepEqual(Object.keys(WEAPONS), ["rifle", "sniper", "handgun", "revolver", "knife"]);
  assert.equal(WEAPONS.rifle.magazine, 30);
  assert.equal(WEAPONS.sniper.magazine, 5);
  assert.equal(WEAPONS.revolver.magazine, 6);
  assert.equal(WEAPONS.knife.backstabDamage > WEAPONS.knife.damage, true);
});

test("all four bot profiles are ordered by intended challenge", () => {
  const levels = ["easy", "normal", "hard", "expert"].map(getBotProfile);
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index].accuracy > levels[index - 1].accuracy);
    assert.ok(levels[index].speed >= levels[index - 1].speed);
    assert.ok(levels[index].aimJitter < levels[index - 1].aimJitter);
  }
  assert.equal(getBotProfile("unknown"), BOT_DIFFICULTIES.normal);
});

test("backstab validation distinguishes front, rear, and invalid directions", () => {
  const target = { x: 0, z: 0 };
  const targetForward = { x: 0, z: -1 };
  assert.equal(isBackstab({ x: 0, z: 3 }, target, targetForward), true);
  assert.equal(isBackstab({ x: 0, z: -3 }, target, targetForward), false);
  assert.equal(isBackstab({ x: 0, z: 0 }, target, targetForward), false);
  assert.equal(isBackstab({ x: 0, z: 3 }, target, { x: 0, z: 0 }), false);
});

test("area damage falls off smoothly and never applies outside its radius", () => {
  assert.equal(calculateAreaDamage(80, 0, 5), 80);
  assert.equal(calculateAreaDamage(80, 2.5, 5), 40);
  assert.equal(calculateAreaDamage(80, 5, 5), 0);
  assert.equal(calculateAreaDamage(80, -1, 5), 0);
  assert.equal(calculateAreaDamage(80, 1, 0), 0);
});

test("match clock formatting is stable at minute boundaries", () => {
  assert.equal(formatClock(180), "03:00");
  assert.equal(formatClock(59.2), "01:00");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(-2), "00:00");
});