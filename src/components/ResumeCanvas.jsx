import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import IntroScene from "../scenes/IntroScene";
import Sky from "../scenes/Sky";
import Street from "../scenes/Street";
import CameraRig from "../scenes/CameraRig";
import Overlay from "./Overlay";
import Preloader from "./Preloader";
import { useSceneStore } from "../store/useSceneStore";
import { INTRO_CAM } from "../utils/cameraPath";
import "../styles/journey.css";

// Высота прокрутки: чем больше, тем медленнее «идём».
const SCROLL_HEIGHT = "1500vh";

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

export default function ResumeCanvas() {
  const small = typeof window !== "undefined" && window.innerWidth < 768;
  return (
    <>
      <div className="stage">
        <Canvas
          dpr={[1, small ? 1.5 : 2]}
          camera={{
            position: [INTRO_CAM.x, INTRO_CAM.y, INTRO_CAM.z],
            fov: 55,
            near: 0.25,
            far: 700,
          }}
          gl={{ antialias: !small, powerPreference: "high-performance" }}
        >
          <Suspense fallback={null}>
            <ReadySignal />
            <CameraRig />
            <Sky stars={small ? 900 : 1800} />
            <Street />
            <IntroScene />
          </Suspense>
        </Canvas>
      </div>
      <Preloader />
      <Overlay />
      <div style={{ height: SCROLL_HEIGHT }} aria-hidden="true" />
    </>
  );
}
