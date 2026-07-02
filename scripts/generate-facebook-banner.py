from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

# ── Abmessungen (2x für Retina) ─────────────────────────────────────
W, H = 1640, 624

# ── Markenfarben (von schuetzen-ausstatter.de) ──────────────────────
BG       = (15, 15, 15)        # #0f0f0f — fast Schwarz, wie Website-Hero
GREEN    = (26, 76, 42)        # #1a4c2a — Jagdgrün der Uniformen
RED      = (160, 30, 30)       # #a01e1e — Dunkelrot des Logos
WHITE    = (255, 255, 255)
OFF_WHITE= (230, 228, 224)     # leicht gebrochen für Eleganz
GREY     = (120, 118, 115)     # für dezente Elemente

# ── Fonts ────────────────────────────────────────────────────────────
FUTURA = '/System/Library/Fonts/Supplemental/Futura.ttc'
HELVETICA = '/System/Library/Fonts/HelveticaNeue.ttc'

def futura(size, bold=False, condensed=False):
    idx = 4 if condensed and bold else (3 if condensed else (2 if bold else 0))
    return ImageFont.truetype(FUTURA, size, index=idx)

def helvetica(size, index=0):
    return ImageFont.truetype(HELVETICA, size, index=index)

# ── Canvas ───────────────────────────────────────────────────────────
img = Image.new('RGB', (W, H), BG)
draw = ImageDraw.Draw(img)

# ── Hintergrund: feiner Vignetten-Gradient links und rechts ─────────
for x in range(W):
    # Links dunkler, Mitte leicht aufgehellt
    factor = 1 - 0.18 * (1 - (x / W))
    r = int(BG[0] * factor)
    g = int(BG[1] * factor)
    b = int(BG[2] * factor)
    draw.line([(x, 0), (x, H)], fill=(r, g, b))

# ── Grüne vertikale Akzentlinie (links) ──────────────────────────────
LINE_X = 72
draw.rectangle([LINE_X, 60, LINE_X + 3, H - 60], fill=GREEN)

# ── Dezente horizontale Trennlinien ──────────────────────────────────
draw.line([(LINE_X + 24, 155), (W - 80, 155)], fill=(45, 45, 45), width=1)
draw.line([(LINE_X + 24, H - 155), (W - 80, H - 155)], fill=(45, 45, 45), width=1)

# ── Oberer Bereich: "DEIN SCHÜTZENAUSSTATTER" ────────────────────────
label_font = futura(22, condensed=True)
label_text = "DEIN SCHÜTZENAUSSTATTER"
draw.text((LINE_X + 36, 96), label_text, font=label_font, fill=GREY)

# ── Roter Punkt als Trenner ───────────────────────────────────────────
label_bbox = draw.textbbox((LINE_X + 36, 96), label_text, font=label_font)
dot_x = label_bbox[2] + 16
draw.ellipse([dot_x, 106, dot_x + 6, 112], fill=RED)
draw.text((dot_x + 18, 96), "KOLLEKTION 2026", font=label_font, fill=GREY)

# ── Haupt-Logo-Schrift: "Hersfelder" ─────────────────────────────────
# Groß, weiß, Futura Condensed ExtraBold
main_font = futura(148, bold=True, condensed=True)
main_text = "Hersfelder"
# Zentriert auf dem Canvas
bbox = draw.textbbox((0, 0), main_text, font=main_font)
text_w = bbox[2] - bbox[0]
text_x = (W - text_w) // 2
text_y = (H - (bbox[3] - bbox[1])) // 2 - 12

# Subtiler grüner Glow hinter dem Schriftzug
glow_layer = Image.new('RGB', (W, H), BG)
gd = ImageDraw.Draw(glow_layer)
for offset in range(20, 0, -1):
    alpha_val = int(255 * (1 - offset / 20) * 0.06)
    gd.text(
        (text_x, text_y),
        main_text,
        font=main_font,
        fill=(26 + offset, 76 + offset * 2, 42 + offset)
    )
glow_blur = glow_layer.filter(ImageFilter.GaussianBlur(radius=18))
img = Image.blend(img, glow_blur, 0.5)
draw = ImageDraw.Draw(img)

# Schriftzug in Weiß
draw.text((text_x, text_y), main_text, font=main_font, fill=OFF_WHITE)

# ── Slogan ────────────────────────────────────────────────────────────
slogan_font = futura(28, condensed=False)
slogan = "Uniform an  ·  Stimmung hoch!"
s_bbox = draw.textbbox((0, 0), slogan, font=slogan_font)
s_w = s_bbox[2] - s_bbox[0]
draw.text(((W - s_w) // 2, H - 148), slogan, font=slogan_font, fill=GREY)

# ── URL unten rechts ──────────────────────────────────────────────────
url_font = futura(20, condensed=True)
url_text = "WWW.SCHUETZEN-AUSSTATTER.DE"
u_bbox = draw.textbbox((0, 0), url_text, font=url_font)
draw.text((W - u_bbox[2] - 72, H - 80), url_text, font=url_font, fill=(70, 68, 65))

# ── Logo: sehr dezentes Wasserzeichen unten rechts ───────────────────
try:
    logo = Image.open("/Users/marcwitzsche/Claude/hersfelder-app/public/logo-hersfelder.png").convert("RGBA")
    logo_h = int(H * 0.30)
    logo_w = int(logo.width * logo_h / logo.height)
    logo = logo.resize((logo_w, logo_h), Image.LANCZOS)

    # Nur die nicht-weißen Pixel leicht sichtbar machen
    r, g, b, a = logo.split()
    a = a.point(lambda p: int(p * 0.045))
    logo.putalpha(a)

    logo_x = W - logo_w - 68
    logo_y = H - logo_h - 50
    img.paste(logo, (logo_x, logo_y), logo)
    draw = ImageDraw.Draw(img)
except Exception as e:
    print(f"Logo-Overlay übersprungen: {e}")

# ── Speichern ─────────────────────────────────────────────────────────
out = "/Users/marcwitzsche/Claude/hersfelder-app/public/facebook/facebook-cover-v2.jpg"
img.save(out, "JPEG", quality=95)
print(f"✅ Banner gespeichert: {out}")
print(f"   Größe: {W}x{H}px")
