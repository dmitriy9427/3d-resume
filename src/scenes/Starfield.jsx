import { useMemo, useRef } from "react";
import { useFrame, extend } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

const TwinkleStarMaterial = shaderMaterial(
  { uTime: 0, uSize: 3, uColor: new THREE.Color("#cfe0f7") },
  /* vertex */ `
    attribute float aRandom;
    uniform float uTime;
    uniform float uSize;
    varying float vTwinkle;

    void main() {
      float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aRandom * 1.8) + aRandom * 6.2831853);
      vTwinkle = twinkle;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = uSize * (0.6 + aRandom * 0.8) * twinkle * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  /* fragment */ `
    uniform vec3 uColor;
    varying float vTwinkle;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float alpha = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(uColor, alpha * vTwinkle);
    }
  `,
);

extend({ TwinkleStarMaterial });

export default function Starfield({ count = 2000 }) {
  const materialRef = useRef();

  const [positions, randoms] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 1] = Math.random() * 120 + 5;
      pos[i * 3 + 2] = -Math.random() * 300 - 10;
      rnd[i] = Math.random();
    }
    return [pos, rnd];
  }, [count]);

  useFrame((state) => {
    if (materialRef.current) materialRef.current.uTime = state.clock.elapsedTime;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aRandom"
          count={randoms.length}
          array={randoms}
          itemSize={1}
        />
      </bufferGeometry>
      <twinkleStarMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
