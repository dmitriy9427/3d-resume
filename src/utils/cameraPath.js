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

// Камера останавливается у каждой вывески в 9 м от неё: прокрутка на этом
// участке «стоит на месте», голова смотрит на здание, карточка читается.
// На узком экране (телефон) отходим дальше, чтобы вывеска помещалась в кадр.
export const STOP_GAP =
  typeof window !== "undefined" && window.innerWidth < window.innerHeight ? 17 : 9;
const PLATEAU = 0.012;

function pathProgressAtZ(z) {
  for (let k = 0; k <= 2000; k++) {
    const u = k / 2000;
    if (PATH.getPointAt(u).z <= z) return u;
  }
  return 1;
}

const stopsU = STOPS.map((_, i) => (i === 0 ? 0 : pathProgressAtZ(stopZ(i) + STOP_GAP)));
const m = STOPS.length - 1;
// узлы соответствия «прокрутка → путь»: (s, u)
const KNOTS = [[0, 0]];
for (let k = 1; k <= m; k++) {
  const sk = stopsU[k] * (1 - m * PLATEAU) + (k - 1) * PLATEAU;
  KNOTS.push([sk, stopsU[k]], [sk + PLATEAU, stopsU[k]]);
}
KNOTS.push([1, 1]);

/** Прогресс прокрутки (0..1) → прогресс по пути (0..1), с паузами у вывесок. */
export function scrollToPath(s) {
  for (let k = 1; k < KNOTS.length; k++) {
    if (s <= KNOTS[k][0]) {
      const [s0, u0] = KNOTS[k - 1];
      const [s1, u1] = KNOTS[k];
      return s1 === s0 ? u1 : u0 + ((s - s0) / (s1 - s0)) * (u1 - u0);
    }
  }
  return 1;
}

/** Прогресс прокрутки, при котором камера стоит у вывески остановки i. */
export function stopScroll(i) {
  return i === 0 ? 0 : KNOTS[2 * i - 1][0] + PLATEAU / 2;
}
