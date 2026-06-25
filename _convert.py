import glob, os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM

SCALE = 10  # 10x the viewBox size for crisp output

for path in sorted(glob.glob("Pet *.svg")):
    drawing = svg2rlg(path)
    drawing.scale(SCALE, SCALE)
    drawing.width *= SCALE
    drawing.height *= SCALE
    out = os.path.splitext(path)[0] + ".png"
    renderPM.drawToFile(drawing, out, fmt="PNG")
    print(f"{path} -> {out} ({int(drawing.width)}x{int(drawing.height)})")
