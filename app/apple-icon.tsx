import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = {
  width: 180,
  height: 180,
};

export default function AppleIcon() {
  
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          background:
            "linear-gradient(150deg, #75ADAF 0%, #113948 45%, #0A1D25 100%)",
          color: "#FFFFFF",
          fontSize: 64,
          fontWeight: 800,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        F
      </div>
    ),
    size,
  );
}

