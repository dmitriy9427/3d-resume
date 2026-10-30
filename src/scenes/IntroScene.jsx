import { Plane, useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { ROOM_FLOOR } from "../utils/cameraPath";
import { asset } from "../utils/url";
import * as THREE from "three";

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

// ─── Обои на экранах (рисуются на canvas) ──────────────────────────────────
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // UV из glTF уже перевёрнуты
  t.anisotropy = 4;
  return t;
}

// Ноутбук: синие обои с лучами и окно редактора кода.
const drawLaptop = (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#041a66");
  bg.addColorStop(0.55, "#0a46c8");
  bg.addColorStop(1, "#1d7cff");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const beam = g.createLinearGradient(w * 0.9, h * 0.35, w * 0.1, h * (0.1 + i * 0.22));
    beam.addColorStop(0, "rgba(120,190,255,0.45)");
    beam.addColorStop(1, "rgba(120,190,255,0)");
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(w * 0.9, h * 0.35);
    g.lineTo(0, h * (0.05 + i * 0.22));
    g.lineTo(0, h * (0.12 + i * 0.22));
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  // окно редактора
  g.fillStyle = "rgba(10,18,44,0.82)";
  g.fillRect(w * 0.16, h * 0.18, w * 0.58, h * 0.6);
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.fillRect(w * 0.16, h * 0.18, w * 0.58, h * 0.07);
  ["#ff5f56", "#ffbd2e", "#27c93f"].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(w * 0.19 + i * 22, h * 0.215, 7, 0, 7);
    g.fill();
  });
  const cols = ["#7fd1ff", "#ffb86b", "#b79cff", "#8be39a", "#ff7ab6"];
  for (let r = 0; r < 9; r++) {
    let x = w * 0.19 + (r % 3) * 26;
    const y = h * 0.31 + r * h * 0.048;
    for (let k = 0; k < 3 + (r % 3); k++) {
      const len = 40 + ((r * 37 + k * 53) % 90);
      g.fillStyle = cols[(r + k) % cols.length];
      g.fillRect(x, y, len, 8);
      x += len + 12;
    }
  }
};

// Телевизор: горы над озером и отражение.
const drawTV = (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, "#6ab8c8");
  sky.addColorStop(1, "#f1d2b4");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h * 0.55);
  g.fillStyle = "#c88b75";
  g.beginPath();
  g.moveTo(0, h * 0.55);
  g.lineTo(w * 0.12, h * 0.42);
  g.lineTo(w * 0.3, h * 0.3);
  g.lineTo(w * 0.42, h * 0.46);
  g.lineTo(w * 0.55, h * 0.55);
  g.fill();
  g.fillStyle = "#8a5d6a";
  g.beginPath();
  g.moveTo(w * 0.3, h * 0.55);
  g.lineTo(w * 0.62, h * 0.38);
  g.lineTo(w * 0.78, h * 0.46);
  g.lineTo(w, h * 0.55);
  g.fill();
  const lake = g.createLinearGradient(0, h * 0.55, 0, h);
  lake.addColorStop(0, "#caa08e");
  lake.addColorStop(1, "#8fb7c4");
  g.fillStyle = lake;
  g.fillRect(0, h * 0.55, w, h * 0.45);
  g.save();
  g.globalAlpha = 0.55;
  g.translate(0, h * 1.1);
  g.scale(1, -1);
  g.drawImage(g.canvas, 0, 0, w, h * 0.55, 0, h * 0.55, w, h * 0.55);
  g.restore();
};

// Монитор ПК: цветной «акварельный» градиент.
const drawPC = (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#1c8f4a");
  bg.addColorStop(0.5, "#e69a1d");
  bg.addColorStop(1, "#d6322a");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.25;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? "#fff" : "#000";
    g.beginPath();
    g.ellipse(w * (0.1 + i * 0.12), h * (0.3 + (i % 3) * 0.2), w * 0.2, h * 0.08, 0.6, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
};

const SCREENS = {
  laptop_screen: [1024, 640, drawLaptop],
  tv_screen: [1280, 720, drawTV],
  pc_screen: [1024, 640, drawPC],
};

// Мебель комнаты — из blender/make_assets.py (public/models/room.glb).
function RoomProps() {
  const { scene } = useGLTF(asset("/models/room.glb"));
  useMemo(() => {
    scene.traverse((o) => {
      const spec = o.isMesh && (SCREENS[o.name] || SCREENS[o.parent?.name]);
      if (!spec) return;
      o.material = new THREE.MeshBasicMaterial({
        map: canvasTexture(...spec),
        toneMapped: false,
      });
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(asset("/models/room.glb"));

export default function IntroScene() {
  const floorMap = usePlankFloorTexture();
  const wallMap = usePlasterWallTexture();

  return (
    <group position={[0, ROOM_FLOOR + 0.03, 0]}>
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
            map={wallMap}
            color="#9a93b8"
            metalness={0}
            roughness={0.9}
            side={THREE.DoubleSide}
          />
        </Plane>
      ))}

      <RoomProps />

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
      {/* свечение экранов и RGB-блока */}
      <pointLight position={[0, 1.0, -1.1]} color="#4fe8ff" intensity={1.6} distance={2.2} decay={1.4} />
      <pointLight position={[3.3, 1.6, -1.4]} color="#9fd8ff" intensity={4} distance={5} decay={1.5} />
      <pointLight position={[3.0, 1.0, 1.6]} color="#c060ff" intensity={2.5} distance={3.2} decay={1.5} />
      {/* люстра */}
      <pointLight position={[0, 3.3, -1.5]} color="#ffd9a0" intensity={14} distance={10} decay={1.5} />
      {/* тёплая лампа на столе */}
      <pointLight position={[0.8, 1.5, -1.6]} color="#ffb866" intensity={9} distance={9} decay={1.6} />
      {/* подсветка от окна, имитирует свет звёзд/города */}
      <pointLight
        position={[0, 2.2, -3.3]}
        color="#8fb4ff"
        intensity={30}
        distance={14}
        decay={1.4}
      />

    </group>
  );
}
