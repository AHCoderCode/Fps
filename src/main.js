import "./style.css";
import * as THREE from "three";
import { buildArena } from "./game/arena.js";
import { createBotAvatar, createWeaponViewModel } from "./game/actors.js";
import {
  BOT_DIFFICULTIES, MATCH_RULES, WEAPONS, calculateAreaDamage,
  formatClock, getBotProfile, isBackstab
} from "./game/rules.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game-canvas");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1524);
scene.fog = new THREE.Fog(0x0b1524, 34, 78);

const camera = new THREE.PerspectiveCamera(76, 1, 0.1, 100);
camera.rotation.order = "YXZ";
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setClearColor(0x0b1524, 1);

const arena = buildArena(scene);
const weaponView = createWeaponViewModel(camera);
const raycaster = new THREE.Raycaster();
const centerAim = new THREE.Vector2(0, 0);

const input = {
  keys: new Set(),
  moveX: 0,
  moveY: 0,
  fire: false,
  firePressed: false,
  aim: false,
  jumpPressed: false,
  lookPointer: null,
  lastLookX: 0,
  lastLookY: 0
};

const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const savedSettings = loadSettings();
let audioContext = null;
let gameActive = false;
let gamePaused = false;
let matchEnded = false;
let gameTime = 0;
let matchRemaining = MATCH_RULES.duration;
let playerScore = 0;
let botScore = 0;
let difficulty = "normal";
let uiAccumulator = 0;
let damageFlashUntil = 0;
let hitMarkerUntil = 0;
let toastTimeout = 0;
let settingsReturn = "menu";
let lastFrame = performance.now();
let wasPointerLocked = false;
let scorePanelVisible = false;
let matchStartAt = 0;

const player = {
  position: new THREE.Vector3(-21, 0, 0),
  velocity: new THREE.Vector3(),
  verticalVelocity: 0,
  yaw: -Math.PI / 2,
  pitch: 0,
  health: MATCH_RULES.playerHealth,
  alive: true,
  respawnAt: 0,
  kills: 0,
  deaths: 0,
  weaponId: "rifle",
  ammo: {},
  nextFireAt: 0,
  nextMeleeAt: 0,
  reloadUntil: 0,
  reloading: false,
  grounded: true,
  recoil: 0
};

const bots = Array.from({ length: MATCH_RULES.botCount }, (_, index) => {
  const bot = createBotAvatar(scene, index);
  bot.difficulty = difficulty;
  bot.ammo = createBotAmmo();
  bot.moveVector = new THREE.Vector3();
  bot.lastPosition = bot.position.clone();
  bot.stuckCheckAt = 0;
  bot.stuckCounter = 0;
  return bot;
});

const projectiles = [];
const areaFields = [];
const visualEffects = [];
const utilityGeometry = new THREE.SphereGeometry(0.19, 10, 8);
const explosionGeometry = new THREE.SphereGeometry(1, 12, 9);
const fieldGeometry = new THREE.RingGeometry(0.85, 1, 36);
const playerForward = new THREE.Vector3();
const playerRight = new THREE.Vector3();
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();

initializePlayerAmmo();
applySavedSettings();
refreshWeapon();

function loadSettings() {
  const defaults = { sensitivity: 1, volume: 0.55, invertY: false };
  try {
    const stored = JSON.parse(localStorage.getItem("arcfield-settings") || "null");
    return stored && typeof stored === "object" ? { ...defaults, ...stored } : defaults;
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try {
    localStorage.setItem("arcfield-settings", JSON.stringify(savedSettings));
  } catch {
    // Settings remain available for this session even when storage is blocked.
  }
}

function applySavedSettings() {
  $("sensitivity-setting").value = String(savedSettings.sensitivity);
  $("volume-setting").value = String(savedSettings.volume);
  $("invert-y-setting").checked = Boolean(savedSettings.invertY);
  $("sensitivity-value").textContent = Number(savedSettings.sensitivity).toFixed(2) + "×";
  $("volume-value").textContent = Math.round(savedSettings.volume * 100) + "%";
}

function initializePlayerAmmo() {
  player.ammo = {};
  for (const id of ["rifle", "sniper", "handgun", "revolver"]) {
    const weapon = WEAPONS[id];
    player.ammo[id] = { magazine: weapon.magazine, reserve: weapon.reserve };
  }
}

function createBotAmmo() {
  const ammo = {};
  for (const id of ["rifle", "sniper", "handgun", "revolver"]) {
    ammo[id] = { magazine: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve };
  }
  return ammo;
}

function getPlayerForward(target = playerForward) {
  return target.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).normalize();
}

function playTone(frequency = 420, duration = 0.055, volume = 0.035, type = "triangle") {
  if (savedSettings.volume <= 0) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext ??= new AudioCtor();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(Math.max(0.0001, volume * savedSettings.volume), audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Audio is an enhancement; gameplay does not depend on it.
  }
}

function showToast(message, duration = 1500) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.add("hidden"), duration);
}

function addKillFeed(message, fromBot = false) {
  const feed = $("kill-feed");
  const row = document.createElement("div");
  row.textContent = message;
  if (fromBot) row.classList.add("bot-feed");
  feed.prepend(row);
  while (feed.children.length > 4) feed.lastElementChild.remove();
  window.setTimeout(() => row.remove(), 4200);
}

function showHitMarker(elimination = false) {
  hitMarkerUntil = gameTime + 0.23;
  const marker = $("hit-marker");
  marker.textContent = elimination ? "✕" : "×";
  marker.classList.remove("show");
  void marker.offsetWidth;
  marker.classList.add("show");
  playTone(elimination ? 870 : 660, 0.065, elimination ? 0.055 : 0.035);
}

function refreshWeapon() {
  const config = WEAPONS[player.weaponId];
  weaponView.setWeapon(player.weaponId, config.color);
  $("weapon-name").textContent = config.name;
  $("weapon-category").textContent = config.category;
  for (const slot of document.querySelectorAll(".weapon-slot")) {
    slot.classList.toggle("active", Number(slot.dataset.slot) === ["rifle", "sniper", "handgun", "revolver", "knife"].indexOf(player.weaponId) + 1);
  }
  updateHUD();
}

