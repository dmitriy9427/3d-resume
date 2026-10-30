import { Box, Plane, useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

// один тайл текстуры кирпича ≈ столько мировых юнитов, чтобы кирпичи были
// одного размера на всех сегментах стены у окна, несмотря на разную ширину/высоту
const BRICK_TILE = 2;

const ROOM_W = 8;
const ROOM_H = 4;
const ROOM_Z = -4;

// проём окна в задней стене
const WIN_HALF_W = 1.6;
const WIN_BOTTOM = 0.9;
const WIN_TOP = 3.4;

const backWallSegments = [
  // верх
  {
    w: ROOM_W,
    h: ROOM_H - WIN_TOP,
    x: 0,
    y: (WIN_TOP + ROOM_H) / 2,
  },
  // низ
  { w: ROOM_W, h: WIN_BOTTOM, x: 0, y: WIN_BOTTOM / 2 },
  // слева
  {
    w: ROOM_W / 2 - WIN_HALF_W,
    h: WIN_TOP - WIN_BOTTOM,
    x: -(WIN_HALF_W + (ROOM_W / 2 - WIN_HALF_W) / 2),
    y: (WIN_TOP + WIN_BOTTOM) / 2,
  },
  // справа
  {
    w: ROOM_W / 2 - WIN_HALF_W,
    h: WIN_TOP - WIN_BOTTOM,
    x: WIN_HALF_W + (ROOM_W / 2 - WIN_HALF_W) / 2,
    y: (WIN_TOP + WIN_BOTTOM) / 2,
  },
];

// Текстуры генерируются процедурно на canvas: загруженные через TextureLoader
// файлы (JPEG/PNG, в т.ч. с Poly Haven) в этом WebGL-окружении надёжно ловят
// "texSubImage2D: bad image data" / рендерятся с искажениями даже без ICC-профиля,
// а CanvasTexture — нет. Так что рисуем материалы сами.
function usePlankFloorTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const plankH = 64;
    for (let y = 0; y < canvas.height; y += plankH) {
      const rowOffset = ((y / plankH) % 2) * 90;
      for (let x = -90; x < canvas.width; x += 180) {
        const hue = 24 + Math.random() * 10;
        const light = 32 + Math.random() * 10;
        ctx.fillStyle = `hsl(${hue}, 38%, ${light}%)`;
        ctx.fillRect(x + rowOffset, y, 178, plankH - 2);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y + plankH - 1);
      ctx.lineTo(canvas.width, y + plankH - 1);
      ctx.stroke();
    }

    // волокна древесины
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const len = 20 + Math.random() * 40;
      ctx.strokeStyle = Math.random() > 0.5 ? "#000000" : "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }, []);
}

function usePlasterWallTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#232a4d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    return tex;
  }, []);
}

export default function IntroScene() {
  const floorMap = usePlankFloorTexture();
  const wallMap = usePlasterWallTexture();

  const windowWallMap = useTexture("/textures/right.jpg");
  useEffect(() => {
    windowWallMap.colorSpace = THREE.SRGBColorSpace;
    windowWallMap.wrapS = windowWallMap.wrapT = THREE.RepeatWrapping;
  }, [windowWallMap]);

  // у каждого сегмента стены своя ширина/высота — клонируем текстуру и задаём
  // repeat под конкретный размер, чтобы кирпич был одного масштаба везде
  const windowWallSegmentMaps = useMemo(
    () =>
      backWallSegments.map((seg) => {
        const tex = windowWallMap.clone();
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(seg.w / BRICK_TILE, seg.h / BRICK_TILE);
        return tex;
      }),
    [windowWallMap],
  );

  return (
    <>
      {/* пол */}
      <Plane
        args={[ROOM_W, ROOM_W]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      >
        <meshStandardMaterial map={floorMap} metalness={0} roughness={0.8} />
      </Plane>

      {/* потолок */}
      <Plane
        args={[ROOM_W, ROOM_W]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ROOM_H, 0]}
      >
        <meshStandardMaterial map={wallMap} side={THREE.DoubleSide} />
      </Plane>

      {/* боковые стены */}
      <Plane
        args={[ROOM_W, ROOM_H]}
        rotation={[0, Math.PI / 2, 0]}
        position={[-ROOM_W / 2, ROOM_H / 2, 0]}
      >
        <meshStandardMaterial map={wallMap} side={THREE.DoubleSide} />
      </Plane>
      <Plane
        args={[ROOM_W, ROOM_H]}
        rotation={[0, -Math.PI / 2, 0]}
        position={[ROOM_W / 2, ROOM_H / 2, 0]}
      >
        <meshStandardMaterial map={wallMap} side={THREE.DoubleSide} />
      </Plane>

      {/* задняя стена с проёмом под окно */}
      {backWallSegments.map((seg, i) => (
        <Plane key={i} args={[seg.w, seg.h]} position={[seg.x, seg.y, ROOM_Z]}>
          <meshStandardMaterial
            map={windowWallSegmentMaps[i]}
            color="#4c5ba3"
            metalness={0}
            roughness={0.9}
            side={THREE.DoubleSide}
          />
        </Plane>
      ))}

      {/* стол */}
      <Box args={[2, 0.1, 1]} position={[0, 0.75, -1.5]}>
        <meshStandardMaterial color="#2b3050" roughness={0.5} metalness={0} />
      </Box>
      {/* ножки */}
      {[-0.9, 0.9].map((x) =>
        [-0.45, 0.45].map((z, i) => (
          <Box
            key={x + "-" + z + i}
            args={[0.05, 0.75, 0.05]}
            position={[x, 0.375, -1.5 + z]}
          >
            <meshStandardMaterial color="#232748" metalness={0} />
          </Box>
        )),
      )}

      {/* ноутбук – экран с эмиссией */}
      <Box args={[0.9, 0.5, 0.03]} position={[0, 1.05, -1.3]}>
        <meshStandardMaterial
          emissive="#4d9dff"
          emissiveIntensity={2}
          color="#0a0e20"
        />
      </Box>

      {/* клавиатура */}
      <Plane
        args={[0.8, 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.76, -1.5]}
      >
        <meshStandardMaterial color="#262b4a" metalness={0} />
      </Plane>

      {/* освещение: three r183+ по умолчанию использует физически корректные
          единицы, поэтому старые "киношные" intensity вроде 2-4 почти не видны —
          нужны значения на порядок выше */}
      <ambientLight intensity={0.6} />
      <pointLight
        position={[0, 2, -1.5]}
        color="#6f93ff"
        intensity={16}
        distance={14}
        decay={1.4}
      />
      {/* подсветка от окна, имитирует свет звёзд/города */}
      <pointLight
        position={[0, 2.2, -3.3]}
        color="#8fb4ff"
        intensity={30}
        distance={14}
        decay={1.4}
      />

    </>
  );
}
