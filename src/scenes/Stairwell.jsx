import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLOOR_Y, FRONT_DOOR, ROOM_DOOR, STAIRS as S } from "../utils/cameraPath";

// ─── Подъезд: лестничная клетка от комнаты до улицы ─────────────────────────
// План и размеры — в utils/cameraPath.js (STAIRS): и путь камеры, и ступени
// строятся по одним и тем же числам, поэтому камера идёт ровно по маршам.
//
// Как это нарисовано дёшево:
//  1. Стены — одна склеенная геометрия с текстурой «краска снизу, побелка сверху».
//  2. Всё остальное неподвижное (ступени, площадки, перила, соседские двери,
//     почтовые ящики, рамы окон) — тоже ОДНА геометрия. Цвет у каждой детали
//     свой, но записан не в материал, а в вершины (атрибут color). Материал один
//     (vertexColors: true) → один вызов отрисовки на ~400 брусков.
//  3. Двери, которые открываются, — отдельные объекты (их надо вращать).
//  4. Свет — ОДНА лампа, которая едет по высоте вместе с камерой. Каждый
//     источник света считается для каждого пикселя каждого освещаемого объекта
//     во всей сцене, даже далёкого. Три лампы по этажам стоили бы втрое дороже,
//     а глаз разницы не заметит: видно всегда только свой этаж.

const H = FLOOR_Y * 1.5; // потолок клетки: над верхней площадкой ещё пол-этажа
const FLOOR_H = FLOOR_Y / 2; // высота этажа (два марша)
const WIDTH = S.xMax - S.xMin;
const X_MID = (S.xMin + S.xMax) / 2;
const RUN = S.zBottom - S.zTop; // длина марша в плане
const DROP = S.risers * S.rise; // перепад высоты на марше
const SLOPE = Math.atan2(DROP, RUN);
const FLIGHT_LEN = Math.hypot(RUN, DROP);

const sstep = (e0, e1, x) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Брусок с цветом в вершинах. rotX — наклон вокруг оси X (для маршей и перил). */
function box(size, pos, color, rotX = 0) {
  const g = new THREE.BoxGeometry(...size);
  if (rotX) g.rotateX(rotX);
  g.translate(...pos);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function merge(list) {
  const merged = mergeGeometries(list);
  list.forEach((g) => g.dispose());
  return merged;
}

/**
 * На сколько «пол» у стены ниже этажной площадки в точке z.
 * Вдоль марша пол опускается, и полоса краски на стене должна опускаться вместе
 * с ним — как в настоящем подъезде, где граница краски идёт наискосок вдоль
 * лестницы. side: -1 — западная стена (вдоль неё марши идут вниз к +z),
 * +1 — восточная (там вниз к -z; сдвиг на целый этаж глазу не виден, поэтому
 * «+DROP» и «-DROP» у задней стены — одно и то же).
 */
function floorShift(z, side) {
  const t = THREE.MathUtils.clamp((z - S.zTop) / RUN, 0, 1);
  return side * DROP * t;
}

/**
 * Кусок стены. Стена вдоль z стоит на x = at, вдоль x — на z = at.
 * UV считаем от мировых координат, а не «0..1 на кусок»: тогда на всех кусках
 * (в том числе вокруг дверных проёмов) рисунок совпадает.
 * facing — куда смотрит лицевая сторона (поворот плоскости вокруг Y).
 * side — см. floorShift: сдвигает полосу краски вслед за лестницей.
 */
function wall(along, at, a0, a1, y0, y1, facing, side = 0) {
  if (along === "z") {
    // Сдвиг краски меняется только на участке маршей, и меняется линейно.
    // Плоскость умеет линейно растянуть UV между своими углами, поэтому режем
    // стену по границам этого участка — на каждом куске получается ровный скос.
    const cuts = [...new Set([a0, S.zTop, S.zBottom, a1])].filter((z) => z >= a0 && z <= a1).sort((p, q) => p - q);
    if (cuts.length > 2) {
      const parts = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        if (cuts[i + 1] - cuts[i] > 1e-6) parts.push(wall(along, at, cuts[i], cuts[i + 1], y0, y1, facing, side));
      }
      return mergeGeometries(parts);
    }
  }
  const g = new THREE.PlaneGeometry(a1 - a0, y1 - y0);
  g.rotateY(facing);
  const mid = (a0 + a1) / 2;
  g.translate(along === "z" ? at : mid, (y0 + y1) / 2, along === "z" ? mid : at);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const shift = along === "z" ? floorShift(pos.getZ(i), side) : floorShift(at, 1);
    uv.setXY(i, (along === "z" ? pos.getZ(i) : pos.getX(i)) / 3, (pos.getY(i) - shift) / FLOOR_H);
  }
  return g;
}

