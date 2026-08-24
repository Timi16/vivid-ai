// App-wide metadata. Titles and descriptions read from here so they cannot
// drift between the layout, the manifest and the share cards.
export const siteConfig = {
  name: "Vivid AI",
  description: "Vivid AI. Ask anything, and see it come to life.",
} as const;

export type SiteConfig = typeof siteConfig;
