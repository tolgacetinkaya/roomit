export const controlCopy = {
  running: "Running AI tools",
  allTools: "View all tools",
  resources: "View live resources",
  ram: (value: string) => `RAM · ${value}`,
  activity: {
    live: "No AI tools are running.",
    paused: "Monitoring is paused. Resume it in Live resources.",
    unavailable: "Live measurements are unavailable.",
    waiting: "Checking which tools are running…",
  },
} as const;
