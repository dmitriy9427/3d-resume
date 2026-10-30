// Путь к файлу из public/ с учётом base (на GitHub Pages сайт лежит в подпапке).
//   asset("/models/room.glb") → "/3d-resume/models/room.glb"
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const asset = (path) => `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
