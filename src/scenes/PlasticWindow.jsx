import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ─── Пластиковое (ПВХ) окно ────────────────────────────────────────────────
// Как устроено настоящее окно (вид из комнаты):
//
//   ┌──────────────────────────────────────┐  рама — коробка по периметру проёма
//   │ ┌────────┐ ║ ┌────────┐ ║ ┌────────┐ │  ║ импост — стойка между секциями
//   │ │ глухая │ ║ │ створка│ ║ │ глухая │ │  глухая секция: стекло стоит прямо в раме
//   │ │        │ ║ │      ━ │ ║ │        │ │  створка: своя рамка на петлях + ручка
//   │ └────────┘ ║ └────────┘ ║ └────────┘ │  штапик — тонкая планка, прижимает стекло
//   └──────────────────────────────────────┘  уплотнитель — тёмная резинка у стекла
//   ══════════════ подоконник ══════════════  (подоконник — в blender/make_assets.py)
//
// Размеры взяты от обычного профиля 70 мм: видимая ширина рамы ~70 мм, створки
// ~75 мм, импоста ~80 мм, штапика ~20 мм. Створка выступает в комнату на ~20 мм
// и на несколько миллиметров перекрывает раму («наплав») — поэтому щели не видно.
//
// Почему окно собрано в коде, а не в Blender. Мебель комнаты склеена в ОДНУ
// модель (один вызов отрисовки), и двигать её часть нельзя. А створке нужно
// уметь открываться — значит, ей нужен свой объект.
//
// Почему не 40 отдельных брусков. Каждый <mesh> — отдельный вызов отрисовки
// (draw call): процессор отдельно передаёт видеокарте его матрицу и материал.
// Окно из 40 брусков = 40 вызовов. Поэтому все неподвижные белые бруски
// склеиваются в одну геометрию (mergeGeometries) — и рисуются одним вызовом.
// Итого на всё окно: 8 вызовов вместо ~45.

// Проём в стене (те же числа, что в IntroScene.jsx)
const HALF_W = 1.6;
const BOTTOM = 0.9;
const TOP = 3.4;
const WALL_Z = -4;

const F = 0.07; // видимая ширина рамы
const M = 0.08; // ширина импоста
const S = 0.075; // ширина профиля створки
const D = 0.07; // глубина профиля (монтажная ширина 70 мм)
const B = 0.02; // штапик
const OVERLAP = 0.008; // наплав створки на раму
const PROUD = 0.02; // насколько створка выступает в комнату

const INNER_H = TOP - BOTTOM - 2 * F; // высота «света» рамы
const CY = (TOP + BOTTOM) / 2; // середина окна по высоте
const SECTION_W = (2 * HALF_W - 2 * F - 2 * M) / 3; // ширина одной секции
const SIDE_X = SECTION_W + M; // центр боковой секции (по модулю)

/** Брусок [ширина, высота, глубина] с центром в точке [x, y, z]. */
function bar(size, pos) {
  const g = new THREE.BoxGeometry(...size);
  g.translate(...pos);
  return g;
}

/** Четыре планки по периметру прямоугольника w×h: рамка толщиной t, глубиной d. */
function rim(w, h, t, d, cx, cy, cz) {
  return [
    bar([w, t, d], [cx, cy + h / 2 - t / 2, cz]),
    bar([w, t, d], [cx, cy - h / 2 + t / 2, cz]),
    bar([t, h - 2 * t, d], [cx - w / 2 + t / 2, cy, cz]),
    bar([t, h - 2 * t, d], [cx + w / 2 - t / 2, cy, cz]),
  ];
}

/** Склеить список геометрий в одну; исходные больше не нужны — освобождаем память. */
function merge(list) {
  const merged = mergeGeometries(list);
  list.forEach((g) => g.dispose());
  return merged;
}