function equipWeapon(id) {
  if (!WEAPONS[id] || player.weaponId === id) return;
  player.weaponId = id;
  player.reloading = false;
  player.reloadUntil = 0;
  refreshWeapon();
  playTone(300, 0.045, 0.025, "square");
}

function chooseWeaponSlot(slot) {
  const ids = ["rifle", "sniper", "handgun", "revolver", "knife"];
  const id = ids[Number(slot) - 1];
  if (id) equipWeapon(id);
}

function cycleWeapon(direction) {
  const ids = ["rifle", "sniper", "handgun", "revolver", "knife"];
  const current = ids.indexOf(player.weaponId);
  equipWeapon(ids[(current + direction + ids.length) % ids.length]);
}

function requestPointerLock() {
  if (isTouchDevice) return;
  try {
    const result = canvas.requestPointerLock?.();
    if (result && typeof result.catch === "function") result.catch(() => showToast("CLICK THE ARENA TO ENABLE MOUSE LOOK"));
  } catch {
    showToast("MOUSE LOOK IS AVAILABLE WHILE DRAGGING");
  }
}

function startMatch() {
  difficulty = $("bot-difficulty").value in BOT_DIFFICULTIES ? $("bot-difficulty").value : "normal";
  gameTime = 0;
  matchRemaining = MATCH_RULES.duration;
  playerScore = 0;
  botScore = 0;
  player.kills = 0;
  player.deaths = 0;
  player.health = MATCH_RULES.playerHealth;
  player.alive = true;
  player.respawnAt = 0;
  player.verticalVelocity = 0;
  player.grounded = true;
  player.velocity.set(0, 0, 0);
  player.yaw = -Math.PI / 2;
  player.pitch = 0;
  player.nextFireAt = 0;
  player.nextMeleeAt = 0;
  player.reloading = false;
  player.recoil = 0;
  initializePlayerAmmo();
  player.utilityCooldowns = { grenade: 0, molotov: 0 };
  input.fire = false;
  input.firePressed = false;
  input.aim = false;
  input.keys.clear();
  player.reloading = false;
  player.position.set(-21, 0, 0);
  arena.resolveCircle(player.position, 0.48);
  equipWeapon("rifle");
  clearCombatObjects();

  bots.forEach((bot, index) => {
    bot.kills = 0;
    bot.deaths = 0;
    resetBot(bot, index);
  });
  for (const node of $("kill-feed").children) node.remove();

  matchEnded = false;
  gamePaused = false;
  gameActive = true;
  matchStartAt = performance.now();
  scorePanelVisible = false;
  $("menu-screen").classList.add("hidden");
  $("pause-screen").classList.add("hidden");
  $("result-screen").classList.add("hidden");
  $("settings-screen").classList.add("hidden");
  $("scoreboard-panel").classList.add("hidden");
  $("hud").classList.remove("hidden");
  $("touch-controls").classList.toggle("hidden", !isTouchDevice);
  $("scope-overlay").classList.remove("active");
  $("damage-vignette").classList.remove("show");
  $("status-label").textContent = "READY";
  updateHUD();
  audioContext?.resume?.();
  playTone(520, 0.12, 0.04);
  requestPointerLock();
  if (isTouchDevice) showToast("DRAG THE ARENA TO AIM", 2100);
}

function resetBot(bot, index) {
  const spawnList = arena.spawnPoints.bots;
  const spawn = spawnList[index % spawnList.length];
  bot.position.set(spawn.x + (Math.random() - 0.5) * 1.2, 0, spawn.z + (Math.random() - 0.5) * 1.2);
  arena.resolveCircle(bot.position, 0.48);
  bot.group.position.copy(bot.position);
  bot.health = 100;
  bot.alive = true;
  bot.respawnAt = 0;
  bot.velocity.set(0, 0, 0);
  bot.yaw = Math.PI / 2;
  bot.forward.set(-1, 0, 0);
  bot.group.rotation.y = bot.yaw;
  bot.nextThinkAt = gameTime + Math.random() * 0.35;
  bot.nextFireAt = gameTime + 0.6 + Math.random() * 0.6;
  bot.nextUtilityAt = gameTime + 5 + Math.random() * 4;
  bot.nextMeleeAt = 0;
  bot.nextWanderAt = 0;
  bot.lastKnownPlayer = null;
  bot.lastSeenAt = 0;
  bot.reloadUntil = 0;
  bot.weaponId = "rifle";
  bot.ammo = createBotAmmo();
  bot.moveVector.set(0, 0, 0);
  bot.lastPosition.copy(bot.position);
  bot.stuckCheckAt = gameTime + 2;
  bot.stuckCounter = 0;
  bot.strafeSign = index % 2 === 0 ? 1 : -1;
  bot.difficulty = difficulty;
  bot.group.visible = true;
}

function clearCombatObjects() {
  for (const projectile of projectiles) {
    scene.remove(projectile.mesh);
    projectile.material.dispose();
  }
  projectiles.length = 0;
  for (const field of areaFields) {
    scene.remove(field.mesh);
    field.material.dispose();
  }
  areaFields.length = 0;
  for (const effect of visualEffects) {
    scene.remove(effect.mesh);
    effect.material.dispose();
  }
  visualEffects.length = 0;
}

