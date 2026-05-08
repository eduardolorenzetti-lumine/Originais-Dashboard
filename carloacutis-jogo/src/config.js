export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 720;

const runtimeConfig = window.CARLO_GAME_CONFIG ?? {};

export const LANES = [570];

export const MAPS = [
  {
    id: "milan-test",
    label: "Milan Test Route",
    pointTarget: 50,
    speedStart: 360,
    speedMax: 1800,
    speedStep: 10,
    churchEvery: 4,
    lifeMoments: ["Primary School", "Milan Parish", "Rajesh", "Mother", "Father"],
  },
];

export const FILM_URL = runtimeConfig.finalUrl || "https://lumine.tv";
