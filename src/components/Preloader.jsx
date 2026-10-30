import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { useSceneStore } from "../store/useSceneStore";

// Экран загрузки с «прожиганием»: пока грузятся модели и компилируются шейдеры,
// показываем кольцо прогресса; когда сцена готова — поверх неё выжигается дыра
// от центра: шумовое поле «очерёдности», светящаяся кромка, тлеющие угли.
// Идея — из конструктора анимаций (прожигание секции), только на WebGL-шейдере.

const MIN_SHOW_MS = 1400; // не мигать, даже если всё закэшировано
const BURN_MS = 2600;
// ?burn=12000 в адресе растягивает прожигание — удобно настраивать вид огня
const burnMs = () => Number(new URLSearchParams(window.location.search).get("burn")) || BURN_MS;

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uP;
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // «очередь прогорания»: ближе к центру — раньше, плюс крупный и мелкий шум (рваный фронт)
  float coarse = fbm(p * 3.2 + vec2(1.7, 9.2));
  float fine = fbm(p * 14.0 + uTime * 0.05);
  float v = length(p) * 0.95 + (coarse - 0.5) * 0.6 + (fine - 0.5) * 0.14;
  float t = mix(-0.4, 1.5, uP);
  float f = v - t;

  vec3 bg = vec3(0.02, 0.027, 0.06);
  if (f < 0.0) { gl_FragColor = vec4(0.0); return; }

  float flick = 0.65 + 0.35 * sin(uTime * 17.0 + fine * 24.0);
  if (f < 0.028) {
    vec3 hot = mix(vec3(1.0, 0.96, 0.72), vec3(1.0, 0.42, 0.08), f / 0.028);
    gl_FragColor = vec4(hot * (1.0 + 0.7 * flick), 1.0);
    return;
  }
  // тлеющая обугленная кромка, дальше — фон
  float glow = 1.0 - smoothstep(0.028, 0.14, f);
  vec3 ember = vec3(0.55, 0.16, 0.03) * flick * glow;
  float spark = step(0.992, hash(floor(gl_FragCoord.xy / 3.0) + floor(uTime * 8.0))) * (1.0 - smoothstep(0.03, 0.3, f));
  vec3 col = mix(vec3(0.07, 0.03, 0.02) + ember, bg, smoothstep(0.03, 0.22, f));
  col += vec3(1.0, 0.6, 0.2) * spark;
  gl_FragColor = vec4(col, 1.0);
}`;

function startBurn(canvas, onDone) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) {
    onDone();
    return () => {};
  }
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uP = gl.getUniformLocation(prog, "uP");
  const uTime = gl.getUniformLocation(prog, "uTime");

  // пониженное разрешение: это размытый огонь, Retina не нужна
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(uRes, canvas.width, canvas.height);

  const duration = burnMs();
  const t0 = performance.now();
  let raf;
  const frame = (now) => {
    const k = Math.min((now - t0) / duration, 1);
    const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    gl.uniform1f(uP, eased);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (k < 1) raf = requestAnimationFrame(frame);
    else onDone();
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}

export default function Preloader() {
  const { progress } = useProgress();
  const ready = useSceneStore((s) => s.ready);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState("loading"); // loading → burning → done
  const canvasRef = useRef(null);
  const start = useRef(performance.now());
  const target = useRef(0);
  target.current = ready ? 100 : Math.min(progress, 88);

  // страница стартует сверху и не прокручивается, пока идёт загрузка
  useEffect(() => {
    document.getElementById("boot")?.remove();
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  // плавное число процентов
  useEffect(() => {
    if (phase !== "loading") return;
    let raf;
    const tick = () => {
      setShown((v) => v + (target.current - v) * 0.07);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // всё готово и показали минимум — поджигаем
  useEffect(() => {
    if (phase !== "loading" || !ready || shown < 97) return;
    const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - start.current));
    const id = setTimeout(() => setPhase("burning"), wait);
    return () => clearTimeout(id);
  }, [phase, ready, shown]);

  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (phase !== "burning") return;
    window.scrollTo(0, 0);
    const finish = () => {
      document.documentElement.style.overflow = "";
      setPhase("done");
    };
    if (reduced) {
      const id = setTimeout(finish, 450);
      return () => clearTimeout(id);
    }
    return startBurn(canvasRef.current, finish);
  }, [phase, reduced]);

  if (phase === "done") return null;

  const pct = Math.round(Math.min(shown, 100));
  const text = pct < 35 ? "Загружаю модели…" : pct < 80 ? "Расставляю дома…" : "Включаю фонари…";
  const burning = phase === "burning";
  return (
    <>
      {/* огонь рисуется поверх живой сцены; до поджога канвас прозрачен и невидим */}
      <canvas ref={canvasRef} className={`preloader__fire ${burning ? "is-on" : ""}`} aria-hidden="true" />
      <div
        className={`boot ${burning ? "is-burning" : ""} ${burning && !reduced ? "is-transparent" : ""}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-label="Загрузка"
      >
        <div className="boot__mark">{pct}%</div>
        <svg className="boot__ring" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="46"
            style={{ animation: "none", strokeDashoffset: 289 - (289 * pct) / 100 }}
          />
        </svg>
        <div className="boot__text">{text}</div>
      </div>
    </>
  );
}