// Стены подъезда: нижние 1.6 м — зелёная масляная краска, выше — побелка.
function wallTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  const split = 256 * (1 - 1.6 / FLOOR_H); // canvas рисуется сверху вниз
  g.fillStyle = "#cfcbbb";
  g.fillRect(0, 0, 128, split);
  g.fillStyle = "#3d7566";
  g.fillRect(0, split, 128, 256 - split);
  g.fillStyle = "#2c5a4e";
  g.fillRect(0, split, 128, 3); // тёмная отбивка между краской и побелкой
  g.globalAlpha = 0.05;
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = i % 2 ? "#000" : "#fff";
    g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildWalls() {
  const d = ROOM_DOOR;
  const f = FRONT_DOOR;
  const east = S.xMax - 0.02; // на 2 см внутрь от стены комнаты, чтобы плоскости не мерцали
  return merge([
    // западная стена — глухая
    wall("z", S.xMin, S.zFront, S.zBack, 0, H, Math.PI / 2, -1),
    // восточная — с проёмом двери квартиры на верхнем этаже
    wall("z", east, S.zFront, d.z - d.w / 2, 0, H, -Math.PI / 2, 1),
    wall("z", east, d.z + d.w / 2, S.zBack, 0, H, -Math.PI / 2, 1),
    wall("z", east, d.z - d.w / 2, d.z + d.w / 2, 0, FLOOR_Y, -Math.PI / 2, 1),
    wall("z", east, d.z - d.w / 2, d.z + d.w / 2, FLOOR_Y + d.h, H, -Math.PI / 2, 1),
    // задняя (во двор)
    wall("x", S.zBack, S.xMin, S.xMax, 0, H, Math.PI),
    // фасадная — с проёмом двери на улицу
    wall("x", S.zFront, S.xMin, f.x - f.w / 2, 0, H, 0),
    wall("x", S.zFront, f.x + f.w / 2, S.xMax, 0, H, 0),
    wall("x", S.zFront, f.x - f.w / 2, f.x + f.w / 2, f.h, H, 0),
  ]);
}

const CONCRETE = "#8b8d95";
const STEP = "#9a9ca4";
const RAIL = "#23262f";
const HANDRAIL = "#6b4631";

