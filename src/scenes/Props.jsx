import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EDGE, ROAD_HALF, STREET_END } from "../utils/cameraPath";

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

const CAR_TYPES = ["car_a", "car_b", "car_c"];
const LANE = 2.4;
const dummy = new THREE.Object3D();

function buildLayout() {
  const rand = rng(11);
  const items = { tree: [], bench: [], bin: [], car_a: [], car_b: [], car_c: [] };

  // деревья по обе стороны, со сдвигом друг относительно друга
  for (const side of [-1, 1]) {
    for (let z = side < 0 ? -10 : -21; z > STREET_END - 10; z -= 22) {
      items.tree.push({
        x: side * (ROAD_HALF + 1.9),
        z,
        rot: rand() * Math.PI * 2,
        s: 0.9 + rand() * 0.35,
      });
    }
  }
  // скамейки лицом к дороге, рядом урна
  for (let k = 0, z = -16; z > STREET_END; k++, z -= 44) {
    const side = k % 2 ? 1 : -1;
    items.bench.push({ x: side * (EDGE - 1), z, rot: side < 0 ? -Math.PI / 2 : Math.PI / 2, s: 1 });
    items.bin.push({ x: side * (EDGE - 1.1), z: z - 2, rot: 0, s: 1 });
  }
  // припаркованные машины у бордюров
  for (const side of [-1, 1]) {
    for (let z = -14; z > STREET_END; z -= 8 + rand() * 6) {
      if (rand() > 0.45) continue;
      const type = CAR_TYPES[Math.floor(rand() * 3)];
      items[type].push({ x: side * (ROAD_HALF - 1.3), z, rot: side < 0 ? Math.PI : 0, s: 1 });
    }
  }
  // едущие машины: полосы по обе стороны от оси
  for (let i = 0; i < 8; i++) {
    const lane = i % 2 ? 1 : -1;
    const type = CAR_TYPES[i % 3];
    items[type].push({
      x: lane * LANE,
      z: 14 - rand() * (14 - STREET_END),
      rot: lane < 0 ? Math.PI : 0,
      s: 1,
      speed: 4 + rand() * 4,
      dir: lane < 0 ? 1 : -1,
    });
  }
  return items;
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
    items.forEach((it) => {
      if (!it.speed) return;
      it.z += it.dir * it.speed * dt;
      if (it.z < STREET_END - 20) it.z = 16;
      if (it.z > 16) it.z = STREET_END - 20;
    });
    write();
  });

  return meshObjects.map((m, i) => <primitive key={i} object={m} />);
}

export default function Props() {
  const { scene } = useGLTF("/models/props.glb");
  const layout = useMemo(buildLayout, []);
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