function pauseMatch() {
  if (!gameActive || gamePaused || matchEnded) return;
  gamePaused = true;
  input.fire = false;
  input.firePressed = false;
  input.aim = false;
  input.keys.clear();
  input.moveX = 0;
  input.moveY = 0;
  $("pause-screen").classList.remove("hidden");
  $("touch-controls").classList.add("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeMatch() {
  if (!gameActive || !gamePaused) return;
  gamePaused = false;
  $("pause-screen").classList.add("hidden");
  $("touch-controls").classList.toggle("hidden", !isTouchDevice);
  requestPointerLock();
}

function returnToMenu() {
  gameActive = false;
  gamePaused = false;
  matchEnded = false;
  input.fire = false;
  input.firePressed = false;
  input.aim = false;
  input.keys.clear();
  input.moveX = 0;
  input.moveY = 0;
  clearCombatObjects();
  if (document.pointerLockElement) document.exitPointerLock();
  $("pause-screen").classList.add("hidden");
  $("result-screen").classList.add("hidden");
  $("settings-screen").classList.add("hidden");
  $("hud").classList.add("hidden");
  $("touch-controls").classList.add("hidden");
  $("scoreboard-panel").classList.add("hidden");
  $("menu-screen").classList.remove("hidden");
}

function finishMatch() {
  if (matchEnded) return;
  matchEnded = true;
  gameActive = false;
  gamePaused = false;
  $("touch-controls").classList.add("hidden");
  $("pause-screen").classList.add("hidden");
  $("scoreboard-panel").classList.add("hidden");
  $("scope-overlay").classList.remove("active");
  if (document.pointerLockElement) document.exitPointerLock();

  input.fire = false;
  input.aim = false;
  const won = playerScore > botScore;
  const tied = playerScore === botScore;
  $("result-kicker").textContent = won ? "VICTORY // BLUE TEAM" : tied ? "MATCH DRAW" : "DEFEAT // RED TEAM";
  $("result-kicker").style.color = won ? "#8df0c5" : tied ? "#ffd166" : "#ff8291";
  $("result-title").innerHTML = won ? "FIELD<br><em>DOMINATED.</em>" : tied ? "EVEN<br><em>GROUND.</em>" : "REGROUP<br><em>AND RETRY.</em>";
  $("result-summary").textContent = `Final score ${playerScore} — ${botScore}. ${won ? "You controlled the arena." : tied ? "Neither side claimed the lead." : "The opposition reached the lead this round."}`;
  $("result-elims").textContent = String(player.kills).padStart(2, "0");
  $("result-deaths").textContent = String(player.deaths).padStart(2, "0");
  $("result-screen").classList.remove("hidden");
  playTone(won ? 660 : 220, 0.22, 0.05);
}

function damageBot(bot, amount, source = "player", headshot = false) {
  if (!bot?.alive || !gameActive || matchEnded) return;
  bot.health = Math.max(0, bot.health - Math.max(0, amount));
  if (source === "player") showHitMarker(bot.health <= 0);
  if (bot.health > 0) return;

  bot.alive = false;
  bot.deaths += 1;
  bot.respawnAt = gameTime + MATCH_RULES.respawnDelay;
  bot.group.visible = false;
  bot.moveVector.set(0, 0, 0);
  if (source === "player") {
    player.kills += 1;
    playerScore += 1;
    addKillFeed(`YOU  →  ${bot.name}${headshot ? "  //  HEAD" : ""}`);
  }
  playTone(170, 0.12, 0.035, "sawtooth");
  checkMatchEnd();
  updateHUD();
}

function damagePlayer(amount, sourceBot = null) {
  if (!player.alive || !gameActive || matchEnded) return;
  player.health = Math.max(0, player.health - Math.max(0, amount));
  damageFlashUntil = gameTime + 0.14;
  if (player.health > 0) {
    playTone(115, 0.045, 0.027, "sawtooth");
    return;
  }

  player.alive = false;
  input.fire = false;
  input.aim = false;
  player.deaths += 1;
  player.respawnAt = gameTime + MATCH_RULES.respawnDelay;
  botScore += 1;
  if (sourceBot) {
    sourceBot.kills += 1;
    addKillFeed(`${sourceBot.name}  →  YOU`, true);
  } else {
    addKillFeed("OPPOSITION  →  YOU", true);
  }
  $("status-label").textContent = "RESPAWNING";
  weaponView.group.visible = false;
  playTone(90, 0.2, 0.045, "sawtooth");
  checkMatchEnd();
  updateHUD();
}

function checkMatchEnd() {
  if (matchEnded) return;
  if (playerScore >= MATCH_RULES.scoreLimit || botScore >= MATCH_RULES.scoreLimit || matchRemaining <= 0) {
    finishMatch();
  }
}

function respawnPlayer() {
  const spawn = arena.spawnPoints.player[Math.floor(Math.random() * arena.spawnPoints.player.length)];
  player.position.set(spawn.x, 0, spawn.z);
  arena.resolveCircle(player.position, 0.48);
  player.velocity.set(0, 0, 0);
  player.verticalVelocity = 0;
  player.health = MATCH_RULES.playerHealth;
  player.alive = true;
  player.reloading = false;
  player.reloadUntil = 0;
  player.grounded = true;
  player.yaw = -Math.PI / 2;
  player.pitch = 0;
  player.reloading = false;
  weaponView.group.visible = true;
  $("status-label").textContent = "READY";
  updateHUD();
  showToast("BACK IN THE FIELD", 1000);
}

function beginReload() {
  const config = WEAPONS[player.weaponId];
  if (config.id === "knife" || player.reloading) return;
  const ammo = player.ammo[player.weaponId];
  if (!ammo || ammo.magazine >= config.magazine || ammo.reserve <= 0) return;
  player.reloading = true;
  player.reloadUntil = gameTime + config.reloadTime;
  $("reload-label").textContent = "RELOADING";
  $("status-label").textContent = "RELOADING";
  playTone(260, 0.07, 0.025);
}

function updateReload() {
  if (player.reloading && gameTime >= player.reloadUntil) {
    const config = WEAPONS[player.weaponId];
    const ammo = player.ammo[player.weaponId];
    const needed = config.magazine - ammo.magazine;
    const loaded = Math.min(needed, ammo.reserve);
    ammo.magazine += loaded;
    ammo.reserve -= loaded;
    player.reloading = false;
    $("status-label").textContent = player.alive ? "READY" : "RESPAWNING";
    playTone(510, 0.055, 0.03);
  }
}

function playerMelee() {
  const config = WEAPONS.knife;
  if (gameTime < player.nextMeleeAt || !player.alive) return;
  player.nextMeleeAt = gameTime + config.fireDelay;
  const forward = getPlayerForward(scratchA);
  let selected = null;
  let selectedDistance = Infinity;
  let selectedBackstab = false;
  for (const bot of bots) {
    if (!bot.alive) continue;
    const toBot = scratchB.subVectors(bot.position, player.position);
    const distance = toBot.length();
    if (distance > config.range || distance < 0.01) continue;
    toBot.normalize();
    if (forward.dot(toBot) < 0.18) continue;
    if (distance < selectedDistance) {
      selected = bot;
      selectedDistance = distance;
      selectedBackstab = isBackstab(player.position, bot.position, bot.forward);
    }
  }
  if (selected) {
    damageBot(selected, selectedBackstab ? config.backstabDamage : config.damage, "player");
    if (selectedBackstab) showToast("BACKSTAB // BONUS DAMAGE", 850);
  }
  player.recoil = Math.max(player.recoil, 0.18);
  playTone(190, 0.065, 0.03, "triangle");
}

function playerFire() {
  if (!gameActive || gamePaused || !player.alive || matchEnded) return;
  const weapon = WEAPONS[player.weaponId];
  if (weapon.id === "knife") {
    playerMelee();
    return;
  }
  if (player.reloading || gameTime < player.nextFireAt) return;
  const ammo = player.ammo[player.weaponId];
  if (!ammo || ammo.magazine <= 0) {
    beginReload();
    return;
  }

  ammo.magazine -= 1;
  player.nextFireAt = gameTime + weapon.fireDelay;
  player.recoil = Math.min(0.25, player.recoil + 0.085);
  camera.updateMatrixWorld();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const spread = player.weaponId === "sniper" && input.aim ? weapon.spread * 0.2 : weapon.spread;
  direction.x += (Math.random() - 0.5) * spread;
  direction.y += (Math.random() - 0.5) * spread;
  direction.z += (Math.random() - 0.5) * spread;
  direction.normalize();

  scene.updateMatrixWorld(true);
  const targetMeshes = [];
  for (const bot of bots) {
    if (bot.alive) targetMeshes.push(...bot.parts);
  }
  raycaster.set(camera.position, direction);
  raycaster.far = weapon.range;
  const hits = raycaster.intersectObjects([...arena.occluders, ...targetMeshes], false);
  if (hits.length) {
    const hit = hits[0];
    const botId = hit.object.userData.botId;
    if (Number.isInteger(botId)) {
      const target = bots[botId];
      const headshot = hit.object.userData.hitPart === "head";
      damageBot(target, weapon.damage * (headshot ? 1.28 : 1), "player", headshot);
    }
  }

  $("crosshair").classList.add("firing");
  window.setTimeout(() => $("crosshair").classList.remove("firing"), 75);
  weaponView.group.position.z = -0.59;
  playTone(player.weaponId === "sniper" ? 125 : player.weaponId === "revolver" ? 205 : 330, player.weaponId === "sniper" ? 0.13 : 0.045, player.weaponId === "sniper" ? 0.065 : 0.035, "square");
}

function addUtilityVisual(position, color, scale, life) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, wireframe: true });
  const mesh = new THREE.Mesh(explosionGeometry, material);
  mesh.position.copy(position);
  mesh.scale.setScalar(0.15);
  scene.add(mesh);
  visualEffects.push({ mesh, material, color, scale, life, maxLife: life });
}

