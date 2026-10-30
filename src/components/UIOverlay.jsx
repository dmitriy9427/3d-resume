import { useSceneStore } from "../store/useSceneStore";
import { SKILLS, PROJECTS, CONTACTS } from "../data/resume";

function Card({ title, children }) {
  return (
    <div
      style={{
        background: "rgba(10, 20, 40, 0.45)",
        border: "1px solid rgba(120, 180, 255, 0.35)",
        borderRadius: "16px",
        padding: "1.4em",
        backdropFilter: "blur(6px)",
        boxShadow: "0 0 30px rgba(60, 140, 255, 0.15)",
      }}
    >
      <h3
        style={{
          margin: "0 0 0.6em",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function UIOverlay() {
  const scene = useSceneStore((state) => state.scene);
  const visible = scene === "city";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: visible ? "auto" : "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 1.2s ease",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "24px",
        padding: "8vh 6vw",
        alignContent: "start",
        fontFamily: "system-ui, sans-serif",
        color: "#eaf6ff",
      }}
    >
      <Card title="Навыки">
        <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
          {SKILLS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Card>

      <Card title="Проекты">
        {PROJECTS.map((p) => (
          <div key={p.title} style={{ marginBottom: "0.75em" }}>
            <strong>{p.title}</strong>
            <div style={{ opacity: 0.75, fontSize: "0.9em" }}>{p.desc}</div>
          </div>
        ))}
      </Card>

      <Card title="Контакты">
        {CONTACTS.map((c) => (
          <div key={c.label} style={{ marginBottom: "0.5em" }}>
            {c.label}:{" "}
            <a href={c.href} style={{ color: "#66ccff" }}>
              {c.value}
            </a>
          </div>
        ))}
      </Card>
    </div>
  );
}
