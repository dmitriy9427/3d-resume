import { useSceneStore } from "../store/useSceneStore";
import { useEffect } from "react";

export const useScrollAnimation = () => {
  const { scene, setScene, isTransitioning, setTransitioning } =
    useSceneStore();

  useEffect(() => {
    const onWheel = (e) => {
      if (isTransitioning) return; // блокируем скролл во время перехода

      if (e.deltaY > 0 && scene === "intro") {
        setTransitioning(true);
        setScene("transitionToCity");
      } else if (e.deltaY < 0 && scene === "city") {
        setTransitioning(true);
        setScene("transitionToIntro");
      }
    };

    window.addEventListener("wheel", onWheel);
    return () => window.removeEventListener("wheel", onWheel);
  }, [scene, isTransitioning]);
};