function throwUtility(kind, owner = "player", originOverride = null, directionOverride = null) {
  if (owner === "player" && (!gameActive || !player.alive)) return;
  const isArea = kind === "molotov";
  const origin = originOverride ? originOverride.clone() : camera.position.clone();
  const direction = directionOverride ? directionOverride.clone() : camera.getWorldDirection(new THREE.Vector3());
  const color = isArea ? 0xff9d5b : 0x69dfff;
  const material = new THREE.MeshBasicMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
  const mesh = new THREE.Mesh(utilityGeometry, material);
  mesh.position.copy(origin).addScaledVector(direction, 0.65);
  scene.add(mesh);
  const velocity = direction.multiplyScalar(isArea ? 12.5 : 14.5);
  velocity.y += isArea ? 5.5 : 6.7;
  projectiles.push({ mesh, material, velocity, kind, owner, age: 0, previous: mesh.position.clone() });
  playTone(isArea ? 250 : 470, 0.08, 0.035, "triangle");
}

function playerThrow(kind) {
  if (!gameActive || gamePaused || !player.alive || matchEnded) return;
  if (!player.utilityCooldowns) player.utilityCooldowns = { grenade: 0, molotov: 0 };
  if (gameTime < (player.utilityCooldowns[kind] || 0)) {
    showToast(kind === "grenade" ? "GRENADE RECHARGING" : "AREA CONTROL RECHARGING", 700);
    return;
  }
  player.utilityCooldowns[kind] = gameTime + (kind === "grenade" ? 12 : 17);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  throwUtility(kind, "player", camera.position, direction);
}

function applyUtilityDamage(position, owner, maxDamage, radius) {
  if (owner === "player") {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const distance = bot.position.distanceTo(position);
      const damage = calculateAreaDamage(maxDamage, distance, radius);
      const clearPath = arena.hasLineOfSight(position.clone().add(new THREE.Vector3(0, 0.45, 0)), bot.position.clone().add(new THREE.Vector3(0, 1, 0)));
      if (damage > 0 && clearPath) damageBot(bot, damage, "player");
    }
  } else if (player.alive) {
    const distance = player.position.distanceTo(position);
    const damage = calculateAreaDamage(maxDamage, distance, radius);
    const clearPath = arena.hasLineOfSight(position.clone().add(new THREE.Vector3(0, 0.45, 0)), player.position.clone().add(new THREE.Vector3(0, 1, 0)));
    if (damage > 0 && clearPath) damagePlayer(damage, owner?.bot ?? null);
  }
}

