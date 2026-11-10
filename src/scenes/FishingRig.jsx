import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { floatDistance, step } from "../game/fishing";
import { fishCam, fishRt, SEA_Y } from "../game/fishingRuntime";
import { useSceneStore } from "../store/useSceneStore";

// ─── Рыбалка: то, что видно в 3D ────────────────────────────────────────────
// Удочка, леска, поплавок, круги на воде и пойманная рыба. Правила игры — в
// game/fishing.js; этот компонент каждый кадр делает три вещи:
//   1) двигает игру на шаг (step) и сообщает интерфейсу, если сменилась фаза;
//   2) ставит объекты по состоянию игры;
//   3) говорит камере, куда смотреть и как сильно приближать (fishCam).

const TRAVEL = 4.5; // секунд идём от конца прогулки до конца пирса
const ROD_LEN = 2.4;
const LINE_POINTS = 16;

const tmp = new THREE.Vector3();
const mid = new THREE.Vector3();

export default function FishingRig() {
  const root = useRef(); // «руки»: группа, приклеенная к камере
  const rod = useRef();
  const bobber = useRef();
  const ring = useRef();
  const fish = useRef();
  const st = useRef({
    phase: "",
    time: 0,
    swing: 0, // текущий наклон удочки (сглаженный)
    ringT: 9, // сколько секунд назад пошли круги по воде
    prevDip: 0,
    tip: new THREE.Vector3(),
    float: new THREE.Vector3(),
    start: new THREE.Vector3(), // откуда поплавок полетел при забросе
    look: new THREE.Vector3(),
  });

  // Леска — ломаная из 16 точек. Геометрию создаём один раз, а каждый кадр
  // только переписываем координаты в том же массиве (и ставим needsUpdate) —
  // без новых объектов, значит, без работы для сборщика мусора.
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#dfe8ff", transparent: true, opacity: 0.75 }));
    // three.js не рисует объект, если его «габаритная сфера» вне кадра. Сферу он
    // считает один раз, а леска движется — поэтому проверку отключаем.
    l.frustumCulled = false;
    return l;
  }, []);

  const rodGeo = useMemo(() => {
    // цилиндр, сужающийся к кончику; сдвигаем так, чтобы рукоять была в начале
    // координат — тогда вращение группы качает удочку вокруг рукояти
    const g = new THREE.CylinderGeometry(0.004, 0.014, ROD_LEN, 6);
    g.translate(0, ROD_LEN / 2, 0);
    return g;
  }, []);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    const store = useSceneStore.getState();
    const g = fishRt.game;
    s.time += dt;

    // Идём на пирс или обратно: blend ползёт к 1 или к 0.
    fishCam.blend = THREE.MathUtils.clamp(fishCam.blend + ((store.fishing ? 1 : -1) * dt) / TRAVEL, 0, 1);
    const arrived = fishCam.blend >= 1;
    const visible = fishCam.blend > 0.85;
    root.current.visible = visible;
    line.visible = visible;
    if (!visible) {
      bobber.current.visible = ring.current.visible = fish.current.visible = false;
      fishCam.fov = 60;
      fishCam.look.set(0, 0.6, fishCam.pos.z - 16);
      return;
    }

    if (store.fishing && arrived) {
      // tap — «было нажатие с прошлого кадра». Быстрый тап может начаться и
      // закончиться между двумя кадрами, и по одному pressed игра бы его не увидела.
      step(g, dt, fishRt.pressed || fishRt.tap);
      fishRt.tap = false;
    }

    // Интерфейс узнаёт только о смене фазы и о смене текста — это редкие события.
    if (g.phase !== s.phase || g.message !== store.fishView.message) {
      if (g.phase === "flying") s.start.copy(s.float);
      if (g.phase === "waiting" || g.phase === "bite") s.ringT = 0;
      if (g.phase === "caught" && s.phase !== "caught") {
        store.addCatch(g.result);
        fish.current.material.color.set(g.result.fish.color);
        fish.current.scale.setScalar(0.28 + Math.min(g.result.kg, 8) * 0.05);
      }
      s.phase = g.phase;
      store.setFishView({ phase: g.phase, message: g.message, result: g.result });
    }
    if (g.dip > s.prevDip + 0.2) s.ringT = 0; // поплавок дёрнулся — новые круги
    s.prevDip = g.dip;

    // ── Удочка: «руки» повторяют положение и поворот камеры, удочка — их ребёнок.
    root.current.position.copy(camera.position);
    root.current.quaternion.copy(camera.quaternion);
    let swing = 0;
    if (g.phase === "charging") swing = 0.3 + g.power * 1.0; // замах назад
    else if (g.phase === "flying") swing = -0.3; // хлёст вперёд
    else if (g.phase === "bite") swing = -0.08;
    else if (g.phase === "reeling") swing = 0.25 + g.tension * 0.4; // удочка гнётся на себя
    else if (g.phase === "caught") swing = 0.45;
    s.swing += (swing - s.swing) * (1 - Math.exp(-dt * 12));
    rod.current.rotation.set(-1.05 + s.swing, 0, 0.16);
    root.current.updateMatrixWorld(true);
    s.tip.set(0, ROD_LEN, 0);
    rod.current.localToWorld(s.tip); // кончик удочки в мировых координатах

    // ── Поплавок
    const inWater = g.phase === "waiting" || g.phase === "bite" || g.phase === "reeling";
    if (inWater || g.phase === "flying") {
      // точка на воде: прямо перед рыбаком, на расстоянии заброса
      const jerk = g.phase === "reeling" ? Math.sin(s.time * 9) * (g.pulling ? 0.3 : 0.08) : Math.sin(s.time * 0.7) * 0.1;
      tmp.set(jerk, SEA_Y + 0.14 + Math.sin(s.time * 2.2) * 0.025 - g.dip * 0.26, camera.position.z - floatDistance(g));
      if (g.phase === "flying") {
        // полёт: прямая от старта до воды + дуга вверх (синус от 0 до π)
        const t = Math.min(1, g.t / 0.9);
        s.float.lerpVectors(s.start, tmp, t);
        s.float.y += Math.sin(t * Math.PI) * 2.6;
      } else {
        s.float.copy(tmp);
      }
    } else {
      // висит под кончиком удочки и слегка качается
      s.float.set(s.tip.x + Math.sin(s.time * 1.7) * 0.04, s.tip.y - 0.75, s.tip.z);
    }
    bobber.current.visible = g.phase !== "caught";
    bobber.current.position.copy(s.float);
    // Вдали поплавок был бы точкой в пару пикселей. Честный размер тут вреден:
    // игрок должен видеть поклёвку, поэтому поплавок растёт с расстоянием.
    const far = inWater || g.phase === "flying" ? camera.position.distanceTo(s.float) : 0;
    bobber.current.scale.setScalar(1 + far * 0.1);
    bobber.current.rotation.z = g.phase === "reeling" && g.pulling ? 0.5 : 0;

    // ── Рыба на леске
    fish.current.visible = g.phase === "caught";
    if (fish.current.visible) {
      fish.current.position.set(s.tip.x, s.tip.y - 0.95, s.tip.z);
      fish.current.rotation.set(0, s.time * 1.4, Math.PI / 2 + Math.sin(s.time * 7) * 0.12);
    }

    // ── Круги на воде: кольцо растёт и тает
    s.ringT += dt;
    const ringAlpha = inWater ? Math.max(0, 0.55 - s.ringT * 0.45) : 0;
    ring.current.visible = ringAlpha > 0.01;
    if (ring.current.visible) {
      ring.current.position.set(s.float.x, SEA_Y + 0.02, s.float.z);
      ring.current.scale.setScalar((0.35 + s.ringT * 1.5) * (1 + far * 0.06));
      ring.current.material.opacity = ringAlpha;
    }

    // ── Леска: кривая Безье от кончика к поплавку. Средняя точка опущена —
    // это провис. Пока ждём, леска провисает; при вываживании натянута.
    const end = g.phase === "caught" ? fish.current.position : s.float;
    const sag = g.phase === "waiting" ? 0.7 : g.phase === "reeling" ? 0.25 * (1 - g.tension) : 0.05;
    mid.lerpVectors(s.tip, end, 0.5);
    mid.y -= sag;
    const pos = line.geometry.attributes.position;
    for (let i = 0; i < LINE_POINTS; i++) {
      const t = i / (LINE_POINTS - 1);
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      pos.setXYZ(i, a * s.tip.x + b * mid.x + c * end.x, a * s.tip.y + b * mid.y + c * end.y, a * s.tip.z + b * mid.z + c * end.z);
    }
    pos.needsUpdate = true;

    // ── Камера: куда смотреть и насколько приблизить. Пока ждём поклёвку —
    // сильное приближение на поплавок: именно он сейчас главный герой.
    if (inWater || g.phase === "flying") tmp.copy(s.float);
    else if (g.phase === "caught") tmp.copy(fish.current.position);
    else tmp.set(0, 0.6, camera.position.z - 16);
    fishCam.look.lerp(tmp, 1 - Math.exp(-dt * 4));
    const fov = { waiting: 34, bite: 30, reeling: 46, caught: 52, flying: 55 }[g.phase] ?? 60;
    fishCam.fov += (fov - fishCam.fov) * (1 - Math.exp(-dt * 2.5));
  });

  return (
    <>
      <group ref={root} visible={false}>
        <mesh ref={rod} position={[0.36, -0.42, -0.5]} geometry={rodGeo}>
          <meshStandardMaterial color="#2a2d36" roughness={0.4} />
        </mesh>
      </group>
      <primitive object={line} />

      {/* поплавок: красный верх, белый низ, антенна; MeshBasic — яркий и в темноте */}
      <group ref={bobber} visible={false}>
        <mesh position={[0, 0.1, 0]}>
          <sphereGeometry args={[0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshBasicMaterial color="#ff4a3d" />
        </mesh>
        <mesh position={[0, 0.1, 0]} rotation={[Math.PI, 0, 0]}>
          <sphereGeometry args={[0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshBasicMaterial color="#f4f4f4" />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.26, 5]} />
          <meshBasicMaterial color="#ffd23d" />
        </mesh>
      </group>

      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.85, 1, 32]} />
        <meshBasicMaterial color="#cfe0ff" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* рыба: вытянутый шар-тело и конус-хвост одним цветом */}
      <mesh ref={fish} visible={false} geometry={useMemo(fishGeometry, [])}>
        <meshStandardMaterial roughness={0.35} metalness={0.3} emissive="#223" emissiveIntensity={0.6} />
      </mesh>
    </>
  );
}

function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 14, 10);
  body.scale(1, 0.42, 0.2);
  const tail = new THREE.ConeGeometry(0.26, 0.4, 4);
  tail.rotateZ(-Math.PI / 2); // остриём к телу
  tail.scale(1, 1, 0.25);
  tail.translate(-0.62, 0, 0);
  const pos = [...body.toNonIndexed().attributes.position.array, ...tail.toNonIndexed().attributes.position.array];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}
