import * as THREE from "three";

export function buildArena(scene) {
  const colliders = [];
  const occluders = [];
  const shared = {
    wall: new THREE.MeshStandardMaterial({ color: 0x24364b, roughness: 0.86, metalness: 0.18 }),
    wallDark: new THREE.MeshStandardMaterial({ color: 0x172538, roughness: 0.9, metalness: 0.12 }),
    cover: new THREE.MeshStandardMaterial({ color: 0x354c63, roughness: 0.72, metalness: 0.24 }),
    coverLight: new THREE.MeshStandardMaterial({ color: 0x536b81, roughness: 0.7, metalness: 0.2 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x2c9cbd, emissive: 0x07384c, roughness: 0.45, metalness: 0.35 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xd17c42, emissive: 0x48210b, roughness: 0.5, metalness: 0.28 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x111d2c, roughness: 0.94, metalness: 0.08 }),
    darkFloor: new THREE.MeshStandardMaterial({ color: 0x0b1421, roughness: 0.98, metalness: 0.02 })
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), shared.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.06;
  floor.receiveShadow = false;
  scene.add(floor);

  const grid = new THREE.GridHelper(54, 54, 0x244258, 0x1a2c40);
  grid.position.y = 0.015;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.42;
  }
  scene.add(grid);

  const addBox = (x, y, z, width, height, depth, material, options = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y + height / 2, z);
    mesh.userData.arenaSolid = options.solid !== false;
    scene.add(mesh);
    if (options.solid !== false) {
      const collider = { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, height };
      colliders.push(collider);
      if (height > 1.25) occluders.push(mesh);
    }
    return mesh;
  };

  const addGlowLine = (x, z, width, depth, color, y = 0.035) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.035, depth),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 })
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };

  // Four heavy boundary walls keep all combat inside the intended arena.
  addBox(0, 0, -27, 55, 5.2, 1.2, shared.wallDark);
  addBox(0, 0, 27, 55, 5.2, 1.2, shared.wallDark);
  addBox(-27, 0, 0, 1.2, 5.2, 55, shared.wallDark);
  addBox(27, 0, 0, 1.2, 5.2, 55, shared.wallDark);

  // The central sightline is broken into three routes by offset cover.
  const coverData = [
    [-8, -8, 3.2, 2.2, 2.0], [8, -8, 3.2, 2.2, 2.0],
    [-8, 8, 3.2, 2.2, 2.0], [8, 8, 3.2, 2.2, 2.0],
    [-14, 0, 2.1, 3.8, 1.8], [14, 0, 2.1, 3.8, 1.8],
    [0, -14, 4.4, 2.0, 1.7], [0, 14, 4.4, 2.0, 1.7],
    [-3.2, 0, 1.5, 2.0, 1.35], [3.2, 0, 1.5, 2.0, 1.35],
    [-12, -13, 2.6, 1.8, 1.3], [12, 13, 2.6, 1.8, 1.3],
    [12, -13, 2.6, 1.8, 1.3], [-12, 13, 2.6, 1.8, 1.3]
  ];
  for (let index = 0; index < coverData.length; index += 1) {
    const [x, z, width, depth, height] = coverData[index];
    const material = index % 3 === 0 ? shared.coverLight : shared.cover;
    addBox(x, 0, z, width, height, depth, material);
    addGlowLine(x, z - depth / 2 - 0.03, width * 0.7, 0.06, index % 2 ? 0x62dfff : 0xffaa64, 0.16);
  }

  // Short walls create flank routes without making the map a maze.
  addBox(-19, 0, -9, 1.0, 2.7, 7.5, shared.wall);
  addBox(-19, 0, 9, 1.0, 2.7, 7.5, shared.wall);
  addBox(19, 0, -9, 1.0, 2.7, 7.5, shared.wall);
  addBox(19, 0, 9, 1.0, 2.7, 7.5, shared.wall);
  addBox(-22, 0, 0, 1.0, 2.2, 4.0, shared.wall);
  addBox(22, 0, 0, 1.0, 2.2, 4.0, shared.wall);

  // Slim illuminated pylons make the central field visually readable.
  for (const [x, z, color] of [[-4.5, -4.5, 0x65dfff], [4.5, -4.5, 0xffa96b], [-4.5, 4.5, 0xffa96b], [4.5, 4.5, 0x65dfff]]) {
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 3.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x30445a, emissive: color, emissiveIntensity: 0.17, metalness: 0.55, roughness: 0.4 })
    );
    pylon.position.set(x, 1.9, z);
    scene.add(pylon);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 6), new THREE.MeshBasicMaterial({ color }));
    cap.position.set(x, 3.68, z);
    scene.add(cap);
  }

  // Team-side floor markings and spawn pads.
  const bluePad = new THREE.Mesh(new THREE.CircleGeometry(3.7, 32), new THREE.MeshBasicMaterial({ color: 0x087fa7, transparent: true, opacity: 0.11, side: THREE.DoubleSide }));
  bluePad.rotation.x = -Math.PI / 2;
  bluePad.position.set(-21, 0.02, 0);
  scene.add(bluePad);
  const redPad = new THREE.Mesh(new THREE.CircleGeometry(3.7, 32), new THREE.MeshBasicMaterial({ color: 0xb64b57, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  redPad.rotation.x = -Math.PI / 2;
  redPad.position.set(21, 0.02, 0);
  scene.add(redPad);
  addGlowLine(-21, 0, 0.12, 7.2, 0x62dfff, 0.045);
  addGlowLine(21, 0, 0.12, 7.2, 0xff7187, 0.045);

  // Low angular landmarks are decorative and deliberately outside movement paths.
  for (const [x, z, scale, material] of [
    [-24, -23, 1, shared.cyan], [24, -23, 1, shared.orange],
    [-24, 23, 1, shared.orange], [24, 23, 1, shared.cyan]
  ]) {
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(1.05 * scale, 0), material);
    marker.position.set(x, 2.6, z);
    scene.add(marker);
    const beacon = new THREE.PointLight(material.color, 0.75, 8, 2);
    beacon.position.set(x, 3.5, z);
    scene.add(beacon);
  }

  // Soft, static lighting keeps the material count and GPU cost predictable.
  const ambient = new THREE.HemisphereLight(0xbad8ee, 0x182336, 1.2);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xd8ecff, 1.35);
  key.position.set(-12, 24, 9);
  scene.add(key);
  const blueLight = new THREE.PointLight(0x3bbdff, 2.0, 26, 2);
  blueLight.position.set(-20, 5, 0);
  scene.add(blueLight);
  const redLight = new THREE.PointLight(0xff765d, 1.7, 24, 2);
  redLight.position.set(20, 5, 0);
  scene.add(redLight);

  return {
    colliders,
    occluders,
    spawnPoints: {
      player: [{ x: -21, z: 0 }, { x: -19, z: -3 }, { x: -19, z: 3 }],
      bots: [{ x: 20, z: 0 }, { x: 20, z: -4 }, { x: 20, z: 4 }, { x: 17, z: -2 }, { x: 17, z: 2 }]
    },
    resolveCircle(position, radius = 0.42) {
      position.x = THREE.MathUtils.clamp(position.x, -25.4, 25.4);
      position.z = THREE.MathUtils.clamp(position.z, -25.4, 25.4);
      for (let pass = 0; pass < 3; pass += 1) {
        for (const box of colliders) {
          const nearestX = THREE.MathUtils.clamp(position.x, box.minX, box.maxX);
          const nearestZ = THREE.MathUtils.clamp(position.z, box.minZ, box.maxZ);
          let dx = position.x - nearestX;
          let dz = position.z - nearestZ;
          const distanceSq = dx * dx + dz * dz;
          if (distanceSq >= radius * radius) continue;
          if (distanceSq < 0.000001) {
            const left = Math.abs(position.x - box.minX);
            const right = Math.abs(box.maxX - position.x);
            const top = Math.abs(position.z - box.minZ);
            const bottom = Math.abs(box.maxZ - position.z);
            const edge = Math.min(left, right, top, bottom);
            if (edge === left) dx = -1;
            else if (edge === right) dx = 1;
            else if (edge === top) dz = -1;
            else dz = 1;
          }
          const distance = Math.max(0.0001, Math.hypot(dx, dz));
          const push = radius - distance + 0.001;
          position.x += (dx / distance) * push;
          position.z += (dz / distance) * push;
        }
      }
      position.x = THREE.MathUtils.clamp(position.x, -25.4, 25.4);
      position.z = THREE.MathUtils.clamp(position.z, -25.4, 25.4);
      return position;
    },
    lineBlocked(origin, direction, distance) {
      const ray = new THREE.Raycaster(origin, direction, 0, distance);
      return ray.intersectObjects(occluders, false).length > 0;
    },
    hasLineOfSight(from, to) {
      const delta = new THREE.Vector3().subVectors(to, from);
      const distance = delta.length();
      if (distance < 0.01) return true;
      delta.normalize();
      return !this.lineBlocked(from, delta, Math.max(0, distance - 0.55));
    }
  };
}
