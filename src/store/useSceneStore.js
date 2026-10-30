import { create } from "zustand";

export const useSceneStore = create((set) => ({
  scene: "intro",
  isTransitioning: false,
  setScene: (scene) => set({ scene }),
  setTransitioning: (value) => set({ isTransitioning: value }),
}));
