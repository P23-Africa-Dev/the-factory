import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = {
  width: 512,
  height: 512,
};

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 30% 30%, #75ADAF 0%, #0A1D25 55%, #07171E 100%)",
          color: "#FFFFFF",
          fontSize: 148,
          fontWeight: 800,
          letterSpacing: -4,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        F23
      </div>
    ),
    size,
  );
}

