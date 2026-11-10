import { useEffect, useRef, useState } from "react";
import { STOPS } from "../data/resume";
import { scrollState, useSceneStore } from "../store/useSceneStore";
import { stopScroll } from "../utils/cameraPath";
import { asset } from "../utils/url";
import FishingHud from "./FishingHud";

export default function Overlay() {
  const active = useSceneStore((s) => s.activeStop);
  const fishing = useSceneStore((s) => s.fishing);
  const [open, setOpen] = useState(false);
  // при смене остановки карточка снова сворачивается
  useEffect(() => setOpen(false), [active]);
  const bar = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      if (bar.current)
        bar.current.style.transform = `scaleX(${scrollState.current})`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  const goTo = (i) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: stopScroll(i) * max, behavior: "smooth" });
  };

  return (
    <div className={`hud ${fishing ? "is-fishing" : ""}`}>
      <div className="hud__bar" ref={bar} />
      <a className="hud__text" href={asset("/resume/")}>
        Текстовая версия
      </a>

      {STOPS.map((s, i) => (
        <article
          key={s.id}
          className={`card ${s.side === "left" ? "card--left" : ""} ${
            i === active ? "is-active" : ""
          } ${i === active && open ? "is-open" : ""}`}
          onClick={(e) => {
            if (e.target.closest("a")) return;
            setOpen((v) => !v);
          }}
          aria-hidden={i !== active}
          style={{ "--accent": s.accent || "#6aa9ff" }}
        >
          <p className="card__kicker">{s.kicker}</p>
          <h2 className="card__title">{s.title}</h2>
          <p className="card__text">{s.text}</p>
          {s.stack && <p className="card__stack">{s.stack}</p>}
          <div className="card__links">
            {s.href && (
              <a href={s.href} target="_blank" rel="noopener" tabIndex={i === active ? 0 : -1}>
                Открыть ↗
              </a>
            )}
            {s.links?.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener" tabIndex={i === active ? 0 : -1}>
                {l.label}
              </a>
            ))}
          </div>
        </article>
      ))}

      {active === 0 && <div className="hint">Листайте вниз ↓</div>}

      <FishingHud atLastStop={active === STOPS.length - 1} />

      <nav className="dots" aria-label="Остановки">
        {STOPS.map((s, i) => (
          <button
            key={s.id}
            className={i === active ? "is-active" : ""}
            onClick={() => goTo(i)}
            aria-label={s.title}
          />
        ))}
      </nav>
    </div>
  );
}
