import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { STOPS } from "../data/resume";
import { CROSS_Z, EDGE, ROAD_HALF, STREET_END, stopZ } from "../utils/cameraPath";

// Модели из blender/make_assets.py (деревья, скамейки, урны, машины).
// Каждая модель рисуется одним InstancedMesh на материал — сотни штук
// стоят несколько вызовов отрисовки.

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function partsOf(scene, name) {
  const root = scene.children.find((c) => c.name === name);
  const parts = [];
  root?.traverse((o) => {
    if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material });
  });
  return parts;
}

const CAR_TYPES = ["car_a", "car_b", "car_c", "car_d", "car_e"];
const LANE = 2.4;
const dummy = new THREE.Object3D();

const FAR = STREET_END - 2; // дальний конец полос: машины исчезают в тумане
const CROSS_IN = CROSS_Z + 2.5; // полоса, по которой уезжают на поперечную улицу
const CROSS_OUT = CROSS_Z - 2.5; // полоса, по которой приезжают с неё
const CROSS_X = 80;

function buildLayout() {
  const rand = rng(11);
  const items = { tree: [], tree_b: [], bench: [], bin: [], car_a: [], car_b: [], car_c: [], car_d: [], car_e: [] };
  // зоны вывесок: здесь деревья и скамейки не ставим — они закрывали бы вывеску
  const heroZones = STOPS.map((s, i) =>
    s.side ? { side: s.side === "left" ? -1 : 1, z: stopZ(i) } : null,
  ).filter(Boolean);
  const blocked = (side, z) =>
    heroZones.some((h) => h.side === side && Math.abs(h.z - z) < 10);

  // деревья по обе стороны, со сдвигом друг относительно друга
  for (const side of [-1, 1]) {
    for (let z = side < 0 ? -26 : -37; z > STREET_END; z -= 22) {
      if (blocked(side, z)) continue;
      items[rand() > 0.5 ? "tree" : "tree_b"].push({
        x: side * (ROAD_HALF + 1.9),
        z,
        rot: rand() * Math.PI * 2,
        s: 0.85 + rand() * 0.3,
      });
    }
  }
  // скамейки лицом к дороге, рядом урна
  for (let k = 0, z = -30; z > STREET_END; k++, z -= 44) {
    const side = k % 2 ? 1 : -1;
    if (blocked(side, z)) continue;
    items.bench.push({ x: side * (EDGE - 1), z, rot: side < 0 ? -Math.PI / 2 : Math.PI / 2, s: 1 });
    items.bin.push({ x: side * (EDGE - 1.1), z: z - 2, rot: 0, s: 1 });
  }
  // припаркованные машины у бордюров (не на перекрёстке)
  for (const side of [-1, 1]) {
    for (let z = CROSS_Z - 10; z > STREET_END; z -= 8 + rand() * 6) {
      if (rand() > 0.45) continue;
      const type = CAR_TYPES[Math.floor(rand() * CAR_TYPES.length)];
      items[type].push({ x: side * (ROAD_HALF - 1.3), z, rot: side < 0 ? Math.PI : 0, s: 1 });
    }
  }
  // едущие машины. «in» едут к дому и сворачивают на поперечную улицу, «out»
  // приезжают с неё и сворачивают на улицу. В дом никто не заезжает.
  for (let i = 0; i < 12; i++) {
    const type = CAR_TYPES[i % CAR_TYPES.length];
    const dirIn = i % 2 === 0;
    const speed = 4 + rand() * 4;
    if (dirIn) {
      items[type].push({
        kind: "in", mode: "lane", speed,
        x: -LANE, z: CROSS_IN - rand() * (CROSS_IN - FAR), rot: Math.PI, s: 1,
      });
    } else {
      items[type].push({
        kind: "out", mode: "lane", speed,
        x: LANE, z: CROSS_OUT - rand() * (CROSS_OUT - FAR), rot: 0, s: 1,
      });
    }
  }
  return items;
}

function turnTo(it, target, dt) {
  let d = target - it.rot;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  it.rot += d * Math.min(1, dt * 7);
}

function stepCar(it, dt) {
  if (it.kind === "in") {
    if (it.mode === "lane") {
      it.z += it.speed * dt;
      turnTo(it, Math.PI, dt);
      if (it.z >= CROSS_IN) {
        it.mode = "cross";
        it.z = CROSS_IN;
      }
    } else {
      it.x -= it.speed * dt;
      turnTo(it, Math.PI / 2, dt);
      if (it.x < -CROSS_X) {
        it.mode = "lane";
        it.x = -LANE;
        it.z = FAR;
        it.rot = Math.PI;
      }
    }
  } else if (it.mode === "lane") {
    it.z -= it.speed * dt;
    turnTo(it, 0, dt);
    if (it.z < FAR) {
      it.mode = "cross";
      it.x = -CROSS_X;
      it.z = CROSS_OUT;
      it.rot = -Math.PI / 2;
    }
  } else {
    it.x += it.speed * dt;
    it.z = CROSS_OUT;
    turnTo(it, -Math.PI / 2, dt);
    if (it.x >= LANE) {
      it.mode = "lane";
      it.x = LANE;
      it.z = CROSS_OUT;
    }
  }
}

function InstancedProp({ parts, items, animated }) {
  const meshes = useRef([]);
  const meshObjects = useMemo(() => {
    return parts.map(({ geometry, material }) => {
      const m = new THREE.InstancedMesh(geometry, material, Math.max(items.length, 1));
      m.count = items.length;
      m.frustumCulled = false;
      return m;
    });
  }, [parts, items.length]);
  meshes.current = meshObjects;

  const write = () => {
    items.forEach((it, i) => {
      dummy.position.set(it.x, 0, it.z);
      dummy.rotation.set(0, it.rot, 0);
      dummy.scale.setScalar(it.s);
      dummy.updateMatrix();
      meshObjects.forEach((m) => m.setMatrixAt(i, dummy.matrix));
    });
    meshObjects.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  };
  useMemo(write, [meshObjects, items]);

  useFrame((_, delta) => {
    if (!animated) return;
    const dt = Math.min(delta, 0.05);
    items.forEach((it) => it.speed && stepCar(it, dt));
    write();
  });

  return meshObjects.map((m, i) => <primitive key={i} object={m} />);
}

export default function Props() {
  const { scene } = useGLTF("/models/props.glb");
  const layout = useMemo(buildLayout, []);
  // мигалки полиции: синий и красный по очереди
  const flashers = useMemo(() => {
    const found = {};
    scene.traverse((o) => {
      if (o.isMesh && (o.material.name === "police_blue" || o.material.name === "police_red")) {
        found[o.material.name] = o.material;
      }
    });
    return found;
  }, [scene]);
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * 5) % 2 === 0;
    if (flashers.police_blue) flashers.police_blue.emissiveIntensity = on ? 6 : 0.2;
    if (flashers.police_red) flashers.police_red.emissiveIntensity = on ? 0.2 : 6;
  });
  const names = Object.keys(layout);
  return names.map((name) => (
    <InstancedProp
      key={name}
      parts={partsOf(scene, name)}
      items={layout[name]}
      animated={name.startsWith("car")}
    />
  ));
}

useGLTF.preload("/models/props.glb");
