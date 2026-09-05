import * as THREE from 'three';

export const OBSTACLES = [
  { x: -4.75, z: -1.15, halfX: 0.82, halfZ: 1.18, height: 1.28 },
  { x: 4.55, z: 1.05, halfX: 1.02, halfZ: 0.7, height: 0.96 },
  { x: 0, z: 3.15, halfX: 1.42, halfZ: 0.48, height: 0.72 },
  { x: 0.15, z: -3.45, halfX: 0.48, halfZ: 0.48, height: 1.72 },
];

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function makeFloorTexture() {
  const texture = canvasTexture(1024, (ctx, size) => {
    ctx.fillStyle = '#252a2a'; ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 128) {
      for (let x = 0; x < size; x += 128) {
        const shade = 35 + (((x + y) / 128) % 3);
        ctx.fillStyle = `rgb(${shade}, ${shade + 5}, ${shade + 4})`;
        ctx.fillRect(x + 2, y + 2, 124, 124);
      }
    }
    ctx.strokeStyle = 'rgba(152, 171, 166, .16)'; ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke(); }
    for (let index = 0; index < 1500; index += 1) {
      const value = 55 + Math.floor(Math.random() * 25);
      ctx.fillStyle = `rgba(${value}, ${value + 5}, ${value + 3}, ${Math.random() * 0.11})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    ctx.strokeStyle = 'rgba(175, 216, 205, .17)'; ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, size - 28, size - 28);
  });
  texture.repeat.set(2, 2);
  return texture;
}

function makeWallTexture() {
  const texture = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#1a1f20'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(129, 151, 148, .12)'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, size - 6, size - 6);
    ctx.beginPath(); ctx.moveTo(0, size * 0.5); ctx.lineTo(size, size * 0.5); ctx.stroke();
    for (let index = 0; index < 600; index += 1) {
      const alpha = Math.random() * 0.035;
      ctx.fillStyle = `rgba(210, 225, 220, ${alpha})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 3 + 1, Math.random() * 3 + 1);
    }
  });
  texture.repeat.set(3, 1);
  return texture;
}

