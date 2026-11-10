import { useEffect, useRef, useState } from "react";
import { FISH, createGame } from "../game/fishing";
import { fishRt } from "../game/fishingRuntime";
import { scrollState, useSceneStore } from "../store/useSceneStore";

// ─── Рыбалка: интерфейс поверх сцены ────────────────────────────────────────
// Кнопка «Порыбачить» в конце прогулки, подсказка, шкалы, карточка улова.
// Что здесь важно для производительности: React перерисовывает этот компонент
// только при смене фазы игры. Шкалы (сила замаха, натяжение) меняются каждый
// кадр, поэтому их ширину пишем прямо в style через ref, минуя React.

function FishIcon({ color }) {
  return (
    <svg className="fish__icon" viewBox="0 0 120 60" aria-hidden="true">
      <path d="M8 30 L30 12 L30 48 Z" fill={color} opacity="0.85" />
      <ellipse cx="68" cy="30" rx="44" ry="20" fill={color} />
      <path d="M52 12 Q70 0 86 14 Z" fill={color} opacity="0.7" />
      <circle cx="96" cy="25" r="4" fill="#0b1020" />
      <circle cx="97" cy="24" r="1.4" fill="#fff" />
    </svg>
  );
}

export default function FishingHud({ atLastStop }) {
  const fishing = useSceneStore((s) => s.fishing);
  const view = useSceneStore((s) => s.fishView);
  const caught = useSceneStore((s) => s.caught);
  const setFishing = useSceneStore((s) => s.setFishing);
  const [atEnd, setAtEnd] = useState(false);
  const power = useRef(null);
  const tension = useRef(null);
  const progress = useRef(null);

  // Покадровый цикл: шкалы и проверка «докрутили ли до конца».
  useEffect(() => {
    let raf;
    const tick = () => {
      const g = fishRt.game;
      if (power.current) power.current.style.transform = `scaleX(${g.power})`;
      if (tension.current) {
        tension.current.style.transform = `scaleX(${g.tension})`;
        // цвет от зелёного (120°) к красному (0°) по мере натяжения
        tension.current.style.background = `hsl(${120 - g.tension * 120} 80% 55%)`;
      }
      if (progress.current) progress.current.style.transform = `scaleX(${g.progress})`;
      // setAtEnd с тем же значением React пропускает — лишних перерисовок нет
      setAtEnd(scrollState.target > 0.992);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  // Пока рыбачим, страница не прокручивается (иначе колесо мыши увело бы
  // камеру с пирса). Пробел — та же кнопка, что и мышь; Esc — выйти.
  useEffect(() => {
    if (!fishing) return undefined;
    const root = document.documentElement;
    root.style.overflow = "hidden";
    const key = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        fishRt.pressed = e.type === "keydown";
        if (fishRt.pressed && !e.repeat) fishRt.tap = true;
      } else if (e.code === "Escape" && e.type === "keydown") {
        setFishing(false);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      root.style.overflow = "";
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      fishRt.pressed = fishRt.tap = false;
      fishRt.game = createGame(); // вышли — игра начинается заново
    };
  }, [fishing, setFishing]);

  if (!fishing) {
    return atLastStop && atEnd ? (
      <button className="fish__start" onClick={() => setFishing(true)}>
        🎣 Порыбачить с пирса
      </button>
    ) : null;
  }

  const press = (down) => (e) => {
    e.preventDefault();
    fishRt.pressed = down;
    if (down) fishRt.tap = true;
  };
  const { phase, message, result } = view;
  const count = Object.keys(caught).length;

  return (
    <>
      {/* «Кнопка» во весь экран: ловит мышь и палец. touch-action: none в CSS —
          чтобы браузер не принял удержание пальца за прокрутку или масштаб. */}
      <div
        className="fish__pad"
        onPointerDown={press(true)}
        onPointerUp={press(false)}
        onPointerCancel={press(false)}
        onPointerLeave={press(false)}
      />

      <div className={`fish__panel is-${phase}`}>
        <p className="fish__msg" role="status">
          {message}
        </p>
        {phase === "charging" && (
          <div className="fish__bar" aria-label="Сила заброса">
            <i ref={power} />
          </div>
        )}
        {phase === "reeling" && (
          <>
            <div className="fish__bar" aria-label="Натяжение лески">
              <i ref={tension} />
            </div>
            <div className="fish__bar fish__bar--thin" aria-label="Сколько осталось вытянуть">
              <i ref={progress} />
            </div>
          </>
        )}
      </div>

      {phase === "caught" && result && (
        <div className="fish__catch" style={{ "--accent": result.fish.color }}>
          <FishIcon color={result.fish.color} />
          <p className="card__kicker">
            {result.fish.name} · {String(result.kg).replace(".", ",")} кг
          </p>
          <h2 className="card__title">{result.fish.skill}</h2>
          <p className="card__text">{result.fish.note}</p>
          <p className="fish__more">Нажмите, чтобы забросить ещё</p>
        </div>
      )}

      <div className="fish__top">
        <span className="fish__count" title={FISH.map((f) => (caught[f.id] ? f.skill : "?")).join(" · ")}>
          Улов: {count}/{FISH.length}
        </span>
        <button className="fish__exit" onClick={() => setFishing(false)}>
          Закончить
        </button>
      </div>
    </>
  );
}
