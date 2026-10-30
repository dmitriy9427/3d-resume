import { useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Камера в этой сцене никогда не поворачивается (см. TransitionScene) и
// всегда смотрит вдоль -Z, поэтому плоские спрайты (облака), развёрнутые
// к +Z, всегда видны точно анфас — билборд не нужен.

const MOON_POS = [70, 55, -280];

// далёкий фото-задник города — некрупный «скайлайн» в нижней части кадра,
// а не растянутый на весь экран фон. Сверху и по краям остаётся чёрное небо
// со звёздами (Starfield.jsx рендерится отдельно и всегда виден)
const BACKDROP_Z = -500;

// реальный файл 2400×1600; город занимает только нижнюю часть кадра, верх —
// туманное небо, поэтому берём только нижнюю долю по высоте через repeat/offset
const SOURCE_ASPECT = 2400 / 1600;
const CROP_FRACTION = 0.32;
const CONTENT_ASPECT = SOURCE_ASPECT / CROP_FRACTION;

// плоскость подогнана под пропорции именно обрезанного куска — без растяжения
const BACKDROP_H = 220;
const BACKDROP_W = BACKDROP_H * CONTENT_ASPECT;
const BACKDROP_Y = -50;

function CityBackdrop() {
  const map = useTexture("/textures/city_sky.jpg");
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.repeat.set(1, CROP_FRACTION);
    map.offset.set(0, 0);
  }, [map]);

  return (
    <mesh position={[0, BACKDROP_Y, BACKDROP_Z]}>
      <planeGeometry args={[BACKDROP_W, BACKDROP_H]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

function Moon() {
  return (
    <group position={MOON_POS}>
      <mesh>
        <sphereGeometry args={[16, 32, 32]} />
        <meshBasicMaterial color="#fdf6e3" toneMapped={false} />
      </mesh>
      {/* мягкое многослойное свечение */}
      <mesh>
        <sphereGeometry args={[22, 24, 24]} />
        <meshBasicMaterial
          color="#fdf6e3"
          transparent
          opacity={0.18}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[30, 24, 24]} />
        <meshBasicMaterial
          color="#fdf6e3"
          transparent
          opacity={0.08}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function useCloudTexture() {
  const tex = useTexture("/textures/clouds_big_soft-color.png");
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
  }, [tex]);
  return tex;
}

function useCloudInstances({
  count,
  yMin,
  yMax,
  sizeMin,
  sizeMax,
  opacityMin,
  opacityMax,
}) {
  return useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 500,
        y: yMin + Math.random() * (yMax - yMin),
        z: -140 - Math.random() * 220,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        rotation: (Math.random() - 0.5) * 0.6,
        flip: Math.random() > 0.5 ? 1 : -1,
        speed: 0.4 + Math.random() * 0.5,
        opacity: opacityMin + Math.random() * (opacityMax - opacityMin),
      })),
    [count, yMin, yMax, sizeMin, sizeMax, opacityMin, opacityMax],
  );
}

function CloudLayer({
  count,
  yMin,
  yMax,
  sizeMin,
  sizeMax,
  opacityMin,
  opacityMax,
  color,
}) {
  const map = useCloudTexture();
  const clouds = useCloudInstances({
    count,
    yMin,
    yMax,
    sizeMin,
    sizeMax,
    opacityMin,
    opacityMax,
  });
  const refs = useRef([]);

  useFrame((_, delta) => {
    clouds.forEach((cloud, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.position.x += cloud.speed * delta;
      if (m.position.x > 300) m.position.x = -300;
    });
  });

  return (
    <>
      {clouds.map((cloud, i) => (
        <mesh
          key={i}
          ref={(el) => (refs.current[i] = el)}
          position={[cloud.x, cloud.y, cloud.z]}
          rotation={[0, 0, cloud.rotation]}
          scale={[cloud.size * cloud.flip, cloud.size * 0.7, 1]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={map}
            color={color}
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

export default function CityScene() {
  return (
    <>
      <CityBackdrop />
      <Moon />
      {/* облака парят перед городом */}
      <CloudLayer
        count={6}
        yMin={10}
        yMax={40}
        sizeMin={12}
        sizeMax={22}
        opacityMin={0.22}
        opacityMax={0.4}
        color="#e4e9f5"
      />
    </>
  );
}
