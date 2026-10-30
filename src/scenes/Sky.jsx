import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Направление на луну (она впереди над улицей) и её расстояние.
export const MOON_DIR = new THREE.Vector3(-0.18, 0.55, -1).normalize();
const MOON_DIST = 360;

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {},
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, 0.0, 1.0);
      vec3 horizon = vec3(0.115, 0.125, 0.26);
      vec3 mid = vec3(0.03, 0.05, 0.13);
      vec3 top = vec3(0.004, 0.008, 0.03);
      vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
      col = mix(col, top, smoothstep(0.2, 0.9, h));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `,
});

function radialTexture(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function moonTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#f3eedc";
  g.fillRect(0, 0, 512, 512);
  // «моря» и кратеры мягкими пятнами
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 8 + Math.random() * 46;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + Math.random() * 0.13;
    grad.addColorStop(0, `rgba(120,125,140,${a})`);
    grad.addColorStop(1, "rgba(120,125,140,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const starMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  fog: false,
  uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
  vertexShader: /* glsl */ `
    attribute float aRandom;
    uniform float uTime;
    uniform float uPx;
    varying float vTwinkle;
    void main() {
      vTwinkle = 0.6 + 0.4 * sin(uTime * (0.6 + aRandom * 1.8) + aRandom * 6.2831);
      gl_PointSize = (1.2 + aRandom * 2.4) * uPx;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vTwinkle;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float a = smoothstep(0.5, 0.0, d) * vTwinkle;
      vec3 col = vec3(0.82, 0.88, 1.0);
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }
  `,
});

// Небо едет вместе с камерой — звёзды и луна «в бесконечности».
export default function Sky({ stars = 1800 }) {
  const group = useRef();
  const moonTex = useMemo(moonTexture, []);
  const haloTex = useMemo(
    () =>
      radialTexture([
        [0, "rgba(253,246,227,0.55)"],
        [0.25, "rgba(200,215,255,0.18)"],
        [1, "rgba(150,180,255,0)"],
      ]),
    [],
  );

  const [positions, randoms] = useMemo(() => {
    const pos = new Float32Array(stars * 3);
    const rnd = new Float32Array(stars);
    for (let i = 0; i < stars; i++) {
      // равномерно по верхней полусфере
      const y = Math.random() * 0.98 + 0.02;
      const phi = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(phi) * r * 400, y * 400, Math.sin(phi) * r * 400], i * 3);
      rnd[i] = Math.random();
    }
    return [pos, rnd];
  }, [stars]);

  useFrame(({ camera, clock, gl }) => {
    group.current.position.copy(camera.position);
    starMaterial.uniforms.uTime.value = clock.elapsedTime;
    starMaterial.uniforms.uPx.value = Math.min(gl.getPixelRatio(), 2);
  });

  const moonPos = MOON_DIR.clone().multiplyScalar(MOON_DIST).toArray();

  return (
    <group ref={group}>
      <mesh material={skyMaterial} renderOrder={-3} frustumCulled={false}>
        <sphereGeometry args={[450, 24, 16]} />
      </mesh>
      <points material={starMaterial} renderOrder={-2} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
        </bufferGeometry>
      </points>
      <group position={moonPos}>
        <mesh renderOrder={-1}>
          <sphereGeometry args={[18, 32, 32]} />
          <meshBasicMaterial map={moonTex} fog={false} toneMapped={false} />
        </mesh>
        <sprite scale={[160, 160, 1]} renderOrder={-1}>
          <spriteMaterial
            map={haloTex}
            fog={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      </group>
    </group>
  );
}
