import * as THREE from "three";
import { STOPS } from "../data/resume";

// Улица идёт от окна комнаты вдоль -Z. Здания стоят по краям дороги.
export const ROAD_HALF = 6;
export const EDGE = 7.2; // линия фасадов
export const STREET_START = -4;
export const STOP_SPACING = 22;
export const FIRST_STOP_Z = -34;
export const HERO_LEN = 10;
export const STREET_END = FIRST_STOP_Z - STOP_SPACING * (STOPS.length - 2) - 30;

// z вывески для каждой остановки (у интро — нет)
export const stopZ = (i) => FIRST_STOP_Z - STOP_SPACING * (i - 1);

// Путь: комната → окно → улица с лёгким «петлянием» по тротуару.
const pts = [
  [0, 1.6, 2.5],
  [0, 1.6, -1],
  [0, 1.65, -4],
  [0, 1.7, -8],
];
for (let z = -22, i = 0; z > STREET_END + 20; z -= 40, i++) {
  pts.push([i % 2 ? -0.9 : 0.9, 1.7, z]);
}
pts.push([0, 1.7, STREET_END + 20]);

export const PATH = new THREE.CatmullRomCurve3(
  pts.map((p) => new THREE.Vector3(...p)),
  false,
  "centripetal",
);
PATH.arcLengthDivisions = 1500;
export const PATH_LENGTH = PATH.getLength();

// Прогресс (0..1), при котором вывеска остановки i в 12 м впереди.
export function stopProgress(i) {
  if (i === 0) return 0;
  const target = stopZ(i) + 12;
  for (let k = 0; k <= 1500; k++) {
    const u = k / 1500;
    if (PATH.getPointAt(u).z <= target) return u;
  }
  return 1;
}

export const INTRO_CAM = { x: 0, y: 1.6, z: 2.5 };
