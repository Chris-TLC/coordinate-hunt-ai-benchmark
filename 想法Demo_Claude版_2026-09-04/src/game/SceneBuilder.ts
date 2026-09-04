/**
 * 场景构建器：只负责拼装冷色工业风格的 3D 环境与第一人称武器模型。
 *
 * 注意：巨幕地图 quad 不在这里放置，由 ScreenDisplay.ts 负责；
 * 本文件只搭巨幕的金属边框与背板，并给巨幕区域提供 RectAreaLight 辉光。
 * 不访问 DOM，不加载外部资源，全部几何体 + 材质。
 */
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { GAME_CONFIG, OBSTACLES } from './config'

// RectAreaLight 依赖专用 uniform/shader，必须在创建 RectAreaLight 之前初始化。
RectAreaLightUniformsLib.init()

/** 环境基调 */
const BG_COLOR = 0x081011
const FOG_COLOR = 0x071013
const GOLD = 0xd9a441
const GOLD_EMISSIVE = 0x2a1e08
const TEAL = 0x2a6b6e
const WARM = 0xff9c5a
const WARNING = 0xff5a2d

/** 悬浮尘埃：THREE.Points 扩展，保留初始位置供逐帧漂移动画用 */
export class AmbientParticleField extends THREE.Points {
  basePositions: Float32Array

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    super(geometry, material)
    const attr = geometry.getAttribute('position')
    this.basePositions = new Float32Array(attr.array)
  }
}

/** 场景对象句柄：武器挂载点、枪口光、悬浮尘埃 */
export type SceneObjects = {
  weapon: THREE.Group
  weaponMuzzle: THREE.PointLight
  ambientParticles: AmbientParticleField
}

/** 材质 + 阴影的默认值，统一风格，避免重复 */
const std = (
  color: THREE.ColorRepresentation,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.1,
    ...options,
  })