function box(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function createWeapon(camera) {
  const group = new THREE.Group();
  group.position.set(0.35, -0.31, -0.63);
  group.scale.setScalar(0.78);
  group.rotation.set(-0.05, -0.045, 0);
  camera.add(group);

  const dark = new THREE.MeshStandardMaterial({ color: 0x13191a, roughness: 0.32, metalness: 0.82 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x596263, roughness: 0.24, metalness: 0.94 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xd8dedb, roughness: 0.42, metalness: 0.4 });
  const energy = new THREE.MeshStandardMaterial({ color: 0x8cebd8, emissive: 0x47d8bd, emissiveIntensity: 2.4, roughness: 0.18 });

  const body = box(0.17, 0.17, 0.54, dark); body.position.z = -0.06; group.add(body);
  const upper = box(0.12, 0.08, 0.48, pale); upper.position.set(0, 0.105, -0.08); group.add(upper);
  const rail = box(0.035, 0.035, 0.48, metal); rail.position.set(0, 0.17, -0.08); group.add(rail);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.55, 12), metal);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.46; group.add(barrel);
  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.17, 10), dark);
  chamber.rotation.z = Math.PI / 2; chamber.position.set(-0.01, -0.01, 0.05); group.add(chamber);
  for (let index = 0; index < 5; index += 1) {
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.07, 0.12), energy.clone());
    cell.position.set(-0.096, -0.045 + (index * 0.023), -0.02 + (index % 2) * 0.012);
    cell.rotation.z = -0.12; group.add(cell);
  }
  const grip = box(0.13, 0.3, 0.18, dark); grip.position.set(0, -0.2, 0.12); grip.rotation.x = -0.16; group.add(grip);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 8, 18, Math.PI), metal);
  guard.rotation.set(0, Math.PI / 2, Math.PI / 2); guard.position.set(0, -0.11, -0.04); group.add(guard);

  const muzzle = new THREE.PointLight(0xbaffef, 0, 2.4, 2);
  muzzle.position.set(0, 0, -0.76); group.add(muzzle);
  const muzzleDisc = new THREE.Mesh(new THREE.CircleGeometry(0.075, 18), new THREE.MeshBasicMaterial({ color: 0xd8fff6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  muzzleDisc.position.set(0, 0, -0.755); group.add(muzzleDisc);

  return { group, muzzle, muzzleDisc, recoil: 0, reloadSpin: 0 };
}

function addCeilingLight(scene, x) {
  const housing = box(3.2, 0.08, 0.34, new THREE.MeshStandardMaterial({ color: 0x22292a, roughness: 0.6, metalness: 0.4 }));
  housing.position.set(x, 4.51, 0.3); scene.add(housing);
  const panel = box(2.86, 0.03, 0.19, new THREE.MeshBasicMaterial({ color: 0xc8e1db }));
  panel.position.set(x, 4.45, 0.3); scene.add(panel);
  const light = new THREE.PointLight(0xd7f4ed, 12, 10, 1.5);
  light.position.set(x, 4.15, 0.35); light.castShadow = false; scene.add(light);
}

export function createRoomScene(canvas, tacticalScreen) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1012);
  scene.fog = new THREE.FogExp2(0x0a1012, 0.016);
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.035, 70);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.65, 5.4);
  scene.add(camera);

  const floorTexture = makeFloorTexture();
  const wallTexture = makeWallTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 15), new THREE.MeshStandardMaterial({ map: floorTexture, color: 0x8b9693, roughness: 0.91, metalness: 0.08 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 15), new THREE.MeshStandardMaterial({ color: 0x171d1e, roughness: 0.82 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 4.55; scene.add(ceiling);

  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, color: 0x7b8684, roughness: 0.88, metalness: 0.06 });
  const backWall = box(16, 4.6, 0.18, wallMaterial); backWall.position.set(0, 2.3, 7.55); scene.add(backWall);
  const leftWall = box(0.18, 4.6, 15, wallMaterial); leftWall.position.set(-8.05, 2.3, 0); scene.add(leftWall);
  const rightWall = box(0.18, 4.6, 15, wallMaterial); rightWall.position.set(8.05, 2.3, 0); scene.add(rightWall);
  const frontWall = box(16, 4.6, 0.16, new THREE.MeshStandardMaterial({ color: 0x111718, roughness: 0.78 }));
  frontWall.position.set(0, 2.3, -7.56); scene.add(frontWall);

  const screenWidth = 13.4; const screenHeight = 3.72;
  const screenFrame = box(screenWidth + 0.28, screenHeight + 0.28, 0.18, new THREE.MeshStandardMaterial({ color: 0x151b1b, metalness: 0.78, roughness: 0.28 }));
  screenFrame.position.set(0, 2.42, -7.42); scene.add(screenFrame);
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), new THREE.MeshBasicMaterial({ map: tacticalScreen.texture, color: 0xc7e7df }));
  screenMesh.position.set(0, 2.42, -7.31); scene.add(screenMesh);
  const screenGlow = new THREE.RectAreaLight(0x68c9b8, 4.2, 12.4, 3.2);
  screenGlow.position.set(0, 2.35, -7.05); screenGlow.lookAt(0, 2.1, 0); scene.add(screenGlow);

  const statusLight = box(1.1, 0.035, 0.045, new THREE.MeshBasicMaterial({ color: 0xff9b62 }));
  statusLight.position.set(0, 4.39, -7.23); scene.add(statusLight);

  OBSTACLES.forEach((obstacle, index) => {
    const material = new THREE.MeshStandardMaterial({ color: index === 3 ? 0x596664 : 0x303839, roughness: 0.6, metalness: index === 3 ? 0.72 : 0.28 });
    const mesh = box(obstacle.halfX * 2, obstacle.height, obstacle.halfZ * 2, material);
    mesh.position.set(obstacle.x, obstacle.height / 2, obstacle.z); scene.add(mesh);
    const top = box((obstacle.halfX * 2) - 0.08, 0.025, (obstacle.halfZ * 2) - 0.08, new THREE.MeshBasicMaterial({ color: index % 2 ? 0x71817d : 0x51605d }));
    top.position.set(obstacle.x, obstacle.height + 0.02, obstacle.z); scene.add(top);
    const stripe = box((obstacle.halfX * 2) + 0.02, 0.055, (obstacle.halfZ * 2) + 0.02, new THREE.MeshBasicMaterial({ color: index === 2 ? 0xd18857 : 0x60877f }));
    stripe.position.set(obstacle.x, obstacle.height * 0.67, obstacle.z); scene.add(stripe);
  });

  const metalZone = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.7), new THREE.MeshStandardMaterial({ color: 0x4d5757, metalness: 0.78, roughness: 0.34 }));
  metalZone.rotation.x = -Math.PI / 2; metalZone.position.set(4.7, 0.014, -3.6); metalZone.receiveShadow = true; scene.add(metalZone);
  for (let line = -1; line <= 1; line += 1) {
    const groove = box(0.025, 0.018, 2.5, new THREE.MeshBasicMaterial({ color: 0x242b2c }));
    groove.position.set(4.7 + line * 1.05, 0.024, -3.6); scene.add(groove);
  }

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3334, metalness: 0.64, roughness: 0.35 });
  [-7.65, 7.65].forEach((x) => {
    const rail = box(0.22, 0.25, 14.5, railMaterial); rail.position.set(x, 0.13, 0); scene.add(rail);
  });

  scene.add(new THREE.HemisphereLight(0xc3ded8, 0x1e2425, 2.15));
  addCeilingLight(scene, -3.65); addCeilingLight(scene, 3.65);
  const backLight = new THREE.PointLight(0xffaa72, 5.4, 6.5, 1.7); backLight.position.set(0, 2.8, 6.7); scene.add(backLight);

  const dustGeometry = new THREE.BufferGeometry();
  const dust = new Float32Array(360 * 3);
  for (let index = 0; index < 360; index += 1) {
    dust[index * 3] = (Math.random() - 0.5) * 15.5;
    dust[(index * 3) + 1] = 0.2 + (Math.random() * 4.1);
    dust[(index * 3) + 2] = (Math.random() - 0.5) * 14.5;
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustPoints = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0x9bc7bd, size: 0.012, transparent: true, opacity: 0.36, depthWrite: false }));
  scene.add(dustPoints);

  const weapon = createWeapon(camera);
  const raycaster = new THREE.Raycaster();
  const strikes = [];
  let shake = 0;
  let elapsed = 0;

  function getMappedAim() {
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersection = raycaster.intersectObject(screenMesh, false)[0];
    if (!intersection?.uv) return null;
    const arena = tacticalScreen.screenUvToArena(intersection.uv);
    return arena ? { arena, uv: intersection.uv, world: intersection.point } : null;
  }

  function fireEffect() {
    weapon.recoil = 1;
    weapon.muzzle.intensity = 18;
    weapon.muzzleDisc.material.opacity = 0.92;
  }

  function setReloading(active) { weapon.reloadSpin = active ? 1 : 0; }

  function spawnStrike(position, hit = false) {
    const group = new THREE.Group();
    group.position.set(position.x, 0.02, position.z);
    const color = hit ? 0xff795d : 0xa0e8da;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 30), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; group.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.13, 3.5, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 1.75; group.add(beam);
    const light = new THREE.PointLight(color, hit ? 10 : 5, 3.2, 2); light.position.y = 0.35; group.add(light);
    scene.add(group); strikes.push({ group, ring, beam, light, age: 0, ttl: 0.72 });
  }

  function update(dt, player, yaw, pitch, movingAmount = 0, sprint = false) {
    elapsed += dt;
    const bobStrength = movingAmount * (sprint ? 0.036 : 0.018);
    const bob = Math.sin(elapsed * (sprint ? 13.5 : 9.2)) * bobStrength;
    const sideBob = Math.cos(elapsed * (sprint ? 6.75 : 4.6)) * bobStrength * 0.42;
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 0.09 : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 0.07 : 0;
    camera.position.set(player.x + shakeX, 1.65 + bob + shakeY, player.z);
    camera.rotation.set(pitch + (shakeY * 0.17), yaw + (shakeX * 0.15), sideBob * 0.13);
    shake = Math.max(0, shake - (dt * 3.1));

    weapon.recoil = Math.max(0, weapon.recoil - (dt * 8.5));
    const recoilCurve = Math.sin(weapon.recoil * Math.PI) * 0.12;
    weapon.group.position.set(0.35 + sideBob, -0.31 - (bob * 0.5), -0.63 + recoilCurve);
    weapon.group.rotation.x = -0.05 + (recoilCurve * 1.4);
    weapon.muzzle.intensity = Math.max(0, weapon.muzzle.intensity - (dt * 130));
    weapon.muzzleDisc.material.opacity = Math.max(0, weapon.muzzleDisc.material.opacity - (dt * 12));
    if (weapon.reloadSpin > 0) weapon.group.rotation.z = Math.sin(elapsed * 9) * 0.045;
    else weapon.group.rotation.z *= Math.max(0, 1 - (dt * 12));

    dustPoints.rotation.y += dt * 0.006;
    for (let index = strikes.length - 1; index >= 0; index -= 1) {
      const strike = strikes[index]; strike.age += dt;
      const progress = strike.age / strike.ttl;
      strike.ring.scale.setScalar(1 + (progress * 4.4));
      strike.ring.material.opacity = Math.max(0, 0.9 * (1 - progress));
      strike.beam.material.opacity = Math.max(0, 0.48 * (1 - progress));
      strike.light.intensity *= Math.max(0, 1 - (dt * 7));
      if (strike.age >= strike.ttl) { scene.remove(strike.group); strikes.splice(index, 1); }
    }
  }

  function render() { renderer.render(scene, camera); }

  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    screenMesh,
    getMappedAim,
    fireEffect,
    setReloading,
    spawnStrike,
    shake(amount = 1) { shake = Math.max(shake, amount); },
    update,
    render,
    resize,
    reset() {
      shake = 0; elapsed = 0; weapon.recoil = 0; weapon.reloadSpin = 0;
      strikes.splice(0).forEach((strike) => scene.remove(strike.group));
    },
  };
}
