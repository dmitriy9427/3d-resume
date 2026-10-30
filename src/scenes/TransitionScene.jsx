import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useSceneStore } from "../store/useSceneStore";
import { INTRO_CAM, EXIT_CAM, CITY_CAM } from "../utils/cameraPath";

export default function TransitionScene() {
  const camera = useThree((state) => state.camera);
  const { scene, setScene, setTransitioning } = useSceneStore();
  const pos = useRef({ ...INTRO_CAM });

  useEffect(() => {
    // R3F по умолчанию делает camera.lookAt(0,0,0) — камера всегда смотрит ровно
    // вперёд, без наклона, поэтому сразу и навсегда обнуляем поворот
    camera.rotation.set(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    if (scene !== "transitionToCity" && scene !== "transitionToIntro") return;

    const onUpdate = () => camera.position.set(pos.current.x, pos.current.y, pos.current.z);
    const onComplete = () => {
      setScene(scene === "transitionToCity" ? "city" : "intro");
      setTransitioning(false);
    };

    const tl = gsap.timeline({ onComplete });

    if (scene === "transitionToCity") {
      // сначала ровный вылет через окно, подъём начинается только после него
      tl.to(pos.current, { ...EXIT_CAM, duration: 1.3, ease: "power1.in", onUpdate });
      tl.to(pos.current, { ...CITY_CAM, duration: 2.7, ease: "power2.inOut", onUpdate });
    } else {
      // обратный путь: сперва спуск к окну, потом ровный залёт обратно в комнату
      tl.to(pos.current, { ...EXIT_CAM, duration: 2.7, ease: "power2.inOut", onUpdate });
      tl.to(pos.current, { ...INTRO_CAM, duration: 1.3, ease: "power1.out", onUpdate });
    }

    return () => tl.kill();
  }, [scene, camera, setScene, setTransitioning]);

  return null;
}