function detonateProjectile(projectile) {
  const position = projectile.mesh.position.clone();
  scene.remove(projectile.mesh);
  projectile.material.dispose();
  if (projectile.kind === "grenade") {
    addUtilityVisual(position, 0x65dfff, 5.2, 0.38);
    applyUtilityDamage(position, projectile.owner, 78, 5.2);
    playTone(120, 0.16, 0.045, "sawtooth");
  } else {
    const material = new THREE.MeshBasicMaterial({ color: 0xff9455, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(fieldGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, 0.055, position.z);
    mesh.scale.setScalar(3.5);
    scene.add(mesh);
    areaFields.push({ mesh, material, position: new THREE.Vector3(position.x, 0, position.z), owner: projectile.owner, remaining: 4.8, tickAt: gameTime + 0.3, radius: 3.5 });
    addUtilityVisual(new THREE.Vector3(position.x, 0.6, position.z), 0xff9455, 3.5, 0.3);
    playTone(180, 0.12, 0.04, "sawtooth");
  }
}

function updateProjectiles(dt) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    projectile.age += dt;
    projectile.previous.copy(projectile.mesh.position);
    projectile.velocity.y -= 13.5 * dt;
    projectile.mesh.position.addScaledVector(projectile.velocity, dt);
    const travel = scratchA.subVectors(projectile.mesh.position, projectile.previous);
    const travelDistance = travel.length();
    let blocked = false;
    if (travelDistance > 0.001) blocked = arena.lineBlocked(projectile.previous, travel.normalize(), travelDistance);
    if (projectile.mesh.position.y <= 0.2 || blocked || projectile.age >= 2.8) {
      detonateProjectile(projectile);
      projectiles.splice(index, 1);
    }
  }

  for (let index = areaFields.length - 1; index >= 0; index -= 1) {
    const field = areaFields[index];
    field.remaining -= dt;
    field.mesh.material.opacity = Math.max(0.03, 0.2 * (field.remaining / 4.8));
    const pulse = 1 + Math.sin(gameTime * 8) * 0.035;
    field.mesh.scale.setScalar(field.radius * pulse);
    if (gameTime >= field.tickAt) {
      field.tickAt = gameTime + 0.65;
      if (field.owner === "player") {
        for (const bot of bots) {
          if (bot.alive && bot.position.distanceTo(field.position) < field.radius && arena.hasLineOfSight(field.position.clone().add(new THREE.Vector3(0, 0.45, 0)), bot.position.clone().add(new THREE.Vector3(0, 1, 0)))) damageBot(bot, 12, "player");
        }
      } else if (player.alive && player.position.distanceTo(field.position) < field.radius && arena.hasLineOfSight(field.position.clone().add(new THREE.Vector3(0, 0.45, 0)), player.position.clone().add(new THREE.Vector3(0, 1, 0)))) {
        damagePlayer(9, field.owner?.bot ?? null);
      }
    }
    if (field.remaining <= 0) {
      scene.remove(field.mesh);
      field.material.dispose();
      areaFields.splice(index, 1);
    }
  }

  for (let index = visualEffects.length - 1; index >= 0; index -= 1) {
    const effect = visualEffects[index];
    effect.life -= dt;
    const progress = 1 - Math.max(0, effect.life) / effect.maxLife;
    effect.mesh.scale.setScalar(0.15 + effect.scale * progress);
    effect.material.opacity = Math.max(0, 0.32 * (1 - progress));
    if (effect.life <= 0) {
      scene.remove(effect.mesh);
      effect.material.dispose();
      visualEffects.splice(index, 1);
    }
  }
}

function chooseBotWeapon(bot, distance) {
  let desired = "rifle";
  if (distance < 2.65) desired = "knife";
  else if (distance > 25 && bot.ammo.sniper.magazine > 0) desired = "sniper";
  else if (distance < 8 && bot.ammo.revolver.magazine > 0) desired = "revolver";
  else if (distance < 11 && bot.ammo.handgun.magazine > 0) desired = "handgun";
  if (bot.weaponId !== desired) {
    bot.weaponId = desired;
    bot.reloadUntil = 0;
  }
}

function steerBot(bot, target, profile, distance, visible) {
  const desired = new THREE.Vector3();
  if (target) desired.subVectors(target, bot.position).setY(0);
  if (desired.lengthSq() > 0.01) desired.normalize();

  let move = new THREE.Vector3();
  if (visible && distance < 4.4) {
    move.copy(desired).multiplyScalar(-0.38);
    move.add(new THREE.Vector3(-desired.z, 0, desired.x).multiplyScalar(profile.strafe * bot.strafeSign));
  } else if (visible && distance < 12) {
    move.copy(new THREE.Vector3(-desired.z, 0, desired.x)).multiplyScalar(profile.strafe * bot.strafeSign);
    move.addScaledVector(desired, 0.16);
  } else {
    move.copy(desired);
  }

  for (const box of arena.colliders) {
    const nearestX = THREE.MathUtils.clamp(bot.position.x, box.minX, box.maxX);
    const nearestZ = THREE.MathUtils.clamp(bot.position.z, box.minZ, box.maxZ);
    const away = new THREE.Vector3(bot.position.x - nearestX, 0, bot.position.z - nearestZ);
    const obstacleDistance = away.length();
    if (obstacleDistance > 0.001 && obstacleDistance < 2.15) {
      away.normalize().multiplyScalar((2.15 - obstacleDistance) * 0.95);
      move.add(away);
    }
  }
  if (move.lengthSq() > 1) move.normalize();
  return move;
}

function botCanSeePlayer(bot, profile, distance) {
  if (!player.alive || distance > profile.awareness) return false;
  const from = bot.position.clone().add(new THREE.Vector3(0, 1.48, 0));
  const to = player.position.clone().add(new THREE.Vector3(0, 1.45, 0));
  return arena.hasLineOfSight(from, to);
}

function botTryReload(bot, profile) {
  const weapon = WEAPONS[bot.weaponId];
  if (weapon.id === "knife") return;
  const ammo = bot.ammo[bot.weaponId];
  if (bot.reloadUntil > 0 && gameTime < bot.reloadUntil) return;
  if (bot.reloadUntil > 0 && gameTime >= bot.reloadUntil) {
    const needed = weapon.magazine - ammo.magazine;
    const loaded = Math.min(needed, ammo.reserve);
    ammo.magazine += loaded;
    ammo.reserve -= loaded;
    bot.reloadUntil = 0;
  }
  if (ammo.magazine <= 0 && ammo.reserve > 0 && bot.reloadUntil <= 0) {
    bot.reloadUntil = gameTime + weapon.reloadTime * (1.12 - profile.accuracy * 0.12);
  }
}

