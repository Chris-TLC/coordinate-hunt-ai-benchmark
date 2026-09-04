import * as THREE from 'three'
import { GAME_CONFIG, OBSTACLES } from './config'

const concrete = (color: number, roughness = 0.92) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 })

const addBox = (
  scene: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  rotationY = 0,
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.rotation.y = rotationY
  mesh.receiveShadow = true
  mesh.castShadow = true
  scene.add(mesh)
  return mesh
}

export type SceneObjects = {
  weapon: THREE.Group
  weaponMuzzle: THREE.PointLight
  ambientParticles: THREE.Points
}

export const buildArenaScene = (scene: THREE.Scene, camera: THREE.PerspectiveCamera): SceneObjects => {
  scene.background = new THREE.Color(0x081011)
  scene.fog = new THREE.FogExp2(0x081011, 0.022)

  const floorMaterial = concrete(0x35413f, 0.86)
  const wallMaterial = concrete(0x1e2928)
  const farWallMaterial = concrete(0x26312f)
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x273331,
    roughness: 0.42,
    metalness: 0.62,
  })
  const obstacleMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b5550,
    roughness: 0.78,
    metalness: 0.1,
  })

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GAME_CONFIG.arena.width, GAME_CONFIG.arena.depth),
    floorMaterial,
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(GAME_CONFIG.arena.width / 2, 0, GAME_CONFIG.arena.depth / 2)
  floor.receiveShadow = true
  scene.add(floor)

  const grid = new THREE.GridHelper(16, 16, 0x53645e, 0x44524d)
  grid.position.set(8, 0.012, 7.5)
  grid.material.transparent = true
  grid.material.opacity = 0.32
  scene.add(grid)

  addBox(scene, [0.32, 9, 15.4], [-0.16, 4.5, 7.5], wallMaterial)
  addBox(scene, [0.32, 9, 15.4], [16.16, 4.5, 7.5], wallMaterial)
  addBox(scene, [16.4, 9, 0.34], [8, 4.5, 15.17], farWallMaterial)
  addBox(scene, [16.4, 9, 0.28], [8, 4.5, -0.14], wallMaterial)
  addBox(scene, [16.4, 0.25, 15.4], [8, 9.08, 7.5], wallMaterial)

  for (const obstacle of OBSTACLES) {
    addBox(
      scene,
      [obstacle.width, obstacle.height, obstacle.depth],
      [obstacle.x, obstacle.height / 2, obstacle.z],
      obstacleMaterial,
      obstacle.rotation,
    )
    const cap = addBox(
      scene,
      [obstacle.width + 0.08, 0.08, obstacle.depth + 0.08],
      [obstacle.x, obstacle.height + 0.035, obstacle.z],
      new THREE.MeshStandardMaterial({
        color: 0x8b6c32,
        emissive: 0x4f3108,
        emissiveIntensity: 0.45,
        roughness: 0.55,
      }),
      obstacle.rotation,
    )
    cap.castShadow = false
  }

  const restrictionLine = addBox(
    scene,
    [15.85, 0.045, 0.11],
    [8, 0.035, GAME_CONFIG.arena.restrictedDepth],
    new THREE.MeshStandardMaterial({
      color: 0xbe7c22,
      emissive: 0x9b4b05,
      emissiveIntensity: 2.5,
      roughness: 0.4,
    }),
  )
  restrictionLine.castShadow = false

  for (let x = 0.8; x < 16; x += 1.6) {
    const marker = addBox(
      scene,
      [0.78, 0.01, 0.34],
      [x, 0.025, GAME_CONFIG.arena.restrictedDepth + 0.28],
      new THREE.MeshBasicMaterial({ color: x % 3.2 < 1 ? 0xc48a35 : 0x24312f }),
    )
    marker.castShadow = false
  }

  const screenHousing = addBox(scene, [13.25, 7.65, 0.28], [8, 4.65, 0.08], metalMaterial)
  screenHousing.castShadow = false
  addBox(scene, [13.8, 0.16, 0.4], [8, 0.8, 0.05], concrete(0x59635e), 0)
  addBox(scene, [13.8, 0.16, 0.4], [8, 8.5, 0.05], concrete(0x59635e), 0)

  for (const x of [0.52, 15.48]) {
    addBox(scene, [0.34, 8.3, 0.34], [x, 4.25, 0.35], metalMaterial)
    addBox(scene, [0.5, 0.4, 0.48], [x, 0.24, 0.35], metalMaterial)
  }

  const stripMaterial = new THREE.MeshStandardMaterial({
    color: 0xb7d4ca,
    emissive: 0x9ed2c2,
    emissiveIntensity: 3.1,
    roughness: 0.25,
  })
  for (const x of [2.3, 5.9, 10.1, 13.7]) {
    const strip = addBox(scene, [1.95, 0.08, 0.24], [x, 8.92, 7.2], stripMaterial)
    strip.castShadow = false
    const light = new THREE.PointLight(0x9fd8c8, 12, 8.5, 2)
    light.position.set(x, 8.45, 7.2)
    scene.add(light)
  }

  const screenLight = new THREE.RectAreaLight(0x46d8cb, 15, 10, 6)
  screenLight.position.set(8, 4.6, 0.7)
  screenLight.lookAt(8, 4.3, 8)
  scene.add(screenLight)

  const hemi = new THREE.HemisphereLight(0xa7cfc5, 0x17211f, 0.72)
  scene.add(hemi)

  const warmLight = new THREE.PointLight(0xd99e43, 17, 7.5, 2)
  warmLight.position.set(8, 1.4, 14.4)
  scene.add(warmLight)

  const particleGeometry = new THREE.BufferGeometry()
  const particles: number[] = []
  for (let index = 0; index < 110; index += 1) {
    particles.push(Math.random() * 16, 0.5 + Math.random() * 8, Math.random() * 15)
  }
  particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particles, 3))
  const ambientParticles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ color: 0xa6c0b8, size: 0.018, transparent: true, opacity: 0.38 }),
  )
  scene.add(ambientParticles)

  const weapon = buildWeapon()
  weapon.position.set(0.34, -0.31, -0.58)
  camera.add(weapon)
  scene.add(camera)

  const weaponMuzzle = new THREE.PointLight(0xffb75a, 0, 3.5, 2)
  weaponMuzzle.position.set(0.06, 0.015, -0.84)
  weapon.add(weaponMuzzle)

  return { weapon, weaponMuzzle, ambientParticles }
}

const buildWeapon = () => {
  const group = new THREE.Group()
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x1d2424,
    roughness: 0.36,
    metalness: 0.76,
  })
  const midMetal = new THREE.MeshStandardMaterial({
    color: 0x5d6762,
    roughness: 0.42,
    metalness: 0.55,
  })
  const accent = new THREE.MeshStandardMaterial({
    color: 0xb47c2d,
    emissive: 0x603506,
    emissiveIntensity: 0.7,
    roughness: 0.38,
  })

  addBox(group, [0.18, 0.18, 0.72], [0, 0, -0.29], darkMetal)
  addBox(group, [0.12, 0.12, 0.52], [0, 0.015, -0.86], midMetal)
  addBox(group, [0.2, 0.08, 0.28], [0, 0.13, -0.28], accent)
  const grip = addBox(group, [0.13, 0.36, 0.18], [0, -0.23, -0.12], darkMetal)
  grip.rotation.x = -0.18

  const sight = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 20), accent)
  sight.rotation.y = Math.PI / 2
  sight.position.set(0, 0.17, -0.54)
  group.add(sight)

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.052, 0.3, 12), darkMetal)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.01, -1.18)
  group.add(barrel)

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false
      child.receiveShadow = false
    }
  })
  return group
}