// Стекло: прозрачное, с двумя косыми бликами. Настоящие отражения (комнаты
// в стекле) стоят дорого, а блик, нарисованный на canvas, — почти бесплатен
// и глазу этого хватает, чтобы понять «здесь стекло».
function glassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(150,185,255,0.07)"; // лёгкий голубоватый тон
  g.fillRect(0, 0, 256, 256);
  const streak = (x, w, a) => {
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(x, -200, w, 700);
  };
  g.translate(128, 128);
  g.rotate(-0.5);
  g.translate(-128, -128);
  streak(40, 60, 0.13);
  streak(120, 22, 0.08);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function PlasticWindow() {
  const sash = useRef();
  const handle = useRef();

  const { pvc, seal, glass, metal, fixedGeo, fixedSealGeo, sashGeo, sashSealGeo, handleGeo } = useMemo(() => {
    const pvc = new THREE.MeshStandardMaterial({ color: "#f1f2f5", roughness: 0.35 });
    const seal = new THREE.MeshStandardMaterial({ color: "#2a2c33", roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: "#8d93a1", roughness: 0.5, metalness: 0.6 });
    // depthWrite: false — стекло не пишет себя в буфер глубины, иначе оно
    // «закрыло» бы собой прозрачные объекты за окном (звёзды, свечение фонарей).
    const glass = new THREE.MeshBasicMaterial({
      map: glassTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // ── Неподвижная часть: рама, импосты, штапики глухих секций, накладки петель
    const fixed = [
      ...rim(2 * HALF_W, TOP - BOTTOM, F, D, 0, CY, 0),
      bar([M, INNER_H, D], [-(SECTION_W + M) / 2, CY, 0]),
      bar([M, INNER_H, D], [(SECTION_W + M) / 2, CY, 0]),
    ];
    const fixedSeal = [];
    for (const x of [-SIDE_X, SIDE_X]) {
      fixed.push(...rim(SECTION_W, INNER_H, B, 0.02, x, CY, 0.015));
      fixedSeal.push(...rim(SECTION_W - 2 * B, INNER_H - 2 * B, 0.006, 0.012, x, CY, 0.004));
    }
    // накладки петель — на импосте слева от створки
    for (const y of [CY + INNER_H / 2 - 0.14, CY - INNER_H / 2 + 0.14]) {
      fixed.push(bar([0.022, 0.09, 0.03], [-SECTION_W / 2 - 0.014, y, D / 2 + 0.012]));
    }

    // ── Створка. Её геометрия построена ОТ ПЕТЛИ: x = 0 — ось вращения,
    // створка тянется вправо. Тогда поворот группы вокруг Y и есть открывание.
    const w = SECTION_W + 2 * OVERLAP;
    const h = INNER_H + 2 * OVERLAP;
    const z = PROUD - D / 2; // группа стоит на лицевой плоскости рамы
    const sashParts = [
      ...rim(w, h, S, D, w / 2 - OVERLAP, 0, z),
      ...rim(w - 2 * S, h - 2 * S, B, 0.02, w / 2 - OVERLAP, 0, z + 0.015),
    ];
    const sashSeal = rim(w - 2 * S - 2 * B, h - 2 * S - 2 * B, 0.006, 0.012, w / 2 - OVERLAP, 0, z + 0.004);

    // Ручка: рисуем её «вниз» (закрыто) от точки вращения в начале координат.
    const handleParts = [bar([0.024, 0.13, 0.018], [0, -0.05, 0.03]), bar([0.02, 0.02, 0.03], [0, 0, 0.012])];

    return {
      pvc,
      seal,
      glass,
      metal,
      fixedGeo: merge(fixed),
      fixedSealGeo: merge(fixedSeal),
      sashGeo: merge(sashParts),
      sashSealGeo: merge(sashSeal),
      handleGeo: merge(handleParts),
    };
  }, []);

  // Окно закрыто: из комнаты теперь выходим через дверь. Но створка по-прежнему
  // отдельная группа с осью на петлях — задайте sash.current.rotation.y = -1.2,
  // и она распахнётся. Так же (по положению камеры) открываются двери подъезда,
  // см. SwingDoor в Stairwell.jsx.
  const sashW = SECTION_W + 2 * OVERLAP;
  const glassW = SECTION_W - 2 * B;
  const glassH = INNER_H - 2 * B;
  return (
    <group position={[0, 0, WALL_Z]}>
      <mesh geometry={fixedGeo} material={pvc} />
      <mesh geometry={fixedSealGeo} material={seal} />
      {/* стёкла глухих секций — один меш на оба не склеить выгоднее: это всего 2 треугольника каждый */}
      {[-SIDE_X, SIDE_X].map((x) => (
        <mesh key={x} position={[x, CY, 0]} material={glass}>
          <planeGeometry args={[glassW, glassH]} />
        </mesh>
      ))}

      {/* створка: начало координат группы — на оси петель */}
      <group ref={sash} position={[-SECTION_W / 2, CY, D / 2]}>
        <mesh geometry={sashGeo} material={pvc} />
        <mesh geometry={sashSealGeo} material={seal} />
        <mesh position={[sashW / 2 - OVERLAP, 0, PROUD - D / 2]} material={glass}>
          <planeGeometry args={[sashW - 2 * S - 2 * B, INNER_H + 2 * OVERLAP - 2 * S - 2 * B]} />
        </mesh>
        <mesh
          ref={handle}
          geometry={handleGeo}
          material={pvc}
          position={[sashW - OVERLAP - S / 2, 0, PROUD]}
        />
      </group>

      {/* отлив снаружи: наклонная металлическая полка, по ней стекает дождь */}
      <mesh position={[0, BOTTOM - 0.01, -0.12]} rotation={[0.18, 0, 0]} material={metal}>
        <boxGeometry args={[2 * HALF_W + 0.1, 0.008, 0.2]} />
      </mesh>
    </group>
  );
}