function botAttack(bot, profile, distance, visible) {
  if (!visible || !player.alive) return;
  const weapon = WEAPONS[bot.weaponId];
  if (weapon.id === "knife") {
    if (distance <= weapon.range && gameTime >= bot.nextMeleeAt) {
      bot.nextMeleeAt = gameTime + weapon.fireDelay * (1.22 - profile.accuracy * 0.25);
      const backstab = isBackstab(bot.position, player.position, getPlayerForward(scratchA));
      damagePlayer(backstab ? 140 : 66, bot);
    }
    return;
  }

  botTryReload(bot, profile);
  if (bot.reloadUntil > 0 || gameTime < bot.nextFireAt) return;
  const ammo = bot.ammo[bot.weaponId];
  if (ammo.magazine <= 0) return;
  ammo.magazine -= 1;
  bot.nextFireAt = gameTime + weapon.fireDelay * profile.fireScale;
  const eye = bot.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 1.42, 0));
  const distanceNow = eye.distanceTo(target);
  if (distanceNow > weapon.range || !arena.hasLineOfSight(eye, target)) return;
  const distancePenalty = Math.max(0, distance - 10) * profile.aimJitter;
  const effectiveAccuracy = Math.max(0.06, profile.accuracy - distancePenalty);
  if (Math.random() > effectiveAccuracy) return;
  const scaledDamage = weapon.damage * (bot.weaponId === "sniper" ? 0.62 : 0.52);
  damagePlayer(scaledDamage, bot);
}

function updateBots(dt) {
  for (let index = 0; index < bots.length; index += 1) {
    const bot = bots[index];
    if (!bot.alive) {
      if (gameTime >= bot.respawnAt) {
        resetBot(bot, index);
        showToast(`${bot.name} RE-ENTERED`, 650);
      }
      continue;
    }
    const profile = getBotProfile(bot.difficulty);
    const distance = bot.position.distanceTo(player.position);
    const visible = botCanSeePlayer(bot, profile, distance);

    if (gameTime >= bot.nextThinkAt) {
      bot.nextThinkAt = gameTime + Math.max(0.1, profile.reaction * 0.62);
      if (visible) {
        bot.lastKnownPlayer = player.position.clone();
        bot.lastSeenAt = gameTime;
      }
      const remembered = bot.lastKnownPlayer && gameTime - bot.lastSeenAt < 4;
      let target = visible ? player.position : remembered ? bot.lastKnownPlayer : bot.wanderPoint;
      if (!target || !remembered && !visible && gameTime >= bot.nextWanderAt) {
        bot.nextWanderAt = gameTime + 3.2 + Math.random() * 2.8;
        bot.wanderPoint = new THREE.Vector3(
          8 + Math.random() * 13,
          0,
          -17 + Math.random() * 34
        );
        target = bot.wanderPoint;
      }
      if (target) {
        const targetDistance = bot.position.distanceTo(target);
        bot.moveVector.copy(steerBot(bot, target, profile, targetDistance, visible));
      }
      if (visible) {
        chooseBotWeapon(bot, distance);
        botAttack(bot, profile, distance, visible);
        if (distance > 8 && distance < 17 && gameTime >= bot.nextUtilityAt && Math.random() < 0.7) {
          bot.nextUtilityAt = gameTime + 13 + Math.random() * 5;
          const origin = bot.position.clone().add(new THREE.Vector3(0, 1.3, 0));
          const direction = player.position.clone().add(new THREE.Vector3(0, 0.7, 0)).sub(origin).normalize();
          throwUtility(Math.random() < 0.55 ? "grenade" : "molotov", { team: "bots", bot }, origin, direction);
        }
      }
      if (gameTime >= bot.stuckCheckAt) {
        const progress = bot.position.distanceTo(bot.lastPosition);
        bot.stuckCounter = progress < 0.18 && bot.moveVector.lengthSq() > 0.1 ? bot.stuckCounter + 1 : 0;
        bot.lastPosition.copy(bot.position);
        bot.stuckCheckAt = gameTime + 1.15;
        if (bot.stuckCounter >= 2) {
          bot.strafeSign *= -1;
          bot.wanderPoint = new THREE.Vector3(bot.position.x + (Math.random() - 0.5) * 8, 0, bot.position.z + (Math.random() - 0.5) * 8);
          bot.nextWanderAt = gameTime + 1;
          bot.stuckCounter = 0;
        }
      }
    }

    const desiredVelocity = bot.moveVector.clone().multiplyScalar(profile.speed);
    bot.velocity.lerp(desiredVelocity, Math.min(1, dt * 5.5));
    const nextPosition = bot.position.clone().addScaledVector(bot.velocity, dt);
    arena.resolveCircle(nextPosition, 0.44);
    bot.position.copy(nextPosition);

    if (bot.moveVector.lengthSq() > 0.025) {
      const desiredYaw = Math.atan2(-bot.moveVector.x, -bot.moveVector.z);
      let delta = desiredYaw - bot.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      bot.yaw += delta * Math.min(1, dt * 7);
      bot.group.rotation.y = bot.yaw;
      bot.forward.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      const legSwing = Math.sin(gameTime * 9 + index) * 0.32 * Math.min(1, bot.velocity.length() / 2);
      bot.leftLeg.rotation.x = legSwing;
      bot.rightLeg.rotation.x = -legSwing;
    } else {
      bot.leftLeg.rotation.x *= 0.82;
      bot.rightLeg.rotation.x *= 0.82;
    }
    bot.group.position.copy(bot.position);
  }
}

