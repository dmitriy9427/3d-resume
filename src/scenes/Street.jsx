import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STOPS } from "../data/resume";
import {
  CROSS_Z,
  EDGE,
  HERO_LEN,
  PROMENADE_END,
  ROAD_HALF,
  SAND_END,
  STREET_END,
  stopZ,
} from "../utils/cameraPath";
import { MOON_DIR } from "./Sky";
import Props from "./Props";

export const FOG_COLOR = "#141a3a";
export const FOG_DENSITY = 0.0105;

// Детерминированный генератор — город одинаковый при каждой загрузке.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Здания ─────────────────────────────────────────────────────────────────
const buildingMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uFog: { value: new THREE.Color(FOG_COLOR) },
    uFogDensity: { value: FOG_DENSITY },
    uMoonDir: { value: MOON_DIR.clone() },
    uWall: { value: new THREE.Color("#2b3358") },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vSeed;
    varying float vDepth;
    void main() {
      mat4 m = modelMatrix;
      vSeed = 0.5;
      #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
        vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
      #endif
      vec4 wp = m * vec4(position, 1.0);
      vWorld = wp.xyz;
      vNormal = normalize(mat3(m) * normal);
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vSeed;
    varying float vDepth;
    uniform vec3 uFog;
    uniform float uFogDensity;
    uniform vec3 uMoonDir;
    uniform vec3 uWall;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec3 n = normalize(vNormal);
      bool wall = abs(n.y) < 0.5;
      vec2 uv = abs(n.x) > 0.5 ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);

      vec3 base = uWall * (0.7 + 0.6 * vSeed);
      float moonLight = max(dot(n, uMoonDir), 0.0);
      vec3 col = base * (0.3 + 0.9 * moonLight + 0.25 * max(n.y, 0.0));
      col *= 0.75 + 0.25 * smoothstep(0.0, 30.0, vWorld.y);

      if (wall) {
        vec2 cell = vec2(2.4, 3.1);
        vec2 id = floor(uv / cell);
        vec2 f = fract(uv / cell);
        float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.22, f.y) * step(f.y, 0.78);
        win *= step(1.0, id.y); // первый этаж без окон
        float r = hash(id + vSeed * 57.0);
        float lit = step(0.64, r);
        vec3 warm = mix(vec3(1.0, 0.74, 0.38), vec3(0.62, 0.8, 1.0), step(0.86, hash(id + 3.1)));
        vec3 glass = vec3(0.012, 0.02, 0.05) + 0.03 * moonLight;
        col = mix(col, glass, win);
        col += warm * lit * win * (0.85 + 0.5 * hash(id + 9.7));
        // тёплая витрина на первом этаже
        float shop = step(0.3, f.x) * step(f.x, 0.7) * step(0.2, f.y) * step(f.y, 0.65) * step(id.y, 0.5) * step(0.0, id.y);
        col += vec3(1.0, 0.7, 0.4) * shop * step(0.6, hash(id + 21.0)) * 0.6;
      }

      float fogAmount = 1.0 - exp(-pow(uFogDensity * vDepth, 2.0));
      col = mix(col, uFog, clamp(fogAmount, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `,
});

function buildBuildings() {
  const rand = rng(7);
  const items = []; // {x, z, w, h, d}
  const heroZones = STOPS.map((s, i) =>
    s.side ? { side: s.side === "left" ? -1 : 1, z: stopZ(i) } : null,
  ).filter(Boolean);

  for (const side of [-1, 1]) {
    // первый ряд — по линии фасадов
    let z = CROSS_Z - 7;
    while (z > STREET_END + 26) {
      const len = 7 + rand() * 7;
      const w = 9 + rand() * 8;
      const h = 9 + rand() * 26;
      const cz = z - len / 2;
      const hero = heroZones.some(
        (hz) => hz.side === side && Math.abs(hz.z - cz) < HERO_LEN / 2 + len / 2 + 0.5,
      );
      if (!hero) items.push({ x: side * (EDGE + w / 2), z: cz, w, h, d: len });
      z -= len + rand() * 1.6;
    }
    // второй ряд — выше, за первым
    z = CROSS_Z - 7;
    while (z > STREET_END + 16) {
      const len = 10 + rand() * 8;
      const w = 12 + rand() * 10;
      items.push({
        x: side * (EDGE + 20 + w / 2),
        z: z - len / 2,
        w,
        h: 26 + rand() * 40,
        d: len,
      });
      z -= len + rand() * 2;
    }
    // дальний силуэт
    z = CROSS_Z - 7;
    while (z > STREET_END + 8) {
      const len = 14 + rand() * 10;
      const w = 20 + rand() * 14;
      items.push({
        x: side * (EDGE + 48 + w / 2 + rand() * 20),
        z: z - len / 2,
        w,
        h: 40 + rand() * 60,
        d: len,
      });
      z -= len + rand() * 4;
    }
  }
  // герои — здания с вывесками
  STOPS.forEach((s, i) => {
    if (!s.side) return;
    const side = s.side === "left" ? -1 : 1;
    const w = 13;
    items.push({
      x: side * (EDGE + w / 2),
      z: stopZ(i),
      w,
      h: 24 + (i % 3) * 5,
      d: HERO_LEN,
    });
  });
  // дом, в котором комната: длинный низкий корпус на торце улицы, за перекрёстком.
  // Комната стоит на его крыше (ROOM_FLOOR = высота корпуса).
  items.push({ x: 0, z: 6, w: 160, h: 7, d: 20 });
  return items;
}

function Buildings() {
  const { items } = useMemo(() => ({ items: buildBuildings() }), []);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      buildingMaterial,
      items.length,
    );
    const o = new THREE.Object3D();
    items.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }, [items]);
  return <primitive object={mesh} />;
}

// ─── Дорога ─────────────────────────────────────────────────────────────────
function useRoadTexture() {
  return useMemo(() => {
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const px = S / 40; // 40 м на тайл
    g.fillStyle = "#15171f"; // земля
    g.fillRect(0, 0, S, S);
    // асфальт
    g.fillStyle = "#23262f";
    g.fillRect(S / 2 - ROAD_HALF * px, 0, ROAD_HALF * 2 * px, S);
    // тротуары
    g.fillStyle = "#3a3e4d";
    g.fillRect(S / 2 - EDGE * px, 0, (EDGE - ROAD_HALF) * px, S);
    g.fillRect(S / 2 + ROAD_HALF * px, 0, (EDGE - ROAD_HALF) * px, S);
    // плитка тротуара
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 1;
    for (let y = 0; y < S; y += px * 1.5) {
      g.beginPath();
      g.moveTo(S / 2 - EDGE * px, y);
      g.lineTo(S / 2 - ROAD_HALF * px, y);
      g.moveTo(S / 2 + ROAD_HALF * px, y);
      g.lineTo(S / 2 + EDGE * px, y);
      g.stroke();
    }
    // бордюр
    g.fillStyle = "#5a5f72";
    g.fillRect(S / 2 - ROAD_HALF * px - 2, 0, 3, S);
    g.fillRect(S / 2 + ROAD_HALF * px - 1, 0, 3, S);
    // разметка: пунктир по центру (период 8 м, 5 периодов на тайл), сплошные у краёв
    g.fillStyle = "#d9d2b0";
    for (let i = 0; i < 5; i++) g.fillRect(S / 2 - 1.5, i * (S / 5), 3, (S / 5) * 0.5);
    g.fillStyle = "rgba(217,210,176,0.7)";
    g.fillRect(S / 2 - (ROAD_HALF - 0.4) * px, 0, 2, S);
    g.fillRect(S / 2 + (ROAD_HALF - 0.4) * px, 0, 2, S);
    // шум асфальта
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.08)";
      g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }, []);
}

function useCrossTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#23262f";
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = "#d9d2b0";
    for (let i = 0; i < 5; i++) g.fillRect(i * 102.4, 63, 51, 3);
    g.fillStyle = "rgba(217,210,176,0.7)";
    g.fillRect(0, 5, 512, 2);
    g.fillRect(0, 121, 512, 2);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.08)";
      g.fillRect(Math.random() * 512, Math.random() * 128, 1.5, 1.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(8, 1);
    t.anisotropy = 8;
    return t;
  }, []);
}

function Road() {
  const map = useRoadTexture();
  const cross = useCrossTexture();
  const length = 10 - STREET_END;
  useEffect(() => {
    map.repeat.set(1, length / 40);
  }, [map, length]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (10 + STREET_END) / 2]}>
        <planeGeometry args={[40, length]} />
        <meshStandardMaterial map={map} roughness={0.55} metalness={0.1} />
      </mesh>
      {/* поперечная улица у дома */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, CROSS_Z]}>
        <planeGeometry args={[160, ROAD_HALF * 2]} />
        <meshStandardMaterial map={cross} roughness={0.55} metalness={0.1} />
      </mesh>
    </>
  );
}

// ─── Набережная, пляж, пирс и море ──────────────────────────────────────────
const seaMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uMoonDir: { value: MOON_DIR.clone() },
    uFog: { value: new THREE.Color(FOG_COLOR) },
    uFogDensity: { value: FOG_DENSITY * 0.7 },
    uShore: { value: SAND_END },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vWorld;
    uniform float uTime;
    uniform vec3 uMoonDir;
    uniform vec3 uFog;
    uniform float uFogDensity;
    uniform float uShore;
    void main() {
      vec3 V = normalize(vWorld - cameraPosition);
      vec2 p = vWorld.xz * 0.45;
      float t = uTime * 0.7;
      vec3 n = normalize(vec3(
        0.06 * sin(p.x * 1.7 + t) + 0.045 * sin(p.y * 2.3 - t * 1.3) + 0.03 * sin(p.x * 4.1 + p.y * 3.3 + t * 1.7),
        1.0,
        0.06 * cos(p.y * 1.4 + t * 0.9) + 0.04 * sin(p.x * 2.9 + t * 1.1) + 0.03 * cos(p.x * 3.7 - p.y * 4.3 - t * 1.5)));
      vec3 R = reflect(V, n);
      float moon = max(dot(R, uMoonDir), 0.0);
      float glint = pow(moon, 260.0) * 3.0 + pow(moon, 40.0) * 0.28;
      float fres = pow(1.0 - max(dot(-V, n), 0.0), 3.0);
      vec3 deep = vec3(0.012, 0.025, 0.07);
      vec3 sky = vec3(0.09, 0.11, 0.26);
      vec3 col = mix(deep, sky, clamp(fres * 1.3, 0.0, 1.0));
      col += vec3(1.0, 0.96, 0.82) * glint;
      // пена у берега
      float d = uShore - vWorld.z;
      float foam = (1.0 - smoothstep(0.0, 2.6, d)) * (0.55 + 0.45 * sin(vWorld.x * 0.5 + t * 1.4 + d * 2.0));
      col += vec3(0.55, 0.62, 0.8) * foam * 0.6 * step(0.0, d);
      float dist = length(vWorld - cameraPosition);
      float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
      col = mix(col, uFog, clamp(f, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `,
});

