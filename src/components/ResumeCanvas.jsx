import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef, useState } from "react";
import IntroScene from "../scenes/IntroScene";
import Sky from "../scenes/Sky";
import Stairwell from "../scenes/Stairwell";
import Street from "../scenes/Street";
import CameraRig from "../scenes/CameraRig";
import FishingRig from "../scenes/FishingRig";
import Overlay from "./Overlay";
import Preloader from "./Preloader";
import { fishRt } from "../game/fishingRuntime";
import { scrollState, useSceneStore } from "../store/useSceneStore";
import * as cameraPath from "../utils/cameraPath";
import { INTRO_CAM } from "../utils/cameraPath";
import "../styles/journey.css";

// Высота прокрутки: чем больше, тем медленнее «идём».
const SCROLL_HEIGHT = "1900vh";

// Сообщает «сцена готова»: компонент монтируется, только когда Suspense
// дождался всех моделей; ждём ещё 4 кадра — за них компилируются шейдеры.
function ReadySignal() {
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current < 4 && ++frames.current === 4) {
      useSceneStore.getState().setReady(true);
    }
  });
  return null;
}

// Следит за частотой кадров и уменьшает плотность пикселей, если машина не тянет.
// Считаем кадры в окне 2 секунды. Два окна подряд ниже 45 кадров/с — снижаем dpr
// на 0.25 (не ниже 1). Обратно не повышаем: иначе картинка «дышала» бы —
// стало легче → подняли → снова тяжело → опустили.
function AdaptiveDpr({ max, onChange }) {
  const m = useRef({ time: 0, frames: 0, slowWindows: 0, level: max });
  useFrame((_, delta) => {
    const s = m.current;
    // Кадр длиннее 0.25 с — это не «слабая видеокарта», а вкладка в фоне или
    // разовая заминка. Такое окно выбрасываем целиком.
    if (delta > 0.25 || document.hidden) {
      s.time = 0;
      s.frames = 0;
      return;
    }
    s.time += delta;
    s.frames++;
    if (s.time < 2) return;
    const fps = s.frames / s.time;
    s.time = 0;
    s.frames = 0;
    if (fps >= 45 || s.level <= 1) {
      s.slowWindows = 0;
      return;
    }
    if (++s.slowWindows < 2) return;
    s.slowWindows = 0;
    s.level = Math.max(1, s.level - 0.25);
    onChange(s.level);
  });
  return null;
}

export default function ResumeCanvas() {
  const small = typeof window !== "undefined" && window.innerWidth < 768;
  // Плотность пикселей (dpr): сколько пикселей картинки на один пиксель CSS.
  // dpr 2 — это вчетверо больше пикселей, чем dpr 1, и вчетверо больше работы
  // видеокарте. На сильной машине оставляем максимум, а если кадры начали
  // проседать — AdaptiveDpr (выше) сам уменьшит плотность.
  const maxDpr = small ? 1.5 : 2;
  const [dpr, setDpr] = useState(maxDpr);
  const ready = useSceneStore((s) => s.ready);
  return (
    <>
      <div className="stage">
        <Canvas
          dpr={[1, dpr]}
          camera={{
            position: [INTRO_CAM.x, INTRO_CAM.y, INTRO_CAM.z],
            fov: 55,
            near: 0.25,
            far: 700,
          }}
          gl={{ antialias: !small, powerPreference: "high-performance" }}
          // только в разработке: доступ из консоли к рендереру (window.__gl.info —
          // вызовы отрисовки и треугольники в кадре) и к состоянию (window.__dev)
          onCreated={({ gl }) => {
            if (import.meta.env.DEV) {
              window.__gl = gl;
              window.__dev = { store: useSceneStore, scrollState, path: cameraPath, fishRt };
            }
          }}
        >
          <Suspense fallback={null}>
            <ReadySignal />
            {/* включаем только после прелоадера: во время загрузки кадры и так идут
                рывками (компиляция шейдеров) — это не признак слабой машины */}
            {ready && <AdaptiveDpr max={maxDpr} onChange={setDpr} />}
            <CameraRig />
            {/* после CameraRig: удочка берёт положение камеры, уже посчитанное в этом кадре */}
            <FishingRig />
            <Sky stars={small ? 900 : 1800} />
            <Street />
            <IntroScene />
            <Stairwell />
          </Suspense>
        </Canvas>
      </div>
      <Preloader />
      <Overlay />
      <div style={{ height: SCROLL_HEIGHT }} aria-hidden="true" />
    </>
  );
}
