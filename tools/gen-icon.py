#!/usr/bin/env python
"""Barrel Proof home-screen icon: an amber pour in a heavy rocks glass with a
single clear cube, on a deep espresso field with a brushed-gold frame.
Pure stdlib — SDF compositing for crisp anti-aliasing + hand-written PNG encoder."""
import math, struct, zlib, os

OUT = os.path.dirname(os.path.abspath(__file__))

def clamp(x, a=0.0, b=1.0): return a if x < a else (b if x > b else x)
def lerp(a, b, t): return a + (b - a) * t
def lerp3(c1, c2, t): return (lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t))
def over(dst, src, a): return (lerp(dst[0],src[0],a), lerp(dst[1],src[1],a), lerp(dst[2],src[2],a))

def sdf_rrect(px, py, cx, cy, hx, hy, r):
    qx = abs(px-cx) - hx + r
    qy = abs(py-cy) - hy + r
    ax, ay = max(qx,0.0), max(qy,0.0)
    return math.sqrt(ax*ax+ay*ay) + min(max(qx,qy),0.0) - r

def fill_cov(d, aa): return clamp(0.5 - d/aa)
def stroke_cov(d, hw, aa): return clamp(0.5 - (abs(d)-hw)/aa)

BG_CENTER=(0.185,0.123,0.088); BG_EDGE=(0.060,0.039,0.029)
GLOW=(0.60,0.34,0.12)
BRASS=(0.796,0.639,0.353); BRASS_HI=(0.945,0.804,0.518)
CREAM=(0.985,0.960,0.910)
AMBER_TOP=(0.930,0.680,0.340); AMBER_MID=(0.760,0.480,0.180); AMBER_BOT=(0.330,0.175,0.050)
GLASS_RIM=(0.96,0.90,0.78)

def sdf_circle(px, py, cx, cy, r): return math.hypot(px-cx, py-cy) - r

def amber(t):
    return lerp3(AMBER_TOP, AMBER_MID, t*2) if t < 0.5 else lerp3(AMBER_MID, AMBER_BOT, (t-0.5)*2)

def render(N):
    s = N/512.0; aa = 1.2
    cx, cy = 256*s, 256*s
    g  = (256*s, 280*s, 92*s, 84*s, 22*s)     # glass body
    gi = (256*s, 280*s, 85*s, 77*s, 17*s)     # interior
    itop, ibot = (280-77)*s, (280+77)*s
    surfaceY = 264*s
    glowC, glowR = (256*s, 300*s), 175*s
    bgC, bgMax = (256*s, 230*s), 360*s
    frame1 = (cx, cy, 218*s, 218*s, 70*s)
    frame2 = (cx, cy, 201*s, 201*s, 58*s)
    icx, icy, ih, ir = 248*s, 250*s, 33*s, 9*s
    ang = -0.17; ca, sa = math.cos(ang), math.sin(ang)
    spec = (210*s, 268*s, 5*s, 70*s, 5*s)
    refl = (256*s, 392*s, 78*s, 12*s, 12*s)

    buf = bytearray(N*N*4); i = 0
    for py in range(N):
        pyf = py + 0.5
        for px in range(N):
            pxf = px + 0.5
            # background radial + vignette
            d = math.hypot(pxf-bgC[0], pyf-bgC[1]) / bgMax
            rgb = lerp3(BG_CENTER, BG_EDGE, clamp(d)**1.15)
            # warm glow behind the glass
            gd = math.hypot(pxf-glowC[0], pyf-glowC[1]) / glowR
            rgb = over(rgb, GLOW, clamp(1-gd)*0.20)
            # soft floor reflection
            rgb = over(rgb, AMBER_MID, fill_cov(sdf_rrect(pxf,pyf,*refl), 18*s)*0.14)
            # brushed-gold frame (two hairlines)
            rgb = over(rgb, BRASS,    stroke_cov(sdf_rrect(pxf,pyf,*frame1), 1.7*s, aa)*0.55)
            rgb = over(rgb, BRASS_HI, stroke_cov(sdf_rrect(pxf,pyf,*frame2), 0.8*s, aa)*0.22)
            # glass body tint
            di = sdf_rrect(pxf,pyf,*gi)
            rgb = over(rgb, CREAM, fill_cov(di, aa)*0.05)
            # amber liquid (interior, below surface)
            vmask = clamp((pyf - surfaceY)/aa + 0.5)
            lcov = fill_cov(di, aa) * vmask
            if lcov > 0:
                t = clamp((pyf - surfaceY)/(ibot - surfaceY))
                col = amber(t)
                # heavy-base darkening near the very bottom
                col = lerp3(col, AMBER_BOT, clamp((pyf-(ibot-26*s))/(26*s))*0.55)
                rgb = over(rgb, col, lcov)
                # left inner highlight in the liquid
                rgb = over(rgb, AMBER_TOP, fill_cov(di,aa)*clamp(1-abs(pxf-210*s)/(26*s))*vmask*0.16)
                # bright meniscus at the surface
                rgb = over(rgb, lerp3(AMBER_TOP, CREAM, 0.3), fill_cov(di,aa)*clamp(1-abs(pyf-surfaceY)/(5*s))*0.55)
            # ice cube — a clear glassy cube: minimal fill, crisp edges, one glint
            dx, dy = pxf-icx, pyf-icy
            rx, ry = icx + dx*ca + dy*sa, icy - dx*sa + dy*ca
            dice = sdf_rrect(rx,ry, icx,icy, ih,ih, ir)
            rgb = over(rgb, CREAM, fill_cov(dice, aa)*0.06)                                   # faint body
            rgb = over(rgb, CREAM, stroke_cov(dice, 1.7*s, aa)*0.55)                          # crisp outer edge
            rgb = over(rgb, CREAM, stroke_cov(sdf_rrect(rx,ry, icx,icy, ih*0.66, ih*0.66, ir*0.7), 1.1*s, aa)*0.20)  # inner facet
            rgb = over(rgb, CREAM, fill_cov(sdf_circle(rx,ry, icx-ih*0.46, icy-ih*0.46, 5.0*s), aa)*0.60)            # glint
            # glass rim outline (brighter toward the top)
            dg = sdf_rrect(pxf,pyf,*g)
            rim = clamp(1.0 - (pyf - itop)/(190*s))
            rgb = over(rgb, GLASS_RIM, stroke_cov(dg, 3.0*s, aa)*(0.50 + 0.42*rim))
            # soft specular streak on the glass
            rgb = over(rgb, CREAM, fill_cov(sdf_rrect(pxf,pyf,*spec), 8.0*s)*0.09)

            buf[i]=int(clamp(rgb[0])*255+0.5); buf[i+1]=int(clamp(rgb[1])*255+0.5)
            buf[i+2]=int(clamp(rgb[2])*255+0.5); buf[i+3]=255; i += 4
    return bytes(buf)

def write_png(path, N, data):
    def chunk(typ, d):
        return struct.pack(">I", len(d)) + typ + d + struct.pack(">I", zlib.crc32(typ+d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0)
    raw = bytearray(); stride = N*4
    for y in range(N):
        raw.append(0); raw.extend(data[y*stride:(y+1)*stride])
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw),9)) + chunk(b"IEND", b""))

for name, N in [("apple-touch-icon.png",180), ("icon-192.png",192), ("icon-512.png",512)]:
    write_png(os.path.join(OUT, name), N, render(N)); print("wrote", name, N)
print("done")
