#!/usr/bin/env python3
"""
Samples real Copernicus DEM GLO-30 (AWS Open Data) elevation for Fatih (Sultanahmet-Eminonu)
into a compact decimeter terrain grid JSON. Gently smooths 3x3 DSM spikes while clamping
water/coastline to >= 0 m.
Attribution: Copernicus DEM GLO-30 (c) DLR e.V. & Airbus Defence and Space GmbH (EU/ESA).
"""
import json
import math
import os
import sys
import urllib.request

COG_URL = (
    "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
    "Copernicus_DSM_COG_10_N41_00_E028_00_DEM/"
    "Copernicus_DSM_COG_10_N41_00_E028_00_DEM.tif"
)

EARTH_RADIUS = 6_378_137.0
DEG_TO_RAD = math.pi / 180.0
RAD_TO_DEG = 180.0 / math.pi

BOUNDS = {"south": 41.0020, "north": 41.0145, "west": 28.9660, "east": 28.9845}
ORIGIN_LON = (BOUNDS["west"] + BOUNDS["east"]) / 2.0
ORIGIN_LAT = (BOUNDS["south"] + BOUNDS["north"]) / 2.0

COLS = 49
ROWS = 49


def lonlat_to_local(lon: float, lat: float):
    cos_lat = math.cos(ORIGIN_LAT * DEG_TO_RAD)
    x = (lon - ORIGIN_LON) * DEG_TO_RAD * EARTH_RADIUS * cos_lat
    z = -(lat - ORIGIN_LAT) * DEG_TO_RAD * EARTH_RADIUS
    return x, z


def local_to_lonlat(x: float, z: float):
    cos_lat = math.cos(ORIGIN_LAT * DEG_TO_RAD)
    lon = ORIGIN_LON + (x / (EARTH_RADIUS * cos_lat)) * RAD_TO_DEG
    lat = ORIGIN_LAT - (z / EARTH_RADIUS) * RAD_TO_DEG
    return lon, lat


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "terrain.json"
    cache_tif = sys.argv[2] if len(sys.argv) > 2 else "/tmp/copernicus_n41_e028.tif"

    sw_x, sw_z = lonlat_to_local(BOUNDS["west"], BOUNDS["south"])
    ne_x, ne_z = lonlat_to_local(BOUNDS["east"], BOUNDS["north"])
    min_x, max_x = min(sw_x, ne_x), max(sw_x, ne_x)
    min_z, max_z = min(sw_z, ne_z), max(sw_z, ne_z)

    import rasterio  # installed in workflow

    if not os.path.exists(cache_tif):
        print(f"Downloading Copernicus DEM GLO-30 tile from {COG_URL} ...")
        urllib.request.urlretrieve(COG_URL, cache_tif)

    coords = []
    for r in range(ROWS):
        z = min_z + (max_z - min_z) * (r / (ROWS - 1))
        for c in range(COLS):
            x = min_x + (max_x - min_x) * (c / (COLS - 1))
            lon, lat = local_to_lonlat(x, z)
            coords.append((lon, lat))

    with rasterio.open(cache_tif) as src:
        raw_vals = [max(0.0, float(v[0])) for v in src.sample(coords)]

    # Gentle 3x3 smoothing pass to reduce DSM building-roof spikes while preserving hills
    smoothed = [0.0] * len(raw_vals)
    for r in range(ROWS):
        for c in range(COLS):
            acc = 0.0
            weight = 0.0
            for dr in (-1, 0, 1):
                rr = max(0, min(ROWS - 1, r + dr))
                for dc in (-1, 0, 1):
                    cc = max(0, min(COLS - 1, c + dc))
                    w = 2.0 if (dr == 0 and dc == 0) else 1.0
                    acc += raw_vals[rr * COLS + cc] * w
                    weight += w
            val = acc / weight
            # Keep sea pixels cleanly at 0.0m
            if raw_vals[r * COLS + c] < 0.8:
                val = 0.0
            smoothed[r * COLS + c] = val

    decimeters = [max(0, int(round(v * 10.0))) for v in smoothed]
    min_m = round(min(decimeters) * 0.1, 1)
    max_m = round(max(decimeters) * 0.1, 1)

    grid = {
        "minX": round(min_x, 2),
        "maxX": round(max_x, 2),
        "minZ": round(min_z, 2),
        "maxZ": round(max_z, 2),
        "cols": COLS,
        "rows": ROWS,
        "elevDecimeters": decimeters,
        "source": "Copernicus DEM GLO-30 (AWS s3://copernicus-dem-30m, N41 E028, smoothed DSM)",
        "minMeters": min_m,
        "maxMeters": max_m,
    }

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(grid, f, separators=(",", ":"))

    print(
        f"Saved Copernicus DEM GLO-30 terrain grid -> {out_path} "
        f"({COLS}x{ROWS}, elev {min_m}m..{max_m}m)"
    )


if __name__ == "__main__":
    main()