function updatePlayer(dt) {
  if (!player.alive) {
    if (gameTime >= player.respawnAt) respawnPlayer();
    camera.position.set(player.position.x, player.position.y + 1.55, player.position.z);
    camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
    return;
  }

  const forward = getPlayerForward(scratchA);
  const right = playerRight.set(-forward.z, 0, forward.x);
  const moveX = input.moveX + (input.keys.has("KeyD") ? 1 : 0) - (input.keys.has("KeyA") ? 1 : 0);
  const moveY = input.moveY + (input.keys.has("KeyW") ? 1 : 0) - (input.keys.has("KeyS") ? 1 : 0);
  const move = new THREE.Vector3().addScaledVector(right, moveX).addScaledVector(forward, moveY);
  if (move.lengthSq() > 1) move.normalize();

  const sprinting = input.keys.has("ShiftLeft") || input.keys.has("ShiftRight");
  const aiming = input.aim;
  const targetSpeed = sprinting && !aiming ? 8.2 : aiming ? 4.2 : 6.3;
  const desiredVelocity = move.multiplyScalar(targetSpeed);
  const acceleration = player.grounded ? 15 : 5;
  player.velocity.x += (desiredVelocity.x - player.velocity.x) * Math.min(1, acceleration * dt);
  player.velocity.z += (desiredVelocity.z - player.velocity.z) * Math.min(1, acceleration * dt);

  if (input.jumpPressed && player.grounded) {
    player.verticalVelocity = 7.6;
    player.grounded = false;
    playTone(220, 0.07, 0.022);
  }
  input.jumpPressed = false;
  player.verticalVelocity -= 19.5 * dt;
  player.position.y += player.verticalVelocity * dt;
  if (player.position.y <= 0) {
    player.position.y = 0;
    player.verticalVelocity = 0;
    player.grounded = true;
  }

  const next = player.position.clone();
  next.x += player.velocity.x * dt;
  arena.resolveCircle(next, 0.44);
  player.position.x = next.x;
  next.copy(player.position);
  next.z += player.velocity.z * dt;
  arena.resolveCircle(next, 0.44);
  player.position.z = next.z;

  player.recoil = Math.max(0, player.recoil - dt * 1.4);
  weaponView.group.position.z += (-0.68 - player.recoil * 0.45 - weaponView.group.position.z) * Math.min(1, dt * 15);
  weaponView.group.position.y += (-0.34 + Math.sin(gameTime * (move.lengthSq() > 0.01 ? 10 : 2)) * (move.lengthSq() > 0.01 ? 0.009 : 0.002) - weaponView.group.position.y) * Math.min(1, dt * 10);

  camera.position.set(player.position.x, player.position.y + 1.58, player.position.z);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
  const targetFov = input.aim && player.weaponId === "sniper" ? 43 : input.aim ? 63 : 76;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
  $("scope-overlay").classList.toggle("active", input.aim && player.weaponId === "sniper");
  updateReload();
}

function updateMatch(dt) {
  matchRemaining = Math.max(0, matchRemaining - dt);
  if (matchRemaining <= 0) finishMatch();
  checkMatchEnd();
}

function updateHUD() {
  $("match-clock").textContent = formatClock(matchRemaining);
  $("player-score").textContent = String(playerScore).padStart(2, "0");
  $("bot-score").textContent = String(botScore).padStart(2, "0");
  $("elims").textContent = String(player.kills).padStart(2, "0");
  $("deaths").textContent = String(player.deaths).padStart(2, "0");
  $("kd").textContent = (player.kills / Math.max(1, player.deaths)).toFixed(2);
  $("health-number").textContent = String(Math.ceil(player.health));
  $("health-fill").style.width = `${Math.max(0, player.health)}%`;
  $("health-fill").style.filter = player.health < 30 ? "hue-rotate(115deg) saturate(1.5)" : "none";
  $("status-label").textContent = !player.alive ? "RESPAWNING" : player.reloading ? "RELOADING" : "READY";
  const weapon = WEAPONS[player.weaponId];
  if (weapon.id === "knife") {
    $("ammo-mag").textContent = "—";
    $("ammo-reserve").textContent = "—";
  } else {
    const ammo = player.ammo[player.weaponId];
    $("ammo-mag").textContent = String(ammo.magazine).padStart(2, "0");
    $("ammo-reserve").textContent = String(ammo.reserve).padStart(2, "0");
  }
  $("reload-label").textContent = player.reloading ? "RELOADING..." : "";
  $("damage-vignette").classList.toggle("show", gameTime < damageFlashUntil);
}

function updateScoreboard() {
  const rows = [
    { name: "YOU // BLUE", kills: player.kills, deaths: player.deaths, alive: player.alive, team: "blue" },
    ...bots.map((bot) => ({ name: bot.name, kills: bot.kills, deaths: bot.deaths, alive: bot.alive, team: "red" }))
  ];
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  $("roster-list").innerHTML = rows.map((row) => `
    <div class="roster-row">
      <span class="${row.team === "blue" ? "roster-blue" : "roster-red"}">${row.name}</span>
      <span>${String(row.kills).padStart(2, "0")}</span>
      <span>${String(row.deaths).padStart(2, "0")}</span>
      <span class="${row.alive ? "alive-state" : ""}">${row.alive ? "ACTIVE" : "REDEPLOY"}</span>
    </div>`
  ).join("");
}

function openSettings(origin) {
  settingsReturn = origin;
  $("settings-screen").classList.remove("hidden");
  if (origin === "pause") $("pause-screen").classList.add("hidden");
}

function closeSettings() {
  $("settings-screen").classList.add("hidden");
  if (settingsReturn === "pause" && gameActive) $("pause-screen").classList.remove("hidden");
  else if (settingsReturn === "menu") $("menu-screen").classList.remove("hidden");
}

function toggleScoreboard(show) {
  scorePanelVisible = show;
  $("scoreboard-panel").classList.toggle("hidden", !show);
  if (show) updateScoreboard();
}

function adjustLook(deltaX, deltaY) {
  const scale = 0.00215 * Number(savedSettings.sensitivity || 1);
  player.yaw -= deltaX * scale;
  player.pitch -= deltaY * scale * (savedSettings.invertY ? -1 : 1);
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.48, 1.48);
}

function handleKeyDown(event) {
  if (event.code === "Tab") {
    event.preventDefault();
    if (gameActive && !gamePaused) toggleScoreboard(true);
    return;
  }
  if (event.code === "Escape") {
    if (!$("settings-screen").classList.contains("hidden")) {
      closeSettings();
      return;
    }
    if (gameActive && !gamePaused) pauseMatch();
    else if (gameActive && gamePaused) resumeMatch();
    return;
  }
  if (!gameActive || gamePaused || matchEnded) return;
  input.keys.add(event.code);
  if (event.repeat) return;

  if (event.code.startsWith("Digit")) chooseWeaponSlot(event.code.slice(5));
  if (event.code === "KeyR") beginReload();
  if (event.code === "KeyG") playerThrow("grenade");
  if (event.code === "KeyH") playerThrow("molotov");
  if (event.code === "Space") {
    event.preventDefault();
    input.jumpPressed = true;
  }
}

function handleKeyUp(event) {
  input.keys.delete(event.code);
  if (event.code === "Tab") toggleScoreboard(false);
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === canvas && gameActive && !gamePaused) adjustLook(event.movementX, event.movementY);
});

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (wasPointerLocked && !locked && gameActive && !gamePaused && !isTouchDevice) pauseMatch();
  wasPointerLocked = locked;
});

