import * as THREE from "three";
import { SAND_END } from "../utils/cameraPath";
import { createGame } from "./fishing";

// То, что меняется КАЖДЫЙ кадр, лежит в обычных объектах, а не в zustand:
// запись в хранилище будит React, а 60 перерисовок интерфейса в секунду ради
// одной шкалы — впустую сожжённый процессор. В хранилище (useSceneStore)
// уходит только редкое: сменилась фаза, поймана рыба.

/** Где стоит рыбак: конец пирса, глаза на высоте 1.7 м над настилом. */
export const PIER_SPOT = new THREE.Vector3(0, 1.91, SAND_END - 67.5);
export const SEA_Y = -0.5; // уровень воды (см. Seaside в Street.jsx)

export const fishRt = {
  game: createGame(),
  pressed: false, // зажата ли кнопка; пишет FishingHud, читает FishingRig
  tap: false, // нажатие случилось с прошлого кадра (чтобы не терять быстрые тапы)
};

/** Камера в режиме рыбалки; читает CameraRig. blend: 0 — обычная прогулка, 1 — стоим на пирсе. */
export const fishCam = {
  blend: 0,
  pos: PIER_SPOT,
  look: new THREE.Vector3(0, 0.6, PIER_SPOT.z - 16),
  fov: 60,
};
