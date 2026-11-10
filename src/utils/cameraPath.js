import * as THREE from "three";
import { STOPS } from "../data/resume";

// Комната на высоком этаже: из окна видна улица сверху. Выходим через дверь,
// спускаемся по лестнице подъезда и идём гулять.
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

// ─── Подъезд ────────────────────────────────────────────────────────────────
// Из комнаты выходим в дверь на лестничную клетку и спускаемся пешком.
// Лестница двухмаршевая: марш вниз → площадка → разворот на 180° → марш вниз.
// С 7 метров до земли — 4 марша по 10 ступеней. Вид сверху (x вправо, z вниз):
//
//        x = -6.6      -5.3      -4.0
//   z=-3.9 ┌───────────────────────┐ ← фасад дома, внизу — дверь на улицу
//          │   этажная площадка    ├── дверь квартиры (в комнату)
//   z=-1.8 ├──────────┬─┬──────────┤
//          │ дальний  │ │ ближний  │   «дальний» и «ближний» — относительно
//          │  марш    │ │  марш    │   двери квартиры
//   z= 1.0 ├──────────┴─┴──────────┤
//          │ промежуточная площадка│ ← окно во двор
//   z= 2.3 └───────────────────────┘
export const FLOOR_Y = ROOM_FLOOR + 0.03; // пол комнаты и верхней площадки
export const STAIRS = {
  xMin: -6.6,
  xMax: -4.0,
  xFar: -6.0, // ось дальнего марша
  xNear: -4.6, // ось ближнего марша
  zFront: -3.9,
  zTop: -1.8, // край этажной площадки, отсюда марши идут к +z
  zBottom: 1.0, // край промежуточной площадки
  zBack: 2.3,
  flights: 4,
  risers: 10, // ступеней в марше
  rise: FLOOR_Y / 40, // высота ступени (≈17.6 см)
  tread: 0.28, // глубина ступени
};
export const ROOM_DOOR = { x: -4, z: -2.5, w: 0.9, h: 2.05 };
export const FRONT_DOOR = { x: -5.0, z: -3.95, w: 1.0, h: 2.1 };
const EYE = 1.6; // высота глаз над полом

// Комната: шаг к окну, поворот налево мимо стола, дверь.
const pts = [
  [0, ROOM_FLOOR + EYE, 2.5],
  [0, ROOM_FLOOR + EYE, 1.2],
  [-1.4, FLOOR_Y + EYE, -0.6],
  [-2.8, FLOOR_Y + EYE, -2.0],
  [-3.5, FLOOR_Y + EYE, -2.45],
  [ROOM_DOOR.x, FLOOR_Y + EYE, ROOM_DOOR.z],
  [-4.8, FLOOR_Y + EYE, -2.55],
  [-5.5, FLOOR_Y + EYE, -2.3],
];
// Марши. Чётные (0, 2) — по дальней стороне к +z, нечётные — по ближней обратно.
// На каждом марше три точки на одной прямой (начало, середина, конец), чтобы
// сплайн не «провисал»; на площадке — три точки дугой, это разворот.
{
  const S = STAIRS;
  const xMid = (S.xFar + S.xNear) / 2;
  let level = FLOOR_Y;
  for (let f = 0; f < S.flights; f++) {
    const far = f % 2 === 0;
    const x = far ? S.xFar : S.xNear;
    const xNext = far ? S.xNear : S.xFar;
    const z0 = far ? S.zTop : S.zBottom;
    const z1 = far ? S.zBottom : S.zTop;
    const low = level - S.risers * S.rise;
    pts.push([x, level + EYE, z0], [x, (level + low) / 2 + EYE, (z0 + z1) / 2], [x, low + EYE, z1]);
    if (f < S.flights - 1) {
      const dir = far ? 1 : -1; // в какую сторону по z уходит площадка
      const k = far ? 1 : -1;
      pts.push(
        [x + 0.25 * k, low + EYE, z1 + dir * 0.55],
        [xMid, low + EYE, z1 + dir * 0.8],
        [xNext - 0.25 * k, low + EYE, z1 + dir * 0.55],
      );
    }
    level = low;
  }
}
// Первый этаж: к двери подъезда, на улицу и наискосок к середине дороги.
pts.push(
  [-4.85, 1.63, -3.0],
  [FRONT_DOOR.x, 1.65, FRONT_DOOR.z],
  [FRONT_DOOR.x, 1.7, -5.6],
  [-3.8, 1.7, -9.5],
  [-1.6, 1.7, -15],
  [0.2, 1.72, -21],
  [0, 1.75, -28],
);
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
PATH.arcLengthDivisions = 4000;
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

// В доме идём медленнее, чем по улице: там тесно, повороты на 180° на двух
// метрах пути. Если бы метр пути везде «стоил» одинаково много прокрутки,
// разворот на площадке проскакивал бы за один щелчок колеса. Поэтому весь
// путь по дому (до U_EXIT) растянут на первую долю INDOOR всей прокрутки.
/** Прогресс пути в момент выхода из подъезда на улицу. */
export const U_EXIT = pathProgressAtZ(FRONT_DOOR.z - 0.45);
const INDOOR = 0.2;

// узлы соответствия «прокрутка → путь»: (s, u)
const KNOTS = [
  [0, 0],
  [INDOOR, U_EXIT],
];
for (let k = 1; k <= m; k++) {
  const sk =
    INDOOR + ((stopsU[k] - U_EXIT) / (1 - U_EXIT)) * (1 - INDOOR - m * PLATEAU) + (k - 1) * PLATEAU;
  KNOTS.push([sk, stopsU[k]], [sk + PLATEAU, stopsU[k]]);
}
KNOTS.push([1, 1]);

// Разгон и торможение у остановок. Если между узлами идти с постоянной
// скоростью (прямая линия), у каждой вывески скорость за один кадр падает
// с полной до нуля и так же мгновенно возвращается — камера «врезается в стену».
// Поэтому скорость на каждом участке — трапеция: плавный разгон на длине RAMP,
// ровный ход, плавное торможение. Положение — интеграл этой трапеции.
const RAMP = 0.014; // доля всей прокрутки на разгон (и столько же на торможение)

/** t (0..1) → t с плавным стартом и финишем; r — доля участка на разгон. */
function easeTrapezoid(t, r) {
  const vmax = 1 / (1 - r); // скорость на ровной части: площадь трапеции = 1
  if (t < r) return (vmax * t * t) / (2 * r);
  if (t > 1 - r) return 1 - (vmax * (1 - t) * (1 - t)) / (2 * r);
  return vmax * (t - r / 2);
}

/** Прогресс прокрутки (0..1) → прогресс по пути (0..1), с паузами у вывесок. */
export function scrollToPath(s) {
  if (s <= 0) return 0;
  for (let k = 1; k < KNOTS.length; k++) {
    if (s <= KNOTS[k][0]) {
      const [s0, u0] = KNOTS[k - 1];
      const [s1, u1] = KNOTS[k];
      if (s1 === s0 || u1 === u0) return u1;
      const r = Math.min(0.5, RAMP / (s1 - s0));
      return u0 + easeTrapezoid((s - s0) / (s1 - s0), r) * (u1 - u0);
    }
  }
  return 1;
}

/** Прогресс прокрутки, при котором камера стоит у вывески остановки i. */
export function stopScroll(i) {
  return i === 0 ? 0 : KNOTS[2 * i][0] + PLATEAU / 2;
}
