// Narration voices. IDs match app/services/voices.py on the API.
export const VOICES = [
  ["aria", "Aria", "American"],
  ["guy", "Guy", "American"],
  ["neerja", "Neerja", "Indian"],
  ["prabhat", "Prabhat", "Indian"],
  ["sonia", "Sonia", "British"],
];

export const LENGTHS = [
  ["overview", "Short", "About 2 minutes"],
  ["detailed", "Detailed", "About 4 minutes"],
  ["deep", "Deep dive", "About 8 minutes"],
];

export const voiceName = (id) => VOICES.find(([voice]) => voice === id)?.[1] ?? "Aria";
