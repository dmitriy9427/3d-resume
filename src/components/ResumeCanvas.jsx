import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import IntroScene from "../scenes/IntroScene";
import Sky from "../scenes/Sky";
import Street from "../scenes/Street";
import CameraRig from "../scenes/CameraRig";
import Overlay from "./Overlay";
import { INTRO_CAM } from "../utils/cameraPath";
import "../styles/journey.css";

// Высота прокрутки: чем больше, тем медленнее «идём».
const SCROLL_HEIGHT = "1500vh";

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
            <CameraRig />
            <Sky stars={small ? 900 : 1800} />
            <Street />
            <IntroScene />
          </Suspense>
        </Canvas>
      </div>
      <Overlay />
      <div style={{ height: SCROLL_HEIGHT }} aria-hidden="true" />
    </>
  );
}
