// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// На GitHub Pages сайт живёт в подпапке (/3d-resume/): путь задаёт BASE_URL
// в .github/workflows/pages.yml. Локально BASE_URL не нужен — сайт на «/».
export default defineConfig({
  site: "https://dmitriy9427.github.io",
  base: process.env.BASE_URL ?? "/",
  integrations: [react()],
});
