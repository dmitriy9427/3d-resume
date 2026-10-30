# 3D-резюме: прогулка по ночному городу

Интерактивное резюме. Вы сидите в комнате на высоком этаже, прокручиваете страницу — камера вылетает в окно, спускается на улицу и идёт по ночному городу к морю. На зданиях вывески с проектами и опытом, внизу карточка с описанием.

**Демо:** https://dmitriy9427.github.io/3d-resume/ · **Текстовая версия:** `/resume/` · **Основное резюме:** https://dmitriy9427.github.io/resume/

## Запуск

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # сборка в dist/
```

Модели для сцены (деревья, машины, мебель комнаты) генерирует Blender из кода:

```bash
blender -b -P blender/make_assets.py   # → public/models/props.glb и room.glb
```

Готовые `.glb` лежат в репозитории, Blender нужен только если вы меняете модели.

## Стек

Astro · React · three.js через `@react-three/fiber` и `@react-three/drei` · zustand · Blender 5 (Python-скрипт) · GitHub Pages.

## Документация

Подробный учебник — как всё устроено, что где менять и как добавить новое: **[docs/TUTORIAL.md](docs/TUTORIAL.md)**.

## Где что менять (кратко)

| Хочу… | Файл |
| --- | --- |
| поменять тексты, добавить остановку | `src/data/resume.js` |
| длина улицы, расстояния, путь камеры | `src/utils/cameraPath.js` |
| поведение камеры, поворот к вывескам, свободный обзор | `src/scenes/CameraRig.jsx` |
| луна, небо, звёзды | `src/scenes/Sky.jsx` |
| здания, дорога, море, фонари, вывески | `src/scenes/Street.jsx` |
| деревья, скамейки, машины | `src/scenes/Props.jsx` + `blender/make_assets.py` |
| комната, экраны, свет в комнате | `src/scenes/IntroScene.jsx` + `blender/make_assets.py` |
| прелоадер с «прожиганием» | `src/components/Preloader.jsx` (`?burn=12000` — медленно, для настройки) |
| карточки, подсказки, мобильная вёрстка | `src/components/Overlay.jsx` + `src/styles/journey.css` |
