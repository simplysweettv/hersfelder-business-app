import { ImageResponse } from "next/og";

/**
 * Rendert Karussell-Slides als gestochen scharfe Marken-Grafiken
 * (kein KI-Bild → perfekt lesbarer Text, schnell, günstig).
 * Format 1080×1350 (4:5, ideal für Instagram-Karussells).
 */

const GREEN = "#1a5c2a";
const RED = "#c0392b";

export type CarouselSlide =
  | { kind: "cover"; title: string; subtitle?: string }
  | { kind: "point"; heading: string; body?: string };

export async function renderSlide(
  slide: CarouselSlide,
  index: number,
  total: number,
): Promise<Buffer> {
  const counter = `${index} / ${total}`;

  const inner =
    slide.kind === "cover"
      ? {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
              height: "100%",
              padding: "90px",
              textAlign: "center",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: 70,
                    fontWeight: 800,
                    color: "white",
                    lineHeight: 1.08,
                  },
                  children: slide.title,
                },
              },
              slide.subtitle
                ? {
                    type: "div",
                    props: {
                      style: {
                        marginTop: 28,
                        fontSize: 34,
                        color: "rgba(255,255,255,0.8)",
                        lineHeight: 1.3,
                      },
                      children: slide.subtitle,
                    },
                  }
                : null,
            ],
          },
        }
      : {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              padding: "100px",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 96,
                    height: 96,
                    borderRadius: 48,
                    background: RED,
                    color: "white",
                    fontSize: 48,
                    fontWeight: 800,
                    marginBottom: 44,
                  },
                  children: String(index - 1),
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: 58,
                    fontWeight: 800,
                    color: "white",
                    lineHeight: 1.12,
                    marginBottom: slide.body ? 26 : 0,
                  },
                  children: slide.heading,
                },
              },
              slide.body
                ? {
                    type: "div",
                    props: {
                      style: {
                        fontSize: 34,
                        color: "rgba(255,255,255,0.85)",
                        lineHeight: 1.35,
                      },
                      children: slide.body,
                    },
                  }
                : null,
            ],
          },
        };

  const element = {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        background: GREEN,
        fontFamily: "sans-serif",
      },
      children: [
        inner,
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              bottom: 50,
              left: 60,
              color: "rgba(255,255,255,0.9)",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 2,
            },
            children: "HERSFELDER",
          },
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              bottom: 50,
              right: 60,
              color: "rgba(255,255,255,0.55)",
              fontSize: 26,
              fontWeight: 600,
            },
            children: counter,
          },
        },
      ],
    },
  };

  // ImageResponse erwartet ein React-Element; das obige Plain-Object-Format
  // ist Satori-kompatibel (kein JSX nötig).
  const res = new ImageResponse(element as unknown as React.ReactElement, {
    width: 1080,
    height: 1350,
  });
  return Buffer.from(await res.arrayBuffer());
}
