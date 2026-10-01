import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** نشان هندسی «ه» — همان زبان بصری BrandMark و public/logo.svg */
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12304A"/><stop offset="0.55" stop-color="#1F5F7A"/><stop offset="1" stop-color="#19B394"/></linearGradient></defs><rect x="0.5" y="0.5" width="29" height="29" rx="9.5" fill="url(#hg)"/><g fill="#ffffff"><path d="M15.47,7.1 l-1.3,1.85 c-0.2,0.29 -0.54,0.47 -0.9,0.47 h-7.1 V7.09 Z"/><polygon points="24.3,7.1 13.14,22.91 5.7,22.91 16.86,7.1"/><path d="M14.53,22.91 l1.31,-1.86 c0.2,-0.29 0.54,-0.47 0.9,-0.47 h7.09 v2.33 Z"/></g><path d="M25.8,3.5 c0.3,0.75 0.75,1.2 1.4,1.4 c-0.65,0.2 -1.1,0.65 -1.4,1.4 c-0.3,-0.75 -0.75,-1.2 -1.4,-1.4 c0.65,-0.2 1.1,-0.65 1.4,-1.4 Z" fill="#ffffff" fill-opacity="0.95"/></svg>`;

export default function Icon() {
  const dataUri = `data:image/svg+xml;base64,${btoa(MARK_SVG)}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={dataUri} width={512} height={512} alt="" />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
