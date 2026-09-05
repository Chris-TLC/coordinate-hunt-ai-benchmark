(function (root) {
  'use strict';
  const { OBSTACLES, SeededRandom, clamp } = root.Blindspot;
  const SCREEN = { x: -7.2, width: 14.4, bottom: 0.92, height: 5.84, z: 0.075 };
  const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  function multiply(left, right) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
      result[column * 4 + row] = left[row] * right[column * 4] + left[4 + row] * right[column * 4 + 1] + left[8 + row] * right[column * 4 + 2] + left[12 + row] * right[column * 4 + 3];
    }
    return result;
  }

  function transform(position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const [rotateX, rotateY, rotateZ] = rotation;
    const cosineX = Math.cos(rotateX), sineX = Math.sin(rotateX), cosineY = Math.cos(rotateY), sineY = Math.sin(rotateY), cosineZ = Math.cos(rotateZ), sineZ = Math.sin(rotateZ);
    const rotationX = new Float32Array([1, 0, 0, 0, 0, cosineX, sineX, 0, 0, -sineX, cosineX, 0, 0, 0, 0, 1]);
    const rotationY = new Float32Array([cosineY, 0, -sineY, 0, 0, 1, 0, 0, sineY, 0, cosineY, 0, 0, 0, 0, 1]);
    const rotationZ = new Float32Array([cosineZ, sineZ, 0, 0, -sineZ, cosineZ, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const result = multiply(multiply(rotationY, rotationX), rotationZ);
    for (let index = 0; index < 3; index++) { result[index] *= scale[0]; result[4 + index] *= scale[1]; result[8 + index] *= scale[2]; }
    result[12] = position[0]; result[13] = position[1]; result[14] = position[2];
    return result;
  }

  function perspective(fov, aspect, near, far) {
    const focal = 1 / Math.tan(fov / 2);
    return new Float32Array([focal / aspect, 0, 0, 0, 0, focal, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
  }

  function cameraBasis(yaw, pitch) {
    return {
      forward: [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)],
      right: [Math.cos(yaw), 0, Math.sin(yaw)],
      up: [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)]
    };
  }

  function viewMatrix(eye, yaw, pitch) {
    const { forward, right, up } = cameraBasis(yaw, pitch);
    const dot = (first, second) => first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
    return new Float32Array([right[0], up[0], -forward[0], 0, right[1], up[1], -forward[1], 0, right[2], up[2], -forward[2], 0, -dot(right, eye), -dot(up, eye), dot(forward, eye), 1]);
  }

  class Geometry {
    constructor() { this.data = []; }
    vertex(point, normal, color, uv, material) { this.data.push(...point, ...normal, ...color, ...uv, material); }
    quad(points, normal, color, material = 0, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      for (const index of [0, 1, 2, 0, 2, 3]) this.vertex(points[index], normal, color, uvs[index], material);
    }
    box(x, y, z, width, height, depth, color, material = 0, rotation = 0) {
      const lowX = -width / 2, highX = width / 2, lowY = y - height / 2, highY = y + height / 2, lowZ = -depth / 2, highZ = depth / 2;
      const rotate = point => [x + point[0] * Math.cos(rotation) + point[2] * Math.sin(rotation), point[1], z - point[0] * Math.sin(rotation) + point[2] * Math.cos(rotation)];
      const rotateNormal = normal => [normal[0] * Math.cos(rotation) + normal[2] * Math.sin(rotation), normal[1], -normal[0] * Math.sin(rotation) + normal[2] * Math.cos(rotation)];
      const faces = [
        [[[lowX, lowY, highZ], [highX, lowY, highZ], [highX, highY, highZ], [lowX, highY, highZ]], [0, 0, 1]],
        [[[highX, lowY, lowZ], [lowX, lowY, lowZ], [lowX, highY, lowZ], [highX, highY, lowZ]], [0, 0, -1]],
        [[[highX, lowY, highZ], [highX, lowY, lowZ], [highX, highY, lowZ], [highX, highY, highZ]], [1, 0, 0]],
        [[[lowX, lowY, lowZ], [lowX, lowY, highZ], [lowX, highY, highZ], [lowX, highY, lowZ]], [-1, 0, 0]],
        [[[lowX, highY, highZ], [highX, highY, highZ], [highX, highY, lowZ], [lowX, highY, lowZ]], [0, 1, 0]],
        [[[lowX, lowY, lowZ], [highX, lowY, lowZ], [highX, lowY, highZ], [lowX, lowY, highZ]], [0, -1, 0]]
      ];
      for (const [points, normal] of faces) this.quad(points.map(rotate), rotateNormal(normal), color, material);
    }
    bevelBox(x, y, z, width, height, depth, bevel, color) {
      const halfWidth = width / 2, halfHeight = height / 2;
      const outline = [[-halfWidth + bevel, -halfHeight], [halfWidth - bevel, -halfHeight], [halfWidth, -halfHeight + bevel], [halfWidth, halfHeight - bevel], [halfWidth - bevel, halfHeight], [-halfWidth + bevel, halfHeight], [-halfWidth, halfHeight - bevel], [-halfWidth, -halfHeight + bevel]];
      for (let index = 0; index < outline.length; index++) {
        const first = outline[index], second = outline[(index + 1) % outline.length];
        const differenceX = second[0] - first[0], differenceY = second[1] - first[1], length = Math.hypot(differenceX, differenceY);
        this.quad([[x + first[0], y + first[1], z - depth / 2], [x + second[0], y + second[1], z - depth / 2], [x + second[0], y + second[1], z + depth / 2], [x + first[0], y + first[1], z + depth / 2]], [differenceY / length, -differenceX / length, 0], color, 1);
        for (const sign of [-1, 1]) this.quad([[x, y, z + sign * depth / 2], [x + first[0], y + first[1], z + sign * depth / 2], [x + second[0], y + second[1], z + sign * depth / 2], [x, y, z + sign * depth / 2]], [0, 0, sign], color, 1);
      }
    }
    ring(radius, thickness, color, material = 3, segments = 64) {
      for (let segment = 0; segment < segments; segment++) {
        const first = segment / segments * Math.PI * 2;
        const second = (segment + 1) / segments * Math.PI * 2;
        this.quad([[Math.cos(first) * radius, 0, Math.sin(first) * radius], [Math.cos(second) * radius, 0, Math.sin(second) * radius], [Math.cos(second) * (radius - thickness), 0, Math.sin(second) * (radius - thickness)], [Math.cos(first) * (radius - thickness), 0, Math.sin(first) * (radius - thickness)]], [0, 1, 0], color, material);
      }
    }
    cylinder(x, y, z, radius, height, color, material = 0, segments = 12) {
      for (let segment = 0; segment < segments; segment++) {
        const first = segment / segments * Math.PI * 2;
        const second = (segment + 1) / segments * Math.PI * 2;
        const pointA = [x + Math.cos(first) * radius, y - height / 2, z + Math.sin(first) * radius];
        const pointB = [x + Math.cos(second) * radius, y - height / 2, z + Math.sin(second) * radius];
        this.quad([pointA, pointB, [pointB[0], y + height / 2, pointB[2]], [pointA[0], y + height / 2, pointA[2]]], [Math.cos((first + second) / 2), 0, Math.sin((first + second) / 2)], color, material);
        this.quad([[x, y + height / 2, z], [pointA[0], y + height / 2, pointA[2]], [pointB[0], y + height / 2, pointB[2]], [x, y + height / 2, z]], [0, 1, 0], color, material);
      }
    }
  }

  const vertexSource = `
    precision highp float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    attribute vec2 aUv;
    attribute float aMaterial;
    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform mat4 uModel;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec2 vUv;
    varying float vMaterial;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      vColor = aColor;
      vUv = aUv;
      vMaterial = aMaterial;
      gl_Position = uProjection * uView * world;
    }
  `;
  const fragmentSource = `
    precision highp float;
    uniform vec3 uEye;
    uniform sampler2D uTexture;
    uniform float uTextured;
    uniform float uOpacity;
    uniform float uTime;
    uniform vec3 uTint;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec2 vUv;
    varying float vMaterial;
    float random(vec3 point) { return fract(sin(dot(point, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    float blockShadow(vec2 center, vec2 size) {
      vec2 distance = max(abs(vWorld.xz - center) - size, 0.0);
      return exp(-length(distance) * 2.5) * 0.26;
    }
    void main() {
      vec3 color = vColor;
      float alpha = uOpacity;
      if (uTextured > 0.5) {
        vec4 texel = texture2D(uTexture, vUv);
        color = texel.rgb;
        alpha *= texel.a;
        if (uTextured < 1.5) color *= 1.12;
      } else if (vMaterial < 2.5) {
        vec3 normal = normalize(vNormal);
        float light = max(dot(normal, normalize(vec3(-0.25, 0.85, 0.28))), 0.0);
        vec3 illumination = vec3(0.37, 0.41, 0.37) + vec3(0.46, 0.47, 0.40) * light;
        vec3 toScreen = vec3(0.0, 3.8, -1.0) - vWorld;
        float screenLight = max(dot(normal, normalize(toScreen)), 0.0) * exp(-max(vWorld.z, 0.0) * 0.092);
        illumination += vec3(0.25, 0.43, 0.34) * screenLight;
        float lamp = exp(-length(vWorld.xz - vec2(4.5, 7.0)) * 0.23) + exp(-length(vWorld.xz - vec2(-4.5, 7.0)) * 0.23);
        illumination += vec3(0.2, 0.19, 0.15) * lamp * max(normal.y, 0.0);
        float grain = random(floor(vWorld * 145.0));
        color *= illumination * (vMaterial > 0.5 && vMaterial < 1.5 ? 0.995 + grain * 0.01 : 0.96 + grain * 0.08);
        if (vMaterial > 1.5) {
          vec2 tile = abs(fract(vWorld.xz) - 0.5);
          float seam = max(smoothstep(0.493, 0.5, tile.x), smoothstep(0.493, 0.5, tile.y));
          color *= 1.0 - seam * 0.17;
          color += step(0.96, grain) * 0.055;
          float shadow = blockShadow(vec2(-3.8, 4.4), vec2(1.2, 0.55));
          shadow += blockShadow(vec2(3.8, 4.4), vec2(1.2, 0.55));
          shadow += blockShadow(vec2(-3.0, 9.0), vec2(0.6, 1.25));
          shadow += blockShadow(vec2(3.0, 9.0), vec2(0.6, 1.25));
          color *= 1.0 - shadow;
          color += vec3(0.06, 0.13, 0.08) * exp(-vWorld.z * 0.31);
        }
        float ceilingAO = smoothstep(0.0, 0.45, 7.4 - vWorld.y);
        color *= 0.76 + ceilingAO * 0.24;
      } else color *= 1.06;
      float fog = 1.0 - exp(-length(vWorld - uEye) * 0.014);
      if (uTextured < 1.5) color = mix(color, vec3(0.105, 0.145, 0.132), fog);
      color *= uTint;
      gl_FragColor = vec4(color, alpha);
    }
  `;

  class RoomRenderer {
    constructor(canvas, display) {
      this.canvas = canvas;
      this.display = display;
      this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!this.gl) throw new Error('WEBGL_UNAVAILABLE');
      const gl = this.gl;
      this.program = this.createProgram(vertexSource, fragmentSource);
      gl.useProgram(this.program);
      this.attributes = {};
      for (const name of ['aPosition', 'aNormal', 'aColor', 'aUv', 'aMaterial']) this.attributes[name] = gl.getAttribLocation(this.program, name);
      this.uniforms = {};
      for (const name of ['uProjection', 'uView', 'uModel', 'uEye', 'uTexture', 'uTextured', 'uOpacity', 'uTime', 'uTint']) this.uniforms[name] = gl.getUniformLocation(this.program, name);
      this.world = this.upload(this.buildWorld());
      this.gun = this.upload(this.buildGun());
      this.magazine = this.upload(this.buildMagazine());
      this.screen = this.upload(this.buildScreen());
      const ring = new Geometry(); ring.ring(1, 0.025, [0.94, 0.38, 0.22]); this.ring = this.upload(ring);
      const flash = new Geometry(); flash.box(0, 0, 0, 0.08, 0.08, 0.18, [1, 0.85, 0.54], 3); this.flash = this.upload(flash);
      const beam = new Geometry(); beam.cylinder(0, 1.5, 0, 0.035, 3, [1, 0.55, 0.3], 3); this.beam = this.upload(beam);
      this.screenTexture = this.createTexture(display.canvas);
      this.decals = this.buildDecals();
      this.eye = [0, 1.72, 11.8]; this.yaw = 0; this.pitch = 0.17; this.fov = 65 * Math.PI / 180;
      this.quality = 'high'; this.pixelRatio = 1;
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.clearColor(0.1, 0.13, 0.12, 1);
      this.resize();
    }

    createProgram(vertex, fragment) {
      const gl = this.gl;
      const program = gl.createProgram();
      for (const [source, type] of [[vertex, gl.VERTEX_SHADER], [fragment, gl.FRAGMENT_SHADER]]) {
        const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader); gl.deleteShader(shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    }

    upload(geometry) {
      const gl = this.gl; const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.data), gl.STATIC_DRAW);
      return { buffer, count: geometry.data.length / 12 };
    }

    createTexture(canvas) {
      const gl = this.gl; const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      return texture;
    }

    updateScreen() {
      const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.screenTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.display.canvas);
    }

    draw(mesh, model = identity(), options = {}) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      let offset = 0;
      for (const [name, size] of [['aPosition', 3], ['aNormal', 3], ['aColor', 3], ['aUv', 2], ['aMaterial', 1]]) {
        const attribute = this.attributes[name]; gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 48, offset * 4); offset += size;
      }
      gl.uniformMatrix4fv(this.uniforms.uModel, false, model);
      gl.uniform1f(this.uniforms.uTextured, options.texture ? options.decal ? 2 : 1 : 0);
      gl.uniform1f(this.uniforms.uOpacity, options.opacity === undefined ? 1 : options.opacity);
      gl.uniform3fv(this.uniforms.uTint, options.tint || [1, 1, 1]);
      if (options.texture) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, options.texture); }
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    buildScreen() {
      const mesh = new Geometry();
      mesh.quad([[SCREEN.x, SCREEN.bottom, SCREEN.z], [SCREEN.x + SCREEN.width, SCREEN.bottom, SCREEN.z], [SCREEN.x + SCREEN.width, SCREEN.bottom + SCREEN.height, SCREEN.z], [SCREEN.x, SCREEN.bottom + SCREEN.height, SCREEN.z]], [0, 0, 1], [1, 1, 1], 3, [[0, 1], [1, 1], [1, 0], [0, 0]]);
      return mesh;
    }

    buildWorld() {
      const mesh = new Geometry();
      const concrete = [0.39, 0.43, 0.38], pale = [0.53, 0.55, 0.46], metal = [0.16, 0.21, 0.19], trim = [0.24, 0.3, 0.27], mint = [0.62, 0.76, 0.59], orange = [0.68, 0.35, 0.21];
      mesh.box(0, -0.16, 7.5, 16.6, 0.3, 15.6, [0.38, 0.42, 0.36], 2);
      mesh.box(0, 7.55, 7.5, 16.5, 0.3, 15.5, [0.3, 0.35, 0.3]);
      mesh.box(0, 3.6, -0.3, 16.5, 7.8, 0.5, [0.23, 0.29, 0.25]);
      mesh.box(0, 3.65, 15.25, 16.5, 7.6, 0.5, concrete);
      for (const side of [-1, 1]) {
        mesh.box(side * 8.25, 3.6, 7.5, 0.5, 7.6, 15, concrete);
        mesh.box(side * 7.95, 0.14, 7.5, 0.08, 0.28, 15, metal);
        mesh.box(side * 7.96, 2.4, 7.5, 0.07, 0.05, 15, trim);
        mesh.box(side * 7.94, 2.3, 7.5, 0.07, 0.08, 15, orange);
        for (const position of [1, 6.7, 12.8]) {
          mesh.box(side * 7.87, 3.8, position, 0.28, 7.2, 0.46, pale);
          mesh.box(side * 7.84, 0.57, position, 0.35, 1.1, 0.58, trim);
        }
        for (const position of [3.4, 9.7]) {
          mesh.box(side * 7.94, 4.85, position, 0.1, 2.3, 3.8, metal);
          mesh.box(side * 7.87, 4.85, position, 0.035, 2.08, 3.56, [0.5, 0.6, 0.49], 3);
          for (let slat = 0; slat < 8; slat++) mesh.box(side * 7.8, 3.9 + slat * 0.27, position, 0.18, 0.09, 3.7, trim);
          for (let bar = -1; bar <= 1; bar++) mesh.box(side * 7.76, 4.84, position + bar * 1.18, 0.1, 2.14, 0.035, metal);
          mesh.box(side * 7.7, 3.67, position, 0.55, 0.12, 4.05, pale);
          for (let panel = 0; panel < 10; panel++) mesh.box(side * 7.9, 1.25, position - 1.58 + panel * 0.35, 0.13, 1.7, 0.18, [0.3, 0.36, 0.3]);
        }
        mesh.box(side * 7.35, 0.008, 7.5, 0.035, 0.012, 14, [0.76, 0.72, 0.48]);
        for (let stripe = 0; stripe < 14; stripe++) mesh.box(side * 7.6, 0.012, 1 + stripe, 0.24, 0.015, 0.06, [0.7, 0.68, 0.48]);
      }
      for (const position of [0.4, 5.6, 10.8, 14.7]) {
        mesh.box(0, 7.14, position, 16.0, 0.56, 0.38, [0.26, 0.32, 0.27]);
        for (const side of [-1, 1]) {
          mesh.box(side * 4.5, 6.97, position + 0.35, 3.0, 0.12, 0.6, metal);
          mesh.box(side * 4.5, 6.9, position + 0.35, 2.84, 0.028, 0.42, [0.91, 0.9, 0.7], 3);
        }
      }
      for (const x of [-6.5, -6.3, 6.3, 6.5]) mesh.box(x, 7.34, 7.5, 0.08, 0.1, 15, metal);
      mesh.box(0, 0.59, 0, 15.0, 0.5, 0.48, metal);
      mesh.box(0, 6.98, 0, 15.0, 0.25, 0.4, metal);
      mesh.box(-7.43, 3.8, 0, 0.28, 6.6, 0.4, metal);
      mesh.box(7.43, 3.8, 0, 0.28, 6.6, 0.4, metal);
      mesh.box(0, 0.86, 0.12, 14.58, 0.035, 0.05, mint, 3);
      mesh.box(0, 6.82, 0.12, 14.58, 0.025, 0.05, mint, 3);
      for (let vent = 0; vent < 55; vent++) mesh.box(-6.8 + vent * 0.25, 0.5, 0.26, 0.1, 0.14, 0.025, [0.07, 0.1, 0.09]);
      for (const block of OBSTACLES) {
        mesh.box(block.x, 0.075, block.z, block.width + 0.08, 0.15, block.depth + 0.08, metal);
        mesh.box(block.x, block.height / 2, block.z, block.width, block.height, block.depth, [0.42, 0.47, 0.39]);
        mesh.box(block.x, block.height - 0.04, block.z, block.width + 0.09, 0.13, block.depth + 0.08, [0.59, 0.62, 0.49]);
        mesh.box(block.x, block.height - 0.21, block.z + block.depth / 2 + 0.006, block.width, 0.035, 0.014, [0.72, 0.66, 0.4]);
        for (const sign of [-1, 1]) mesh.box(block.x + sign * (block.width / 2 - 0.1), 0.28, block.z + block.depth / 2 + 0.01, 0.045, 0.32, 0.018, trim);
      }
      for (const position of [3.0, 12.5]) {
        for (const side of [-1, 1]) mesh.box(side * 5.55, 0.012, position, 2.2, 0.018, 0.035, [0.72, 0.7, 0.49]);
      }
      mesh.box(0, 1.48, 15.005, 2.25, 2.96, 0.06, metal);
      mesh.box(0, 1.4, 14.96, 1.96, 2.75, 0.06, [0.33, 0.4, 0.34]);
      mesh.box(0, 2.06, 14.91, 0.72, 0.48, 0.04, [0.12, 0.19, 0.16]);
      mesh.box(0.72, 1.12, 14.85, 0.07, 0.27, 0.13, [0.66, 0.7, 0.57]);
      mesh.box(0, 3.26, 14.94, 1.1, 0.23, 0.09, [0.51, 0.71, 0.51], 3);
      for (const side of [-1, 1]) {
        mesh.box(side * 5.1, 0.41, 14.4, 3.9, 0.18, 0.8, [0.34, 0.35, 0.26]);
        for (const end of [-1, 1]) mesh.box(side * 5.1 + end * 1.5, 0.2, 14.4, 0.1, 0.4, 0.6, metal);
        for (let panel = 0; panel < 16; panel++) mesh.box(side * 4.7 + (panel - 8) * 0.23, 3.6, 14.98, 0.09, 2.0, 0.08, [0.27, 0.33, 0.27]);
      }
      for (let rack = 0; rack < 3; rack++) {
        mesh.box(-7.57, 0.5, 13 + rack * 0.43, 0.48, 0.8, 0.38, [0.22, 0.31, 0.28]);
        mesh.box(-7.32, 0.7, 13 + rack * 0.43, 0.025, 0.028, 0.12, mint, 3);
      }
      const random = new SeededRandom(29);
      for (let cable = 0; cable < 2; cable++) {
        let previous = [-7.1 + cable * 0.1, 0.025, 0.3];
        for (let segment = 1; segment < 50; segment++) {
          const next = [-7.1 + Math.sin(segment * 0.24) * 0.21 + cable * 0.1, 0.026, 0.3 + segment * 0.25];
          const length = Math.hypot(next[0] - previous[0], next[2] - previous[2]);
          mesh.box((previous[0] + next[0]) / 2, 0.027, (previous[2] + next[2]) / 2, 0.022, 0.025, length, [0.1, 0.14, 0.12], 0, Math.atan2(next[0] - previous[0], next[2] - previous[2]));
          previous = next;
        }
      }
      for (let bolt = 0; bolt < 45; bolt++) {
        const position = random.range(0.5, 14.5);
        mesh.box(random.next() > 0.5 ? 7.978 : -7.978, random.range(0.5, 3.1), position, 0.026, 0.03, 0.03, metal);
      }
      return mesh;
    }

    buildGun() {
      const mesh = new Geometry();
      const body = [0.71, 0.73, 0.62], dark = [0.15, 0.19, 0.18], grip = [0.23, 0.26, 0.24];
      mesh.bevelBox(0, 0, -0.15, 0.17, 0.16, 0.5, 0.023, body);
      mesh.box(0, 0.087, -0.16, 0.14, 0.024, 0.44, [0.56, 0.61, 0.53]);
      mesh.box(0, -0.084, -0.13, 0.125, 0.022, 0.39, dark);
      mesh.bevelBox(0, 0.0, -0.425, 0.123, 0.117, 0.065, 0.018, dark);
      mesh.box(0, 0.014, -0.462, 0.057, 0.044, 0.015, [0.07, 0.09, 0.08]);
      mesh.box(0, 0.105, -0.38, 0.025, 0.025, 0.048, dark);
      mesh.box(0, 0.115, -0.39, 0.009, 0.009, 0.02, [0.72, 0.93, 0.67], 3);
      for (const side of [-1, 1]) {
        mesh.box(side * 0.052, 0.104, 0.018, 0.025, 0.038, 0.058, dark);
        mesh.box(side * 0.052, 0.126, 0.028, 0.01, 0.006, 0.01, [0.74, 0.9, 0.7], 3);
        for (let rib = 0; rib < 5; rib++) mesh.box(side * 0.087, 0.005, -0.01 - rib * 0.025, 0.004, 0.103, 0.007, grip);
        mesh.box(side * 0.087, 0.007, -0.28, 0.005, 0.025, 0.08, [0.27, 0.56, 0.46], 3);
      }
      mesh.bevelBox(0, -0.19, 0.04, 0.135, 0.26, 0.14, 0.018, grip);
      for (let rib = 0; rib < 7; rib++) mesh.box(0, -0.11 - rib * 0.027, 0.114, 0.14, 0.009, 0.005, dark);
      mesh.box(0, -0.177, -0.13, 0.036, 0.028, 0.19, dark);
      mesh.box(0, -0.124, -0.224, 0.036, 0.135, 0.022, dark);
      mesh.box(0, -0.117, -0.075, 0.022, 0.065, 0.026, [0.42, 0.46, 0.4]);
      mesh.box(0, -0.056, -0.27, 0.19, 0.03, 0.048, [0.72, 0.38, 0.22]);
      mesh.box(0.018, -0.205, 0.12, 0.195, 0.12, 0.14, [0.27, 0.31, 0.27]);
      mesh.bevelBox(0.043, -0.31, 0.19, 0.17, 0.17, 0.19, 0.025, [0.31, 0.37, 0.31]);
      mesh.bevelBox(0.06, -0.4, 0.27, 0.22, 0.18, 0.2, 0.03, [0.38, 0.43, 0.35]);
      mesh.box(-0.074, -0.106, -0.045, 0.064, 0.064, 0.18, [0.32, 0.36, 0.3]);
      return mesh;
    }

    buildMagazine() {
      const mesh = new Geometry(); mesh.box(0, -0.31, 0.039, 0.14, 0.08, 0.16, [0.16, 0.22, 0.19]);
      mesh.box(0, -0.356, 0.039, 0.156, 0.024, 0.174, [0.53, 0.57, 0.45]); return mesh;
    }

    buildDecals() {
      const entries = [];
      const create = (text, width, height, geometry, fontSize, color) => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d'); context.clearRect(0, 0, width, height);
        context.fillStyle = color; context.font = `600 ${fontSize}px "Helvetica Neue", sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, width / 2, height / 2);
        entries.push({ mesh: this.upload(geometry), texture: this.createTexture(canvas) });
      };
      for (const block of OBSTACLES) {
        const geometry = new Geometry(); const width = 0.45; const baseY = block.height / 2;
        geometry.quad([[block.x - width / 2, baseY - 0.19, block.z + block.depth / 2 + 0.015], [block.x + width / 2, baseY - 0.19, block.z + block.depth / 2 + 0.015], [block.x + width / 2, baseY + 0.19, block.z + block.depth / 2 + 0.015], [block.x - width / 2, baseY + 0.19, block.z + block.depth / 2 + 0.015]], [0, 0, 1], [1, 1, 1], 3, [[0, 1], [1, 1], [1, 0], [0, 0]]);
        create(block.label, 128, 96, geometry, 70, '#c5c4a3');
      }
      const floor = new Geometry();
      floor.quad([[-1.7, 0.015, 13.45], [1.7, 0.015, 13.45], [1.7, 0.015, 12.35], [-1.7, 0.015, 12.35]], [0, 1, 0], [1, 1, 1], 3, [[0, 1], [1, 1], [1, 0], [0, 0]]);
      create('A / 01', 640, 160, floor, 140, '#9da18965');
      const back = new Geometry();
      back.quad([[4.4, 4.6, 14.97], [1.6, 4.6, 14.97], [1.6, 5.8, 14.97], [4.4, 5.8, 14.97]], [0, 0, -1], [1, 1, 1], 3, [[0, 1], [1, 1], [1, 0], [0, 0]]);
      create('A—01', 640, 256, back, 200, '#b8baa177');
      return entries;
    }

    resize() {
      const width = this.canvas.clientWidth || innerWidth;
      const height = this.canvas.clientHeight || innerHeight;
      this.pixelRatio = this.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, 1.6);
      this.canvas.width = Math.round(width * this.pixelRatio); this.canvas.height = Math.round(height * this.pixelRatio);
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.aspect = width / height;
    }

    aim(normalX = 0, normalY = 0) {
      const { forward, right, up } = cameraBasis(this.yaw, this.pitch);
      const tangent = Math.tan(this.fov / 2);
      const direction = forward.map((value, index) => value + right[index] * normalX * tangent * this.aspect + up[index] * normalY * tangent);
      if (direction[2] >= -0.0001) return null;
      const distance = (SCREEN.z - this.eye[2]) / direction[2];
      if (distance <= 0) return null;
      const hit = [this.eye[0] + direction[0] * distance, this.eye[1] + direction[1] * distance, SCREEN.z];
      const horizontal = (hit[0] - SCREEN.x) / SCREEN.width;
      const vertical = 1 - (hit[1] - SCREEN.bottom) / SCREEN.height;
      const target = this.display.target(horizontal, vertical);
      return target ? { ...target, hit } : null;
    }

    render(state) {
      const gl = this.gl;
      this.eye = state.eye; this.yaw = state.yaw; this.pitch = state.pitch; this.fov = state.fov;
      gl.useProgram(this.program); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const projection = perspective(this.fov, this.aspect, 0.05, 70);
      const view = viewMatrix(this.eye, this.yaw, this.pitch);
      gl.uniformMatrix4fv(this.uniforms.uProjection, false, projection); gl.uniformMatrix4fv(this.uniforms.uView, false, view);
      gl.uniform3fv(this.uniforms.uEye, this.eye); gl.uniform1f(this.uniforms.uTime, state.time); gl.uniform1i(this.uniforms.uTexture, 0);
      gl.disable(gl.BLEND); gl.depthMask(true);
      this.draw(this.world); this.draw(this.screen, identity(), { texture: this.screenTexture });
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const decal of this.decals) this.draw(decal.mesh, identity(), { texture: decal.texture, decal: true });
      if (state.model) {
        gl.depthMask(false);
        for (const shot of state.model.visibleTo('player').incoming) {
          const progress = clamp((state.time - shot.born) / 0.52, 0, 1);
          const pulse = 0.58 + Math.sin(state.time * 36) * 0.25;
          this.draw(this.ring, transform([shot.x, 0.035, shot.z], [1.36, 1, 1.36]), { opacity: pulse });
          this.draw(this.ring, transform([shot.x, 0.036, shot.z], [(1 - progress) * 2.1 + 0.1, 1, (1 - progress) * 2.1 + 0.1]), { opacity: 0.8 });
          this.draw(this.beam, transform([shot.x, 0, shot.z], [0.5, 1.8, 0.5]), { opacity: 0.3 + progress * 0.5 });
        }
        for (const impact of state.model.impacts.filter(impact => impact.owner === 'enemy')) {
          const age = state.time - impact.born;
          this.draw(this.ring, transform([impact.x, 0.024, impact.z], [0.6 + age * 2.2, 1, 0.6 + age * 2.2]), { opacity: Math.max(0, 0.8 - age * 0.6) });
          if (age < 0.22) this.draw(this.beam, transform([impact.x, 0, impact.z], [4 * (1 - age / 0.22), 2, 4 * (1 - age / 0.22)]), { opacity: (1 - age / 0.22) * 0.8 });
        }
        for (const decoy of state.model.decoys.filter(decoy => decoy.owner === 'player')) {
          this.draw(this.ring, transform([decoy.x, 0.024, decoy.z], [0.22, 1, 0.22]), { opacity: 0.4, tint: [0.4, 1.5, 1.4] });
        }
        gl.depthMask(true);
      }
      if (state.weapon) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(this.uniforms.uView, false, identity());
        gl.uniformMatrix4fv(this.uniforms.uProjection, false, perspective(58 * Math.PI / 180, this.aspect, 0.035, 8));
        gl.uniform3fv(this.uniforms.uEye, [0, 0, 0]);
        const aim = state.zoom || 0;
        const recoil = state.recoil || 0;
        const reload = state.reload || 0;
        const bob = state.bob || 0;
        const hand = transform([0.285 * (1 - aim) + Math.sin(bob) * 0.006, -0.265 + aim * 0.125 - Math.sin(reload * Math.PI) * 0.14 + Math.abs(Math.cos(bob)) * 0.004, -0.64 + recoil * 0.065 + aim * 0.035], [0.76, 0.76, 0.76], [recoil * 0.23 + Math.sin(reload * Math.PI) * 0.24, 0, Math.sin(reload * Math.PI) * -0.42]);
        gl.disable(gl.BLEND);
        this.draw(this.gun, hand);
        const magazineMove = transform([0, -Math.sin(clamp(reload * 1.3, 0, 1) * Math.PI) * 0.38, 0]);
        this.draw(this.magazine, multiply(hand, magazineMove));
        if (recoil > 0.65) {
          gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          this.draw(this.flash, multiply(hand, transform([0, 0.0, -0.5], [1.0, 0.5, 1.4], [0, 0, state.time * 110])), { opacity: (recoil - 0.65) * 2.8 });
        }
      }
      gl.disable(gl.BLEND);
    }
  }

  root.Blindspot.RoomRenderer = RoomRenderer;
  root.Blindspot.cameraBasis = cameraBasis;
  root.Blindspot.SCREEN = SCREEN;
})(window);