function speckle(base, a, b, count, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    g.fillStyle = Math.random() > 0.5 ? a : b;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Seaside() {
  const sand = useMemo(() => {
    const t = speckle("#6b6679", "rgba(255,255,255,0.08)", "rgba(0,0,0,0.12)", 14000);
    t.repeat.set(16, 3);
    return t;
  }, []);
  const stone = useMemo(() => {
    const t = speckle("#3e4256", "rgba(255,255,255,0.05)", "rgba(0,0,0,0.1)", 6000);
    t.repeat.set(10, 2);
    return t;
  }, []);
  useFrame(({ clock }) => {
    seaMaterial.uniforms.uTime.value = clock.elapsedTime;
  });
  const promLen = STREET_END - PROMENADE_END;
  const sandLen = PROMENADE_END - SAND_END;
  const pierEnd = SAND_END - 70;
  const posts = [];
  for (let z = SAND_END - 2; z > pierEnd; z -= 6) posts.push(z);
  return (
    <>
      {/* набережная */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, STREET_END - promLen / 2]}>
        <planeGeometry args={[160, promLen]} />
        <meshStandardMaterial map={stone} roughness={0.8} />
      </mesh>
      {/* пляж */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, PROMENADE_END - sandLen / 2]}>
        <planeGeometry args={[160, sandLen]} />
        <meshStandardMaterial map={sand} roughness={1} />
      </mesh>
      {/* море */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, SAND_END - 450]} material={seaMaterial}>
        <planeGeometry args={[1400, 900]} />
      </mesh>
      {/* пирс */}
      <mesh position={[0, 0.1, (SAND_END + pierEnd) / 2]}>
        <boxGeometry args={[3.4, 0.22, SAND_END - pierEnd + 4]} />
        <meshStandardMaterial color="#4a3a30" roughness={0.9} />
      </mesh>
      {posts.map((z) => (
        <group key={z}>
          {[-1.6, 1.6].map((x) => (
            <mesh key={x} position={[x, -0.2, z]}>
              <cylinderGeometry args={[0.14, 0.14, 1.6, 6]} />
              <meshStandardMaterial color="#2c2320" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

// ─── Фонари ─────────────────────────────────────────────────────────────────
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,226,170,1)");
  grad.addColorStop(0.25, "rgba(255,190,110,0.45)");
  grad.addColorStop(1, "rgba(255,170,80,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Lamps() {
  const lamps = useMemo(() => {
    const out = [];
    for (let z = -22, i = 0; z > PROMENADE_END + 2; z -= 16, i++) {
      out.push({ x: (i % 2 ? 1 : -1) * (ROAD_HALF + 0.5), z });
    }
    return out;
  }, []);
  const glow = useMemo(glowTexture, []);
  const posts = useMemo(() => {
    const m = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.09, 5.6, 6),
      new THREE.MeshBasicMaterial({ color: "#0c0f1c" }),
      lamps.length,
    );
    const o = new THREE.Object3D();
    lamps.forEach((l, i) => {
      o.position.set(l.x, 2.8, l.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.frustumCulled = false;
    return m;
  }, [lamps]);
  const headPositions = useMemo(
    () => new Float32Array(lamps.flatMap((l) => [l.x * 0.92, 5.6, l.z])),
    [lamps],
  );
  const poolMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glow,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.55,
        fog: true,
      }),
      lamps.length,
    );
    const o = new THREE.Object3D();
    lamps.forEach((l, i) => {
      o.position.set(l.x * 0.7, 0.03, l.z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(11, 11, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.frustumCulled = false;
    return m;
  }, [lamps, glow]);

  return (
    <>
      <primitive object={posts} />
      <primitive object={poolMesh} />
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[headPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={glow}
          size={4.5}
          sizeAttenuation
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </>
  );
}

// ─── Вывески на героях ──────────────────────────────────────────────────────
function wrap(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Вывеска: скриншот проекта (если есть) с подписью поверх. Рисуется на canvas
// 768×384 в «дизайн-координатах» 1024×512; скриншот подгружается позже.
function drawSign(g, stop, img) {
  g.setTransform(0.75, 0, 0, 0.75, 0, 0);
  g.fillStyle = "#070b1c";
  g.fillRect(0, 0, 1024, 512);
  if (img) {
    const k = Math.max(1024 / img.width, 512 / img.height);
    const w = img.width * k;
    const h = img.height * k;
    g.drawImage(img, (1024 - w) / 2, 0, w, h);
    const grad = g.createLinearGradient(0, 230, 0, 512);
    grad.addColorStop(0, "rgba(7,11,28,0)");
    grad.addColorStop(0.55, "rgba(7,11,28,0.88)");
    grad.addColorStop(1, "rgba(7,11,28,0.96)");
    g.fillStyle = grad;
    g.fillRect(0, 230, 1024, 282);
  }
  g.strokeStyle = stop.accent;
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 484);
  g.fillStyle = stop.accent;
  g.font = "600 34px ui-monospace, Menlo, monospace";
  g.fillText(stop.kicker.toUpperCase(), 56, img ? 366 : 96);
  g.fillStyle = "#f2f6ff";
  let size = img ? 64 : 104;
  g.font = `700 ${size}px system-ui, sans-serif`;
  let lines = wrap(g, stop.title, 900);
  while (lines.length > (img ? 1 : 2) && size > 44) {
    size -= 6;
    g.font = `700 ${size}px system-ui, sans-serif`;
    lines = wrap(g, stop.title, 900);
  }
  const y0 = img ? 440 : 220;
  lines.slice(0, img ? 1 : 2).forEach((l, i) => g.fillText(l, 56, y0 + i * (size + 8)));
  if (!img && stop.stack) {
    g.fillStyle = "rgba(200,215,255,0.7)";
    g.font = "500 36px system-ui, sans-serif";
    g.fillText(stop.stack, 56, 460);
  }
}

function signTexture(stop) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 384;
  const g = c.getContext("2d");
  drawSign(g, stop, null);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (stop.image) {
    const img = new Image();
    img.onload = () => {
      drawSign(g, stop, img);
      t.needsUpdate = true;
    };
    img.src = stop.image;
  }
  return t;
}

function Signs() {
  const signs = useMemo(
    () =>
      STOPS.map((s, i) => ({ s, i }))
        .filter(({ s }) => s.side)
        .map(({ s, i }) => ({
          side: s.side === "left" ? -1 : 1,
          z: stopZ(i),
          map: signTexture(s),
          accent: s.accent,
        })),
    [],
  );
  return signs.map((sg) => (
    <group
      key={sg.z}
      position={[sg.side * (EDGE - 0.08), 4.6, sg.z]}
      rotation={[0, sg.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
    >
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[8, 4.3]} />
        <meshBasicMaterial
          color={sg.accent}
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <planeGeometry args={[7.4, 3.7]} />
        <meshBasicMaterial map={sg.map} toneMapped={false} />
      </mesh>
    </group>
  ));
}

export default function Street() {
  return (
    <>
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
      <hemisphereLight args={["#3a4a8a", "#0a0a14", 0.55]} />
      <directionalLight
        position={MOON_DIR.clone().multiplyScalar(60).toArray()}
        color="#9db4ff"
        intensity={1.3}
      />
      <Road />
      <Seaside />
      <Buildings />
      <Lamps />
      <Props />
      <Signs />
    </>
  );
}
