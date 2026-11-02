import * as THREE from "three";

const BODY_GEOMETRY = new THREE.BoxGeometry(0.72, 1.12, 0.46);
const HEAD_GEOMETRY = new THREE.SphereGeometry(0.27, 10, 8);
const ARM_GEOMETRY = new THREE.BoxGeometry(0.2, 0.68, 0.23);
const LEG_GEOMETRY = new THREE.BoxGeometry(0.25, 0.55, 0.28);

export function createBotAvatar(scene, id) {
  const group = new THREE.Group();
  const base = new THREE.MeshStandardMaterial({ color: 0xa84458, roughness: 0.74, metalness: 0.24 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff8291, emissive: 0x4b1320, roughness: 0.5, metalness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202d3e, roughness: 0.85 });
  const torso = new THREE.Mesh(BODY_GEOMETRY, base);
  torso.position.y = 1.02;
  torso.userData.hitPart = "body";
  const head = new THREE.Mesh(HEAD_GEOMETRY, accent);
  head.position.y = 1.77;
  head.userData.hitPart = "head";
  const leftArm = new THREE.Mesh(ARM_GEOMETRY, base);
  leftArm.position.set(-0.48, 1.07, -0.02);
  leftArm.rotation.z = -0.12;
  const rightArm = new THREE.Mesh(ARM_GEOMETRY, base);
  rightArm.position.set(0.48, 1.07, -0.02);
  rightArm.rotation.z = 0.12;
  const leftLeg = new THREE.Mesh(LEG_GEOMETRY, dark);
  leftLeg.position.set(-0.2, 0.36, 0);
  const rightLeg = new THREE.Mesh(LEG_GEOMETRY, dark);
  rightLeg.position.set(0.2, 0.36, 0);
  const chestPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.43, 0.38, 0.035),
    new THREE.MeshBasicMaterial({ color: 0x18283a })
  );
  chestPanel.position.set(0, 1.08, -0.247);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.09, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffd0d6 })
  );
  visor.position.set(0, 1.8, -0.22);

  const parts = [torso, head];
  const meshes = [torso, head, leftArm, rightArm, leftLeg, rightLeg, chestPanel, visor];
  for (const mesh of meshes) {
    mesh.userData.botId = id;
    group.add(mesh);
  }
  group.position.set(18, 0, 0);
  scene.add(group);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.48, 20),
    new THREE.MeshBasicMaterial({ color: 0xff7187, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.035;
  group.add(marker);

  return {
    id,
    name: `BOT-${String(id + 1).padStart(2, "0")}`,
    group,
    parts,
    torso,
    head,
    leftLeg,
    rightLeg,
    health: 100,
    alive: true,
    respawnAt: 0,
    position: new THREE.Vector3(18, 0, 0),
    velocity: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    yaw: Math.PI,
    targetPoint: new THREE.Vector3(0, 0, 0),
    lastKnownPlayer: null,
    lastSeenAt: 0,
    nextThinkAt: 0,
    nextFireAt: 0,
    nextUtilityAt: 0,
    nextMeleeAt: 0,
    nextWanderAt: 0,
    wanderPoint: null,
    reloadUntil: 0,
    weaponId: "rifle",
    magazine: 30,
    reserve: 90,
    kills: 0,
    deaths: 0,
    difficulty: "normal",
    strafeSign: id % 2 === 0 ? 1 : -1
  };
}

export function createWeaponViewModel(camera) {
  const group = new THREE.Group();
  camera.add(group);
  let activeId = "";

  const setWeapon = (weaponId, color = 0x60d6ff) => {
    if (activeId === weaponId) return;
    activeId = weaponId;
    while (group.children.length) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material?.dispose();
    }
    const metal = new THREE.MeshStandardMaterial({ color: 0x26384c, roughness: 0.52, metalness: 0.72 });
    const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.42, metalness: 0.42 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x101a28, roughness: 0.76 });
    const add = (geometry, material, x, y, z, rotationZ = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rotationZ;
      group.add(mesh);
      return mesh;
    };

    if (weaponId === "knife") {
      add(new THREE.BoxGeometry(0.09, 0.36, 0.12), dark, 0, -0.12, -0.15);
      add(new THREE.BoxGeometry(0.055, 0.43, 0.055), metal, 0, 0.22, -0.18, -0.08);
      add(new THREE.ConeGeometry(0.045, 0.16, 4), accent, 0, 0.5, -0.18, Math.PI);
    } else {
      const barrelLength = weaponId === "sniper" ? 0.94 : weaponId === "revolver" ? 0.48 : weaponId === "handgun" ? 0.38 : 0.66;
      add(new THREE.BoxGeometry(0.34, 0.2, 0.52), metal, 0, -0.02, -0.22);
      add(new THREE.BoxGeometry(0.095, 0.11, barrelLength), accent, 0, 0.04, -0.53 - barrelLength * 0.42);
      add(new THREE.BoxGeometry(0.13, 0.25, 0.17), dark, 0.02, -0.22, -0.06, -0.12);
      add(new THREE.BoxGeometry(0.36, 0.035, 0.12), accent, 0, 0.105, -0.2);
      if (weaponId === "sniper") {
        add(new THREE.CylinderGeometry(0.055, 0.055, 0.38, 8), dark, 0, 0.16, -0.21, Math.PI / 2);
      } else if (weaponId === "revolver") {
        add(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 8), dark, 0, -0.02, -0.07, Math.PI / 2);
      }
    }

    group.position.set(0.39, -0.34, -0.68);
    group.rotation.set(0, 0, 0);
    group.visible = true;
  };

  setWeapon("rifle");
  return { group, setWeapon };
}
