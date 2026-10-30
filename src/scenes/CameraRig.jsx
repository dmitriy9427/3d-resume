import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STOPS } from "../data/resume";
import { EDGE, PATH, STOP_GAP, PATH_LENGTH, PROMENADE_END, STREET_END, scrollToPath, stopZ } from "../utils/cameraPath";
import { initScroll, scrollState, useSceneStore } from "../store/useSceneStore";

const sstep = (e0, e1, x) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const last = useRef(-1);
  const fwd = useRef(new THREE.Vector3());

  // Свободный обзор: тянете мышью/пальцем — смотрите по сторонам, отпускаете —
  // камера плавно возвращается к пути.
  const look = useRef({ yaw: 0, pitch: 0, ty: 0, tp: 0, drag: null, idle: 0 });

  useEffect(() => initScroll(), []);

  useEffect(() => {
    const L = look.current;
    const isCanvas = (e) => e.target instanceof HTMLCanvasElement;
    const down = (e) => {
      if (!isCanvas(e)) return;
      L.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const move = (e) => {
      if (!L.drag || e.pointerId !== L.drag.id) return;
      const dx = e.clientX - L.drag.x;
      const dy = e.clientY - L.drag.y;
      L.drag.x = e.clientX;
      L.drag.y = e.clientY;
      L.ty = THREE.MathUtils.clamp(L.ty + dx * 0.0045, -1.6, 1.6);
      L.tp = THREE.MathUtils.clamp(L.tp + dy * 0.0035, -0.7, 0.7);
      L.idle = 0;
    };
    const up = () => {
      L.drag = null;
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    scrollState.current +=
      (scrollState.target - scrollState.current) * (1 - Math.exp(-dt * 5));
    const u = THREE.MathUtils.clamp(scrollToPath(scrollState.current), 0, 0.9999);
    const p = PATH.getPointAt(u);
    const ahead = PATH.getPointAt(Math.min(1, u + 0.004));
    fwd.current.subVectors(ahead, p).normalize();

    // покачивание при ходьбе — только на улице
    const walking = sstep(-24, -32, p.z);
    const bob = Math.sin(u * PATH_LENGTH * 1.9) * 0.03 * walking;
    camera.position.set(p.x, p.y + bob, p.z);

    // поворот головы к ближайшей вывеске
    let targetYaw = Math.atan2(-fwd.current.x, -fwd.current.z);
    // наклон по касательной (спуск из окна) + взгляд вверх на вывеску
    let targetPitch = Math.asin(THREE.MathUtils.clamp(fwd.current.y, -1, 1));
    let active = -1;
    let bestDz = Infinity;
    STOPS.forEach((s, i) => {
      if (!s.side) return;
      const sz = stopZ(i);
      const dz = p.z - sz;
      const sx = s.side === "left" ? -EDGE : EDGE;
      const angle = THREE.MathUtils.clamp(Math.atan2(-(sx - p.x), Math.max(dz, 6)), -1.45, 1.45);
      const w = sstep(STOP_GAP + 23, STOP_GAP + 9, dz) * sstep(STOP_GAP - 15, STOP_GAP - 5, dz);
      targetYaw += angle * 1.0 * w;
      const dist = Math.hypot(sx - p.x, Math.max(dz, 6));
      targetPitch += Math.atan2(4.6 - p.y, dist) * 0.8 * w;
      if (dz >= STOP_GAP - 6 && dz < bestDz) {
        bestDz = dz;
        active = i;
      }
    });
    if (p.z > -6 && p.y > 6) active = 0;
    else if (active < 0) active = STOPS.length - 1;

    yaw.current += (targetYaw - yaw.current) * (1 - Math.exp(-dt * 3));
    // у моря: шире обзор и взгляд чуть вниз — видны и луна, и её дорожка на воде
    const sea = sstep(STREET_END + 10, PROMENADE_END - 20, p.z);
    const fov = 55 + 15 * sea;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    pitch.current += (targetPitch + (0.12 - 0.22 * sea) * walking - pitch.current) * (1 - Math.exp(-dt * 4));
    // свободный обзор: цель плавно возвращается в ноль через ~1.2 с после отпускания
    const L = look.current;
    if (!L.drag) {
      L.idle += dt;
      if (L.idle > 1.2) {
        const k = 1 - Math.exp(-dt * 2.5);
        L.ty -= L.ty * k;
        L.tp -= L.tp * k;
      }
    }
    L.yaw += (L.ty - L.yaw) * (1 - Math.exp(-dt * 14));
    L.pitch += (L.tp - L.pitch) * (1 - Math.exp(-dt * 14));
    camera.rotation.set(
      THREE.MathUtils.clamp(pitch.current + L.pitch, -1.2, 1.2),
      yaw.current + L.yaw,
      0,
      "YXZ",
    );

    if (last.current !== active) {
      last.current = active;
      useSceneStore.getState().setActiveStop(active);
    }
  });

  return null;
}
