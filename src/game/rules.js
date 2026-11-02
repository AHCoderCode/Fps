export const WEAPONS = Object.freeze({
  rifle: Object.freeze({ id: "rifle", name: "ASSAULT RIFLE", category: "PRIMARY", short: "AR", damage: 20, fireDelay: 0.105, magazine: 30, reserve: 90, reloadTime: 1.55, range: 48, spread: 0.006, automatic: true, color: 0x60d6ff }),
  sniper: Object.freeze({ id: "sniper", name: "SNIPER RIFLE", category: "PRECISION", short: "SR", damage: 86, fireDelay: 0.9, magazine: 5, reserve: 25, reloadTime: 2.1, range: 80, spread: 0.0008, automatic: false, color: 0xffd166 }),
  handgun: Object.freeze({ id: "handgun", name: "HANDGUN", category: "SECONDARY", short: "HG", damage: 25, fireDelay: 0.28, magazine: 12, reserve: 60, reloadTime: 1.2, range: 34, spread: 0.009, automatic: false, color: 0x91f0b3 }),
  revolver: Object.freeze({ id: "revolver", name: "REVOLVER", category: "SECONDARY", short: "RV", damage: 43, fireDelay: 0.52, magazine: 6, reserve: 36, reloadTime: 1.7, range: 42, spread: 0.004, automatic: false, color: 0xffa26b }),
  knife: Object.freeze({ id: "knife", name: "FIXED KNIFE", category: "MELEE", short: "KN", damage: 72, backstabDamage: 150, fireDelay: 0.58, range: 2.5, color: 0xc6d3e8 })
});

export const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ label: "Easy", accuracy: 0.2, reaction: 0.9, fireScale: 1.3, speed: 3.5, strafe: 0.25, awareness: 23, aimJitter: 0.12 }),
  normal: Object.freeze({ label: "Normal", accuracy: 0.42, reaction: 0.48, fireScale: 1, speed: 4.1, strafe: 0.55, awareness: 30, aimJitter: 0.075 }),
  hard: Object.freeze({ label: "Hard", accuracy: 0.64, reaction: 0.28, fireScale: 0.82, speed: 4.6, strafe: 0.8, awareness: 36, aimJitter: 0.045 }),
  expert: Object.freeze({ label: "Expert", accuracy: 0.78, reaction: 0.16, fireScale: 0.68, speed: 4.9, strafe: 1, awareness: 40, aimJitter: 0.025 })
});

export const MATCH_RULES = Object.freeze({ duration: 180, scoreLimit: 20, botCount: 5, respawnDelay: 2.6, playerHealth: 100 });

export function getBotProfile(difficulty = "normal") {
  return BOT_DIFFICULTIES[difficulty] ?? BOT_DIFFICULTIES.normal;
}

export function isBackstab(attackerPosition, targetPosition, targetForward, threshold = 0.45) {
  const ax = Number(attackerPosition?.x) - Number(targetPosition?.x);
  const az = Number(attackerPosition?.z) - Number(targetPosition?.z);
  const fx = Number(targetForward?.x);
  const fz = Number(targetForward?.z);
  const attackerLength = Math.hypot(ax, az);
  const forwardLength = Math.hypot(fx, fz);
  if (!Number.isFinite(attackerLength + forwardLength) || attackerLength < 0.0001 || forwardLength < 0.0001) return false;
  const behindDot = ((-ax * fx) + (-az * fz)) / (attackerLength * forwardLength);
  return behindDot >= threshold;
}

export function calculateAreaDamage(maxDamage, distance, radius) {
  if (![maxDamage, distance, radius].every(Number.isFinite) || radius <= 0 || distance < 0 || distance >= radius) return 0;
  return Math.max(0, maxDamage * (1 - distance / radius));
}

export function formatClock(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}