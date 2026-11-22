import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Factory 23 Workforce",
    short_name: "Factory 23",
    description:
      "Offline-first workforce management for tasks, projects, meetings, attendance, and tracking.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait",
    background_color: "#0A1D25",
    theme_color: "#0A1D25",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Open workforce dashboard",
        url: "/dashboard",
      },
      {
        name: "Tasks",
        short_name: "Tasks",
        description: "Open task operations board",
        url: "/operations/all-tasks",
      },
      {
        name: "Projects",
        short_name: "Projects",
        description: "Open projects workspace",
        url: "/projects",
      },
    ],
    categories: ["business", "productivity"],
    prefer_related_applications: false,
  };
}