function buildStatic() {
  const parts = [];
  const add = (...a) => parts.push(box(...a));

  // пол первого этажа и потолок
  add([WIDTH, 0.1, S.zBack - S.zFront], [X_MID, -0.03, (S.zFront + S.zBack) / 2], "#5d6068");
  // потолок на 6 см у́же шахты: его торец не должен лежать в плоскости стены
  // комнаты (x = -4) — две поверхности в одной плоскости мерцают (z-fighting)
  add([WIDTH - 0.06, 0.1, S.zBack - S.zFront], [X_MID - 0.03, H + 0.05, (S.zFront + S.zBack) / 2], "#d8d5c8");

  // площадки: этажные (у фасада) и промежуточные (у окна во двор)
  for (const level of [FLOOR_Y, FLOOR_H]) {
    add([WIDTH, 0.2, S.zTop - S.zFront], [X_MID, level - 0.1, (S.zFront + S.zTop) / 2], CONCRETE);
  }
  for (const level of [FLOOR_Y - DROP, FLOOR_H - DROP]) {
    add([WIDTH, 0.2, S.zBack - S.zBottom], [X_MID, level - 0.1, (S.zBottom + S.zBack) / 2], CONCRETE);
    // окно во двор: белая рама и тёмное ночное стекло
    add([1.0, 1.1, 0.06], [X_MID, level + 1.5, S.zBack - 0.03], "#e6e6ea");
    add([0.4, 0.96, 0.07], [X_MID - 0.23, level + 1.5, S.zBack - 0.03], "#141d3d");
    add([0.4, 0.96, 0.07], [X_MID + 0.23, level + 1.5, S.zBack - 0.03], "#141d3d");
    // подоконник
    add([1.1, 0.04, 0.16], [X_MID, level + 0.93, S.zBack - 0.08], "#e6e6ea");
  }

  // марши
  for (let f = 0; f < S.flights; f++) {
    const far = f % 2 === 0;
    const x = far ? S.xFar : S.xNear;
    const dir = far ? 1 : -1; // куда по z идём вниз
    const z0 = far ? S.zTop : S.zBottom;
    const top = FLOOR_Y - f * DROP;
    // ступени: i-я ступень на (i + 1) подъёмов ниже верхней площадки
    for (let i = 0; i < S.risers; i++) {
      const y = top - (i + 1) * S.rise;
      const h = S.rise + 0.08; // с запасом вниз — ступень «утоплена» в плиту марша
      add([1.2, h, S.tread], [x, y - h / 2, z0 + dir * (i + 0.5) * S.tread], STEP);
      // тёмная полоска по кромке: сверху видны одни проступи, и без неё
      // лестница сливается в ровный серый скат
      add([1.2, 0.012, 0.05], [x, y + 0.004, z0 + dir * ((i + 1) * S.tread - 0.025)], "#4d4f57");
      // стойка перил через одну ступень
      if (i % 2 === 0) {
        const rx = far ? S.xFar + 0.57 : S.xNear - 0.57;
        add([0.025, 0.9, 0.025], [rx, y + 0.45, z0 + dir * (i + 0.5) * S.tread], RAIL);
      }
    }
    // плита марша — наклонный брусок под ступенями (его видно снизу)
    const zc = z0 + (dir * RUN) / 2;
    const yc = top - DROP / 2;
    add([1.2, 0.16, FLIGHT_LEN], [x, yc - S.rise - 0.1, zc], CONCRETE, dir * SLOPE);
    // поручень — такой же наклонный брусок, на 0.9 м выше линии ступеней
    const rx = far ? S.xFar + 0.57 : S.xNear - 0.57;
    add([0.05, 0.05, FLIGHT_LEN], [rx, yc - S.rise / 2 + 0.92, zc], HANDRAIL, dir * SLOPE);
  }

  // соседские двери на этажных площадках
  const neighbour = (x, level, z, color) => {
    add([0.07, 2.05, 0.9], [x, level + 1.025, z], color);
    add([0.09, 2.15, 0.06], [x, level + 1.075, z - 0.48], "#d8d2c4");
    add([0.09, 2.15, 0.06], [x, level + 1.075, z + 0.48], "#d8d2c4");
    add([0.09, 0.06, 1.02], [x, level + 2.12, z], "#d8d2c4");
    add([0.08, 0.08, 0.14], [x, level + 1.6, z], "#c9b26a"); // табличка с номером
  };
  neighbour(S.xMin + 0.03, FLOOR_Y, -2.85, "#5a3b2c");
  neighbour(S.xMin + 0.03, FLOOR_H, -2.85, "#3b4658");
  neighbour(S.xMax - 0.05, FLOOR_H, -2.85, "#4d2f2a");

  // наличник двери нашей квартиры (закрывает стык стены комнаты и стены подъезда)
  const d = ROOM_DOOR;
  for (const z of [d.z - d.w / 2 - 0.03, d.z + d.w / 2 + 0.03]) {
    add([0.14, d.h + 0.06, 0.06], [d.x - 0.01, FLOOR_Y + d.h / 2 + 0.03, z], "#d8d2c4");
  }
  add([0.14, 0.07, d.w + 0.12], [d.x - 0.01, FLOOR_Y + d.h + 0.035, d.z], "#d8d2c4");

  // первый этаж: почтовые ящики и рама уличной двери
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      add([0.12, 0.26, 0.3], [S.xMin + 0.07, 1.2 + j * 0.3, -3.3 + i * 0.33], (i + j) % 2 ? "#44628f" : "#3c5780");
    }
  }
  const fd = FRONT_DOOR;
  for (const x of [fd.x - fd.w / 2 - 0.04, fd.x + fd.w / 2 + 0.04]) {
    add([0.08, fd.h + 0.08, 0.16], [x, fd.h / 2 + 0.04, fd.z], "#2b3038");
  }
  add([fd.w + 0.16, 0.08, 0.16], [fd.x, fd.h + 0.04, fd.z], "#2b3038");
  // Наружные стены шахты. Внутренние стены — плоскости, смотрящие внутрь; снаружи
  // они невидимы, и без этих панелей с улицы было бы видно лестницу насквозь.
  const EXT = "#30364d";
  const top = H + 0.1;
  const zOut = S.zFront - 0.09;
  add([fd.x - fd.w / 2 - S.xMin, top, 0.08], [(S.xMin + fd.x - fd.w / 2) / 2, top / 2, zOut], EXT);
  add([S.xMax - fd.x - fd.w / 2, top, 0.08], [(S.xMax + fd.x + fd.w / 2) / 2, top / 2, zOut], EXT);
  add([fd.w, top - fd.h, 0.08], [fd.x, (top + fd.h) / 2, zOut], EXT);
  // выше крыши дома шахта торчит башенкой — ей нужны боковая и задняя стенки
  const towerH = top - FLOOR_Y + 0.2;
  const towerY = FLOOR_Y - 0.2 + towerH / 2;
  add([0.08, towerH, S.zBack - S.zFront + 0.2], [S.xMin - 0.06, towerY, (S.zFront + S.zBack) / 2], EXT);
  add([WIDTH + 0.06, towerH, 0.08], [X_MID - 0.05, towerY, S.zBack + 0.06], EXT);
  // козырёк над входом и крыльцо — снаружи
  add([2.0, 0.08, 1.1], [fd.x, fd.h + 0.35, fd.z - 0.55], "#3a3f4a");
  add([1.6, 0.06, 0.8], [fd.x, 0.03, fd.z - 0.45], "#6a6d76");

  return merge(parts);
}

