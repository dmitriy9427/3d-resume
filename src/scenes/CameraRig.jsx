import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STOPS } from "../data/resume";
import { EDGE, PATH, PATH_LENGTH, stopZ } from "../utils/cameraPath";
import { initScroll, scrollState, useSceneStore } from "../store/useSceneStore";

const sstep = (e0, e1, x) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const yaw = useRef(0);
  const last = useRef(-1);
  const fwd = useRef(new THREE.Vector3());

  useEffect(() => initScroll(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    scrollState.current +=
      (scrollState.target - scrollState.current) * (1 - Math.exp(-dt * 5));
    const u = THREE.MathUtils.clamp(scrollState.current, 0, 0.9999);
    const p = PATH.getPointAt(u);
    const ahead = PATH.getPointAt(Math.min(1, u + 0.004));
    fwd.current.subVectors(ahead, p).normalize();

    // покачивание при ходьбе — только на улице
    const walking = sstep(-5, -12, p.z);
    const bob = Math.sin(u * PATH_LENGTH * 1.9) * 0.03 * walking;
    camera.position.set(p.x, p.y + bob, p.z);

    // поворот головы к ближайшей вывеске
    let targetYaw = Math.atan2(-fwd.current.x, -fwd.current.z);
    let active = -1;
    let bestDz = Infinity;
    STOPS.forEach((s, i) => {
      if (!s.side) return;
      const sz = stopZ(i);
      const dz = p.z - sz;
      const sx = s.side === "left" ? -EDGE : EDGE;
      const angle = THREE.MathUtils.clamp(Math.atan2(-(sx - p.x), dz), -1.1, 1.1);
      targetYaw += angle * 0.75 * sstep(30, 18, dz) * sstep(2, 10, dz);
      if (dz >= 8 && dz < bestDz) {
        bestDz = dz;
        active = i;
      }
    });
    if (p.z > -6) active = 0;
    else if (active < 0) active = STOPS.length - 1;

    yaw.current += (targetYaw - yaw.current) * (1 - Math.exp(-dt * 4));
    camera.rotation.set(0.16 * walking, yaw.current, 0, "YXZ");

    if (last.current !== active) {
      last.current = active;
      useSceneStore.getState().setActiveStop(active);
    }
  });

  return null;
}
