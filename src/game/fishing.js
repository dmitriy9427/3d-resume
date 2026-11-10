// ─── Рыбалка: правила игры ──────────────────────────────────────────────────
// Здесь только логика — ни three.js, ни React. Игра — это объект состояния и
// функция step(), которая двигает его на один кадр вперёд. Так устроено
// большинство игр: «состояние + шаг», а картинка (FishingRig.jsx) и интерфейс
// (FishingHud.jsx) лишь читают состояние и рисуют его.
//
// Конечный автомат (в каждый момент игра ровно в одной фазе):
//
//   idle ──зажали──▶ charging ──отпустили──▶ flying ──долетел──▶ waiting
//    ▲                                                              │ ждём
//    │                                                              ▼
//    ├──◀── lost ◀── не успели / порвали / упустили ◀── bite ◀── клюёт!
//    │                                                   │ нажали вовремя
//    └──◀── caught ◀───────── вытащили ◀───────────── reeling
//
// Управление — одна кнопка (мышь, палец или пробел), у неё два состояния:
// зажата или нет. Всё остальное игра выводит из этого сама.

/** Рыбы. skill — навык из резюме; strength — как сильно тянет; chance — как часто клюёт. */
export const FISH = [
  { id: "karas", name: "Карась", skill: "HTML", note: "Клюёт везде и всегда. Основа любого улова.", kg: [0.2, 0.6], strength: 0.6, chance: 5, color: "#c9a25a" },
  { id: "plotva", name: "Плотва", skill: "SCSS", note: "Блестит чешуёй: вложенность, миксины, переменные.", kg: [0.2, 0.5], strength: 0.6, chance: 5, color: "#b9c4d6" },
  { id: "okun", name: "Окунь", skill: "JavaScript", note: "Полосатый и колючий, но без него уха не уха.", kg: [0.3, 0.9], strength: 0.8, chance: 4, color: "#e2c544" },
  { id: "lesch", name: "Лещ", skill: "React", note: "Держится стаей компонентов. Тянет ровно, без рывков.", kg: [0.8, 2.2], strength: 0.9, chance: 4, color: "#5ec8e8" },
  { id: "sudak", name: "Судак", skill: "TypeScript", note: "Осторожный: пока типы не сойдутся — не клюнет.", kg: [1, 3], strength: 1.0, chance: 3, color: "#4a82d8" },
  { id: "schuka", name: "Щука", skill: "GSAP", note: "Атакует рывком — по кривой ease-out.", kg: [1.5, 5], strength: 1.2, chance: 2, color: "#7bd66a" },
  { id: "som", name: "Сом", skill: "Three.js", note: "Живёт на глубине, в трёх измерениях.", kg: [4, 12], strength: 1.35, chance: 1.5, color: "#8a7fd8" },
  { id: "gold", name: "Золотая рыбка", skill: "GLSL", note: "Переливается шейдером. Исполняет одно желание: 60 кадров в секунду.", kg: [0.1, 0.2], strength: 1.1, chance: 1, color: "#ffb640" },
];

const CAST_MIN = 7; // метров: самый слабый заброс
const CAST_MAX = 20;
const CHARGE_PERIOD = 1.1; // с: за сколько шкала силы проходит от 0 до 1
const FLY_TIME = 0.9;
const BITE_WINDOW = 0.9; // с: сколько есть на подсечку

export const MESSAGES = {
  idle: "Зажмите и держите — замах. Отпустите — заброс",
  charging: "Чем полнее шкала, тем дальше заброс",
  flying: "",
  waiting: "Ждём поклёвку… Не трогайте, пока поплавок не нырнёт",
  bite: "Клюёт! Жмите!",
  reeling: "Держите — мотаем. Рыба рвётся — отпустите",
  caught: "",
};

export function createGame() {
  return {
    phase: "idle",
    t: 0, // время в текущей фазе
    power: 0, // сила замаха 0..1
    dist: CAST_MIN, // на сколько метров улетел поплавок
    biteAt: 0, // когда клюнет (секунд от начала ожидания)
    nextNibble: 0, // когда рыба в следующий раз «попробует» наживку
    dip: 0, // насколько поплавок притоплен 0..1 (для картинки)
    fish: null,
    progress: 0, // сколько лески выбрано 0..1
    tension: 0, // натяжение 0..1; дошло до 1 — леска рвётся
    pulling: false, // рыба сейчас делает рывок
    pullT: 0, // сколько осталось до смены «рывок / отдых»
    slack: 0, // сколько секунд леска совсем не выбирается
    wasPressed: false,
    result: null, // { fish, kg }
    message: MESSAGES.idle,
  };
}

