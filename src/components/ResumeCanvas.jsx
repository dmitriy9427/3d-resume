import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import IntroScene from "../scenes/IntroScene";
import Starfield from "../scenes/Starfield";
import { INTRO_CAM } from "../utils/cameraPath";

// R3F по умолчанию делает camera.lookAt(0,0,0) для переданной через проп
// камеры — без этого сцена смотрит не туда, куда нужно (вниз, в пол)
function FixedCameraOrientation() {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.rotation.set(0, 0, 0);
  }, [camera]);
  return null;
}

export default function ResumeCanvas() {
  return (
    <>
      <Canvas
        camera={{
          position: [INTRO_CAM.x, INTRO_CAM.y, INTRO_CAM.z],
          fov: 55,
        }}
        style={{ width: "100vw", height: "100dvh", background: "#000000" }}
      >
        <Suspense fallback={null}>
          <FixedCameraOrientation />
          <Starfield />
          <IntroScene />
        </Suspense>
      </Canvas>
    </>
  );
}