// плафоны: светятся сами (MeshBasicMaterial не зависит от света)
function buildLamps() {
  return merge(
    [FLOOR_H - 0.24, FLOOR_Y - 0.24, H - 0.04].map((y) => box([0.26, 0.07, 0.26], [X_MID, y, -2.85], "#ffe7b5")),
  );
}

/**
 * Дверь на петлях. Группа стоит в точке петли, полотно тянется от неё по
 * локальной оси +X — поэтому поворот группы вокруг Y и есть открывание
 * (тот же приём, что у створки окна).
 * Открывается сама, когда камера ближе 3 м к проёму, и закрывается за спиной:
 * угол — функция расстояния, а не времени, поэтому при прокрутке назад всё
 * проигрывается в обратную сторону без отдельного кода.
 */
function SwingDoor({ hinge, center, closed, swing, size, color, material }) {
  const ref = useRef();
  const geo = useMemo(() => {
    const [w, h] = size;
    return merge([
      box([w, h, 0.05], [w / 2, h / 2, 0], color),
      box([0.03, 0.14, 0.11], [w - 0.09, h * 0.48, 0], "#b9bcc4"), // ручка, с обеих сторон
    ]);
  }, [size, color]);
  const target = useMemo(() => new THREE.Vector3(...center), [center]);
  useFrame(({ camera }) => {
    const open = sstep(3.0, 1.3, camera.position.distanceTo(target));
    ref.current.rotation.y = closed + swing * open;
  });
  return <mesh ref={ref} position={hinge} rotation={[0, closed, 0]} geometry={geo} material={material} />;
}

export default function Stairwell() {
  const light = useRef();
  const { walls, staticGeo, lamps, wallMat, paint, glow } = useMemo(
    () => ({
      walls: buildWalls(),
      staticGeo: buildStatic(),
      lamps: buildLamps(),
      wallMat: new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 }),
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    }),
    [],
  );

  // Лампа едет по высоте за камерой и гаснет, когда камера далеко от клетки.
  // Яркость 0 вместо visible=false: three.js компилирует шейдеры под число
  // источников света, и «выключение» лампы заставило бы пересобрать их все —
  // а это заметная заминка прямо на выходе из подъезда.
  useFrame(({ camera }) => {
    const c = camera.position;
    const near = sstep(7, 3.5, Math.hypot(c.x - X_MID, c.z + 0.8));
    light.current.intensity = 11 * near;
    if (near > 0) light.current.position.y = THREE.MathUtils.clamp(c.y + 1.1, 1.6, H - 0.4);
  });

  const d = ROOM_DOOR;
  const f = FRONT_DOOR;
  return (
    <group>
      <mesh geometry={walls} material={wallMat} />
      <mesh geometry={staticGeo} material={paint} />
      <mesh geometry={lamps} material={glow} />
      <pointLight ref={light} position={[X_MID, 8, -0.6]} color="#ffdcae" intensity={0} distance={8} decay={1.4} />

      {/* дверь квартиры: петли у фасадной стороны, открывается на площадку */}
      <SwingDoor
        hinge={[d.x - 0.02, FLOOR_Y, d.z - d.w / 2]}
        center={[d.x, FLOOR_Y + 1.6, d.z]}
        closed={-Math.PI / 2}
        swing={-1.5}
        size={[d.w, d.h]}
        color="#6a4a36"
        material={paint}
      />
      {/* дверь подъезда: стальная, открывается наружу */}
      <SwingDoor
        hinge={[f.x - f.w / 2, 0.02, f.z - 0.03]}
        center={[f.x, 1.6, f.z]}
        closed={0}
        swing={1.5}
        size={[f.w, f.h]}
        color="#39424f"
        material={paint}
      />
    </group>
  );
}
