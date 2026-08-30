import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loop",
    short_name: "Loop",
    description: "Generate a running or cycling route of the distance you want.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe8",
    theme_color: "#f4efe8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