/** Случайная рыба с учётом chance: карась попадается в 5 раз чаще золотой рыбки. */
export function pickFish(rand = Math.random) {
  const total = FISH.reduce((sum, f) => sum + f.chance, 0);
  let roll = rand() * total;
  for (const f of FISH) {
    roll -= f.chance;
    if (roll <= 0) return f;
  }
  return FISH[0];
}

function go(g, phase, message = MESSAGES[phase]) {
  g.phase = phase;
  g.t = 0;
  g.message = message;
}

function lose(g, why) {
  g.dip = 0;
  go(g, "lost", why);
}

/**
 * Один шаг игры.
 * @param g       состояние (меняется на месте)
 * @param dt      сколько секунд прошло с прошлого кадра
 * @param pressed зажата ли кнопка прямо сейчас
 * @param rand    источник случайности (подменяется в тестах)
 */
export function step(g, dt, pressed, rand = Math.random) {
  // «Нажали» — это момент: в прошлом кадре не было зажато, а в этом зажато.
  const justPressed = pressed && !g.wasPressed;
  const justReleased = !pressed && g.wasPressed;
  g.wasPressed = pressed;
  g.t += dt;

  switch (g.phase) {
    case "idle":
      if (justPressed) go(g, "charging");
      break;

    case "charging": {
      // Шкала ходит туда-обратно (треугольная волна): 0 → 1 → 0 → 1…
      const x = (g.t / CHARGE_PERIOD) % 2;
      g.power = x < 1 ? x : 2 - x;
      if (justReleased) {
        g.dist = CAST_MIN + g.power * (CAST_MAX - CAST_MIN);
        go(g, "flying");
      }
      break;
    }

    case "flying":
      if (g.t >= FLY_TIME) {
        g.biteAt = 2.5 + rand() * 4;
        g.nextNibble = 0.8 + rand() * 1.5;
        go(g, "waiting");
      }
      break;

    case "waiting":
      g.dip = Math.max(0, g.dip - dt * 1.5); // поплавок всплывает обратно
      // ложные поклёвки: рыба трогает наживку, поплавок вздрагивает
      if (g.t > g.nextNibble && g.t < g.biteAt - 0.6) {
        g.dip = 0.35;
        g.nextNibble = g.t + 0.7 + rand() * 1.6;
      }
      if (justPressed) {
        lose(g, "Рано! Рыба ещё не взяла наживку");
      } else if (g.t >= g.biteAt) {
        g.fish = pickFish(rand);
        g.dip = 1;
        go(g, "bite");
      }
      break;

    case "bite":
      if (justPressed) {
        g.progress = 0.15;
        g.tension = 0.3;
        g.pulling = false;
        g.pullT = 0.8 + rand() * 0.8;
        g.slack = 0;
        go(g, "reeling");
      } else if (g.t > BITE_WINDOW) {
        lose(g, "Сошла. Подсекать надо сразу, как поплавок нырнул");
      }
      break;

    case "reeling": {
      // Рыба чередует рывки и отдых.
      g.pullT -= dt;
      if (g.pullT <= 0) {
        g.pulling = !g.pulling;
        g.pullT = g.pulling ? 0.7 + rand() * 0.8 : 1.0 + rand() * 1.4;
      }
      const k = g.fish.strength;
      if (pressed) {
        // мотаем: леска выбирается, натяжение растёт; в рывок — растёт быстро
        g.progress += (dt * (g.pulling ? 0.06 : 0.22)) / Math.sqrt(k);
        g.tension += dt * (g.pulling ? 0.85 * k : 0.22);
      } else {
        // отпустили: натяжение падает, но рыба уходит обратно
        g.progress -= dt * (g.pulling ? 0.1 * k : 0.03);
        g.tension -= dt * 0.7;
      }
      g.tension = Math.max(0, g.tension);
      g.dip = 0.6;
      g.message = g.pulling ? "Рвётся! Отпустите!" : MESSAGES.reeling;
      if (g.progress <= 0) {
        g.progress = 0;
        g.slack += dt;
      } else {
        g.slack = 0;
      }
      if (g.tension >= 1) lose(g, "Леска лопнула. Когда рыба рвётся — отпускайте");
      else if (g.slack > 2.5) lose(g, "Ушла. Слишком долго не подматывали");
      else if (g.progress >= 1) {
        const [min, max] = g.fish.kg;
        g.result = { fish: g.fish, kg: Math.round((min + rand() * (max - min)) * 10) / 10 };
        g.dip = 0;
        go(g, "caught");
      }
      break;
    }

    case "caught":
      if (justPressed && g.t > 0.7) go(g, "idle");
      break;

    case "lost":
      if (g.t > 2) go(g, "idle");
      break;
  }
}

/** Как далеко поплавок от рыбака сейчас: при вываживании он подтягивается к пирсу. */
export function floatDistance(g) {
  return g.phase === "reeling" ? g.dist + (2.5 - g.dist) * g.progress : g.dist;
}