canvas.addEventListener("mousedown", (event) => {
  if (isTouchDevice || !gameActive || gamePaused) return;
  if (event.button === 0) {
    input.fire = true;
    input.firePressed = true;
  } else if (event.button === 2) {
    input.aim = true;
  }
  if (!isTouchDevice && document.pointerLockElement !== canvas) requestPointerLock();
});
document.addEventListener("mouseup", (event) => {
  if (event.button === 0) input.fire = false;
  if (event.button === 2) input.aim = false;
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("wheel", (event) => {
  if (gameActive && !gamePaused) {
    event.preventDefault();
    cycleWeapon(event.deltaY > 0 ? 1 : -1);
  }
}, { passive: false });

canvas.addEventListener("pointerdown", (event) => {
  if (!isTouchDevice || !gameActive || gamePaused) return;
  if (event.pointerType !== "touch") return;
  input.lookPointer = event.pointerId;
  input.lastLookX = event.clientX;
  input.lastLookY = event.clientY;
  try { canvas.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
});
canvas.addEventListener("pointermove", (event) => {
  if (!isTouchDevice || input.lookPointer !== event.pointerId || gamePaused) return;
  const dx = event.clientX - input.lastLookX;
  const dy = event.clientY - input.lastLookY;
  input.lastLookX = event.clientX;
  input.lastLookY = event.clientY;
  adjustLook(dx, dy);
});
canvas.addEventListener("pointerup", (event) => {
  if (input.lookPointer === event.pointerId) input.lookPointer = null;
});

const moveStick = $("move-stick");
const moveKnob = $("move-knob");
let stickPointer = null;
function updateStick(event) {
  const rect = moveStick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const max = rect.width * 0.34;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const scale = Math.min(1, max / length);
  const x = dx * scale;
  const y = dy * scale;
  moveKnob.style.left = `calc(50% + ${x}px)`;
  moveKnob.style.top = `calc(50% + ${y}px)`;
  input.moveX = x / max;
  input.moveY = -y / max;
}
moveStick.addEventListener("pointerdown", (event) => {
  if (!gameActive || gamePaused) return;
  stickPointer = event.pointerId;
  moveStick.setPointerCapture(event.pointerId);
  updateStick(event);
});
moveStick.addEventListener("pointermove", (event) => {
  if (stickPointer === event.pointerId) updateStick(event);
});
function resetStick(event) {
  if (stickPointer !== event.pointerId) return;
  stickPointer = null;
  input.moveX = 0;
  input.moveY = 0;
  moveKnob.style.left = "50%";
  moveKnob.style.top = "50%";
}
moveStick.addEventListener("pointerup", resetStick);
moveStick.addEventListener("pointercancel", resetStick);

for (const button of document.querySelectorAll("[data-touch]")) {
  const action = button.dataset.touch;
  button.addEventListener("pointerdown", (event) => {
    if (!gameActive || gamePaused) return;
    event.preventDefault();
    try { button.setPointerCapture(event.pointerId); } catch { /* Optional. */ }
    if (action === "fire") { input.fire = true; input.firePressed = true; }
    else if (action === "aim") input.aim = true;
    else if (action === "jump") input.jumpPressed = true;
    else if (action === "reload") beginReload();
    else if (action === "knife") equipWeapon("knife");
    else if (action === "grenade") playerThrow("grenade");
    else if (action === "molotov") playerThrow("molotov");
  });
  const release = () => {
    if (action === "fire") input.fire = false;
    if (action === "aim") input.aim = false;
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

for (const button of document.querySelectorAll(".weapon-slot")) {
  button.addEventListener("click", () => chooseWeaponSlot(button.dataset.slot));
}

$("start-btn").addEventListener("click", startMatch);
$("rematch-btn").addEventListener("click", startMatch);
$("menu-settings-btn").addEventListener("click", () => openSettings("menu"));
$("pause-settings-btn").addEventListener("click", () => openSettings("pause"));
$("settings-close-btn").addEventListener("click", closeSettings);
$("resume-btn").addEventListener("click", resumeMatch);
$("pause-btn").addEventListener("click", pauseMatch);
$("quit-btn").addEventListener("click", returnToMenu);
$("result-menu-btn").addEventListener("click", returnToMenu);

$("sensitivity-setting").addEventListener("input", (event) => {
  savedSettings.sensitivity = Number(event.target.value);
  $("sensitivity-value").textContent = savedSettings.sensitivity.toFixed(2) + "×";
  saveSettings();
});
$("volume-setting").addEventListener("input", (event) => {
  savedSettings.volume = Number(event.target.value);
  $("volume-value").textContent = Math.round(savedSettings.volume * 100) + "%";
  saveSettings();
});
$("invert-y-setting").addEventListener("change", (event) => {
  savedSettings.invertY = event.target.checked;
  saveSettings();
});

window.addEventListener("blur", () => {
  input.fire = false;
  input.aim = false;
  input.keys.clear();
  if (gameActive && !gamePaused && !isTouchDevice) pauseMatch();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameActive && !gamePaused) pauseMatch();
});

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
  renderer.setSize(width, height, false);
}
window.addEventListener("resize", resize);
resize();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (gameActive && !gamePaused && !matchEnded) {
    gameTime += dt;
    updatePlayer(dt);
    updateBots(dt);
    updateProjectiles(dt);
    updateMatch(dt);

    const activeWeapon = WEAPONS[player.weaponId];
    if (player.alive && input.fire && activeWeapon.automatic) playerFire();
    if (player.alive && input.firePressed) {
      if (!activeWeapon.automatic) playerFire();
      input.firePressed = false;
    }
    if (!input.fire) input.firePressed = false;

    uiAccumulator += dt;
    if (uiAccumulator >= 0.08) {
      updateHUD();
      if (scorePanelVisible) updateScoreboard();
      uiAccumulator = 0;
    }
  }

  renderer.render(scene, camera);
}

camera.position.set(player.position.x, 1.58, player.position.z);
camera.rotation.set(0, player.yaw, 0, "YXZ");
requestAnimationFrame(animate);
