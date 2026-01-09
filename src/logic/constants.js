export const Action = Object.freeze({
    KEEP: "KEEP",
    SELL: "SELL",
    RECYCLE: "RECYCLE",
    UNKNOWN: "UNKNOWN",
    PREFERENCE: "PREFERENCE"
});

export const QuestStatus = Object.freeze({
    DONE: "DONE",
    IN_PROGRESS: "IN_PROGRESS",
    TBD: "TBD",
    UNKNOWN: "UNKNOWN"
});

export const STATIONS_DATA = [
  { id: "Gunsmith",           min: 0, max: 3 },
  { id: "Gear Bench",         min: 0, max: 3 },
  { id: "Medical Lab",        min: 0, max: 3 },
  { id: "Explosives Station", min: 0, max: 3 },
  { id: "Utility Station",    min: 0, max: 3 },
  { id: "Refiner",            min: 0, max: 3 },
  { id: "Scrappy",            min: 1, max: 5 }
];

export const GET_DEFAULT_LEVELS = () => {
  return STATIONS_DATA.reduce((acc, station) => {
    acc[station.id] = station.min; 
    return acc;
  }, {});
};