export const buildArenaScene = (
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): SceneObjects => {
  const { arena, screen } = GAME_CONFIG

  // ---------- 环境 ----------
  scene.background = new THREE.Color(BG_COLOR)
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.02)

  // ---------- 地面与网格 ----------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.width, arena.depth),
    std(0x35413f, { roughness: 0.95, metalness: 0 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(arena.width / 2, 0, arena.depth / 2)
  floor.receiveShadow = true
  floor.name = 'floor'
  scene.add(floor)

  const gridA = new THREE.GridHelper(arena.width, arena.width, 0x3a5a5d, 0x2a3f41)
  gridA.position.set(arena.width / 2, 0.01, arena.depth / 2)
  gridA.receiveShadow = true
  const gridAMat = gridA.material as THREE.LineBasicMaterial
  gridAMat.transparent = true
  gridAMat.opacity = 0.55
  scene.add(gridA)

  // 细网格只覆盖深处可行走区域，像测绘定位纸，不盖住巨幕前的警示带
  const gridB = new THREE.GridHelper(arena.width, arena.width * 2, 0x2e4a4d, 0x223336)
  gridB.position.set(arena.width / 2, 0.011, 7 + (arena.depth - 7) / 2)
  const gridBMat = gridB.material as THREE.LineBasicMaterial
  gridBMat.transparent = true
  gridBMat.opacity = 0.4
  scene.add(gridB)

  // ---------- 墙体与天花板 ----------
  const wallMat = std(0x1c2628, { roughness: 0.85, metalness: 0.25 })
  const T = 0.3
  const walls: Array<[number, number, number, number, number]> = [
    // [x, y, z, w, h]
    [0, arena.height / 2, arena.depth / 2, T, arena.height],
    [arena.width, arena.height / 2, arena.depth / 2, T, arena.height],
    [arena.width / 2, arena.height / 2, arena.depth, arena.width + T, arena.height],
    [arena.width / 2, arena.height / 2, 0, arena.width + T, arena.height],
  ]
  for (const [x, y, z, w, h] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, T), wallMat)
    wall.position.set(x, y, z)
    wall.receiveShadow = true
    wall.castShadow = true
    scene.add(wall)
  }

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.width, arena.depth),
    std(0x11181a, { roughness: 0.95, metalness: 0.15 }),
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(arena.width / 2, arena.height, arena.depth / 2)
  ceiling.receiveShadow = true
  scene.add(ceiling)

  // 天花板几排昏暗灯带：几何上是一条发光的矩形，下面配一盏点光补氛围
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x2f6a6d })
  for (const z of [9, 13, 17]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.16), stripMat)
    strip.rotation.x = Math.PI / 2
    strip.position.set(arena.width / 2, arena.height - 0.02, z)
    strip.name = 'ceiling-strip'
    scene.add(strip)

    const lamp = new THREE.PointLight(TEAL, 20, 16, 2)
    lamp.position.set(arena.width / 2, arena.height - 0.7, z)
    scene.add(lamp)
  }

  // ---------- 巨幕边框与背板（地图 quad 由 ScreenDisplay.ts 负责）----------
  const screenCenterX = arena.width / 2
  const screenCenterY = screen.bottomHeight + screen.mapHeight / 2
  const frameMat = std(0x0d1416, { roughness: 0.45, metalness: 0.85 })
  const trimMat = std(GOLD, {
    roughness: 0.35,
    metalness: 1,
    emissive: GOLD_EMISSIVE,
    emissiveIntensity: 0.8,
  })

  const frame: Array<[number, number, number]> = [
    // [宽, 高, 中心 y]：上下两条 + 左右两条
    [screen.mapWidth + 0.5, 0.18, screen.bottomHeight - 0.09],
    [screen.mapWidth + 0.5, 0.18, screen.bottomHeight + screen.mapHeight + 0.09],
    [0.18, screen.mapHeight + 0.5, screenCenterY],
    [0.18, screen.mapHeight + 0.5, screenCenterY],
  ]
  const frameXs = [screenCenterX, screenCenterX, screenCenterX - screen.mapWidth / 2 - 0.09, screenCenterX + screen.mapWidth / 2 + 0.09]
  frame.forEach(([w, h, y], i) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), frameMat)
    bar.position.set(frameXs[i], y, screen.planeZ)
    bar.receiveShadow = true
    bar.castShadow = true
    scene.add(bar)
  })

  // 背板：挡住墙缝，也是 ScreenDisplay 挂地图的暗色底衬
  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(screen.mapWidth + 0.44, screen.mapHeight + 0.44),
    std(0x0c1416, { roughness: 0.9, metalness: 0.1 }),
  )
  backing.position.set(screenCenterX, screenCenterY, screen.planeZ - 0.05)
  scene.add(backing)

  // 边框上缘的金色细饰条，工业设备感
  const trim = new THREE.Mesh(new THREE.BoxGeometry(screen.mapWidth + 0.44, 0.025, 0.05), trimMat)
  trim.position.set(screenCenterX, screen.bottomHeight + screen.mapHeight + 0.14, screen.planeZ + 0.05)
  trim.castShadow = true
  scene.add(trim)

  // ---------- 巨幕辉光：RectAreaLight（已 init）----------
  const screenGlow = new THREE.RectAreaLight(0x2f8f96, 20, screen.mapWidth + 1.2, screen.mapHeight + 1.2)
  screenGlow.position.set(screenCenterX, screenCenterY, screen.planeZ + 1.1)
  screenGlow.lookAt(screenCenterX, screenCenterY, -20)
  scene.add(screenGlow)

  // ---------- 禁入区警示线（z = restrictedDepth）----------
  const glowLine = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.width - 1, 0.1),
    new THREE.MeshBasicMaterial({
      color: 0x33120a,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  )
  glowLine.rotation.x = -Math.PI / 2
  glowLine.position.set(arena.width / 2, 0.012, arena.restrictedDepth)
  scene.add(glowLine)

  const markerMat = new THREE.MeshBasicMaterial({ color: WARNING })
  const n = Math.floor(arena.width / 2) - 1
  for (let i = 0; i <= n; i += 1) {
    const x = 1 + 2 * i
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.28), markerMat)
    marker.position.set(x, 0.013, arena.restrictedDepth + (i % 2 === 0 ? 0.22 : -0.22))
    scene.add(marker)
  }

  // ---------- 障碍：深灰绿箱体 + 顶部金色盖条 ----------
  const obsMat = std(0x333f3b, { roughness: 0.8, metalness: 0.35 })
  const capMat = std(GOLD, {
    roughness: 0.3,
    metalness: 0.9,
    emissive: GOLD_EMISSIVE,
    emissiveIntensity: 0.6,
  })
  for (const ob of OBSTACLES) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(ob.width, ob.height, ob.depth), obsMat)
    box.position.set(ob.x, ob.height / 2, ob.z)
    box.rotation.y = ob.rotation
    box.receiveShadow = true
    box.castShadow = true
    box.name = 'obstacle'
    scene.add(box)

    const cap = new THREE.Mesh(new THREE.BoxGeometry(ob.width, 0.045, ob.depth), capMat)
    cap.position.set(ob.x, ob.height + 0.022, ob.z)
    cap.rotation.y = ob.rotation
    cap.castShadow = true
    scene.add(cap)
  }

  // ---------- 灯光：半球环境 + 远墙暖光（唯一投阴影的光）----------
  const hemi = new THREE.HemisphereLight(0x2a6b6e, 0x05090a, 0.9)
  scene.add(hemi)

  const farGlow = new THREE.PointLight(WARM, 26, 26, 2)
  farGlow.position.set(arena.width / 2, 6.6, arena.depth - 2.2)
  farGlow.castShadow = true
  farGlow.shadow.mapSize.set(1024, 1024)
  farGlow.shadow.bias = -0.0004
  farGlow.shadow.camera.near = 0.5
  farGlow.shadow.camera.far = 40
  scene.add(farGlow)

  // ---------- 悬浮尘埃：数百个半透明小点 ----------
  const COUNT = 340
  const positions = new Float32Array(COUNT * 3)
  for (let i = 0; i < COUNT; i += 1) {
    positions[i * 3] = 1 + Math.random() * (arena.width - 2)
    positions[i * 3 + 1] = 0.15 + Math.random() * (arena.height - 0.5)
    positions[i * 3 + 2] = 1.5 + Math.random() * (arena.depth - 3)
  }
  const particleGeo = new THREE.BufferGeometry()
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  // 不用贴图，用 ShaderMaterial 在片元里画软圆点：无需 DOM/canvas
  const ambientParticles = new AmbientParticleField(
    particleGeo,
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x9fd8d5) },
        // ≈ 屏幕高度 / (2·tan(fov/2))，0.007 世界单位 ≈ 2 m 处 3 px
        uSize: { value: 0.007 },
        uScale: { value: 940 },
      },
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uScale;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (uScale / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          float alpha = smoothstep(0.25, 0.0, r2) * 0.55;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  ambientParticles.frustumCulled = false
  ambientParticles.name = 'ambient-particles'
  scene.add(ambientParticles)

  // ---------- 第一人称武器（挂到相机下）----------
  // 武器贴着相机，投阴影会在地面留下无主的黑块，故只接收阴影不投影
  const weapon = new THREE.Group()
  weapon.position.set(0.26, -0.24, -0.55)
  weapon.receiveShadow = true

  const bodyMat = std(0x23282c, { roughness: 0.5, metalness: 0.85 })
  const darkMat = std(0x161a1d, { roughness: 0.65, metalness: 0.7 })
  const goldMat = std(GOLD, {
    roughness: 0.3,
    metalness: 0.95,
    emissive: GOLD_EMISSIVE,
    emissiveIntensity: 0.5,
  })

  // 机匣
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.1, 0.3), bodyMat)
  receiver.position.set(0, -0.015, -0.05)
  weapon.add(receiver)

  // 枪管（Z 轴朝前，从机匣前缘探出）
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.3, 10), darkMat)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, -0.01, -0.32)
  weapon.add(barrel)

  // 金色饰条：机匣顶部的细窄条
  const accent = new THREE.Mesh(new THREE.BoxGeometry(0.067, 0.012, 0.26), goldMat)
  accent.position.set(0, 0.044, -0.06)
  weapon.add(accent)

  // 枪口准星小环
  const sight = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 16), goldMat)
  sight.rotation.x = Math.PI / 2
  sight.position.set(0, 0.004, -0.46)
  weapon.add(sight)

  // 握把：向下、略微后倾
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), darkMat)
  grip.position.set(0, -0.12, 0.085)
  grip.rotation.x = 0.35
  weapon.add(grip)

  // 枪口点光：平时强度为 0，开火动画时点亮
  const weaponMuzzle = new THREE.PointLight(0xffc27a, 0, 3, 2)
  weaponMuzzle.position.set(0, 0.01, -0.47)
  weapon.add(weaponMuzzle)

  // 近身微光：让黑暗中仍能看清手里的枪（不投阴影）
  const fill = new THREE.PointLight(0x33555c, 2, 1.4, 2)
  fill.position.set(0, 0.2, 0.05)
  weapon.add(fill)

  camera.add(weapon)

  return { weapon, weaponMuzzle, ambientParticles }
}
