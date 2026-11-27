export const workspacePages = {
  control: { title: "AI storage on disk", description: "" },
  tools: { title: "Your AI tools", description: "" },
  activity: { title: "Live resources", description: "" },
  ai: { title: "AI storage map", description: "" },
  overview: { title: "Overview", description: "" },
  projects: { title: "Projects", description: "Open workspaces, recent sessions, and measured project storage." },
  largest: { title: "Large items", description: "" },
  details: { title: "Scan details", description: "Measured locations, exclusions, and gaps in the latest scan." },
} as const;

export const scanTimeCopy = {
  label: (duration: string) => `Scan time ${duration}`,
  underOneSecond: "<1s",
} as const;
