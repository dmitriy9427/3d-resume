import * as THREE from "three";
import { STOPS } from "../data/resume";

// Комната на высоком этаже: из окна видна улица сверху, потом спуск и прогулка.
// Улица идёт от дома вдоль -Z, в конце — набережная, пляж и море.
export const ROOM_FLOOR = 7; // высота пола комнаты над улицей
export const ROAD_HALF = 6;
export const EDGE = 9; // линия фасадов
export const STOP_SPACING = 22;
export const FIRST_STOP_Z = -34;
export const HERO_LEN = 10;
export const CROSS_Z = -11; // поперечная улица у дома
export const LAST_HERO_Z = FIRST_STOP_Z - STOP_SPACING * (STOPS.length - 2);
export const STREET_END = LAST_HERO_Z - 40; // конец дороги, начало набережной
export const PROMENADE_END = STREET_END - 14;
export const SAND_END = PROMENADE_END - 22;
export const SEA_Z = SAND_END; // отсюда море
export const WALK_END_Z = SAND_END + 8;

// z вывески для каждой остановки (у интро — нет)
export const stopZ = (i) => FIRST_STOP_Z - STOP_SPACING * (i - 1);

export const INTRO_CAM = { x: 0, y: ROOM_FLOOR + 1.6, z: 2.5 };

const pts = [
  [0, ROOM_FLOOR + 1.6, 2.5],
  [0, ROOM_FLOOR + 1.6, -1],
  [0, ROOM_FLOOR + 1.65, -4],
  [0, ROOM_FLOOR + 1.45, -8],
  [0, 5.2, -14],
  [0, 3.0, -21],
  [0, 1.75, -28],
];
for (let z = -62, i = 0; z > STREET_END; z -= 40, i++) {
  pts.push([i % 2 ? -0.9 : 0.9, 1.7, z]);
}
pts.push([0, 1.7, STREET_END - 8]);
pts.push([0, 1.7, WALK_END_Z]);

export const PATH = new THREE.CatmullRomCurve3(
  pts.map((p) => new THREE.Vector3(...p)),
  false,
  "centripetal",
);
PATH.arcLengthDivisions = 2000;
export const PATH_LENGTH = PATH.getLength();

// Прогресс (0..1), при котором вывеска остановки i в 12 м впереди.
export function stopProgress(i) {
  if (i === 0) return 0;
  const target = stopZ(i) + 12;
  for (let k = 0; k <= 2000; k++) {
    const u = k / 2000;
    if (PATH.getPointAt(u).z <= target) return u;
  }
  return 1;
}
