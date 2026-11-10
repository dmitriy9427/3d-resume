import { create } from "zustand";

export const useSceneStore = create((set) => ({
  activeStop: 0,
  setActiveStop: (activeStop) => set({ activeStop }),
  // сцена построена и несколько кадров отрисовано — прелоадер можно «сжигать»
  ready: false,
  setReady: (ready) => set({ ready }),
  // ── рыбалка (только то, что меняется редко; покадровое — в game/fishingRuntime.js)
  fishing: false,
  setFishing: (fishing) => set({ fishing }),
  fishView: { phase: "idle", message: "", result: null },
  setFishView: (fishView) => set({ fishView }),
  caught: {}, // id рыбы → лучший вес
  addCatch: ({ fish, kg }) =>
    set((s) => ({ caught: { ...s.caught, [fish.id]: Math.max(kg, s.caught[fish.id] ?? 0) } })),
}));

// Прогресс прокрутки: target — по странице, current — со сглаживанием.
export const scrollState = { target: 0, current: 0 };

export function initScroll() {
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollState.target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  return () => {
    window.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  };
}
