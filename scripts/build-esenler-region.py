#!/usr/bin/env python3
"""
Build-time offline geospatial harvester for Region v0.2 (Default Start):
  Esenler / Namik Kemal Mahallesi, Istanbul.

Pipeline:
  1. Downloads public release osm_data.zip and verifies exact SHA-256.
  2. Extracts manifest.json + osm_data.gpkg and inspects all SQLite/GeoPackage layers.
  3. Parses buildings, roads, parks, water, worship places, and neighborhood POIs from
     osm_data.gpkg (auto-handling GeoPackage WKB headers and CRS -> WGS84).
  4. Tops up missing OSM layers (especially amenity=place_of_worship, parks, water,
     and neighborhood POIs: bakkal, cay ocagi, okul, pazar yeri) via Overpass API.
  5. Samples Copernicus DEM GLO-30 (N41 E028) for real Esenler sloped topography.
  6. Generates 100% offline 300m tiles, road-graph.json, terrain.json, manifest.json,
     quality-report.json, and source-inspection.json under:
       public/derived-data/esenler-namik-kemal/

Privacy & Brand Rule:
  Strips addr:* house addresses and anonymizes commercial/shop names into generic
  neighborhood labels (zero real people, zero home addresses, zero commercial brands).

Sanctuary Rule:
  Every OSM amenity=place_of_worship automatically generates a Sanctuary Zone
  (violence/weapons locked).

License:
  Derived from OpenStreetMap (ODbL 1.0) & Copernicus DEM GLO-30 (EU/ESA).
"""
import collections
import hashlib
import json
import math
import os
import sqlite3
import struct
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

from pyproj import Transformer
import rasterio
from shapely import wkb as shapely_wkb
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon

REGION_ID = "esenler-namik-kemal"
ZIP_URL = "https://github.com/eraslan19j/ist/releases/download/v1.1-esenler-data/osm_data.zip"
EXPECTED_SHA256 = "8849228b90c2ac807e707bfc91e1b6d0bddb40107afb4962951b20654f621fff"
COG_URL = (
    "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
    "Copernicus_DSM_COG_10_N41_00_E028_00_DEM/"
    "Copernicus_DSM_COG_10_N41_00_E028_00_DEM.tif"
)
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
]

OUT_DIR = os.path.join(os.getcwd(), "public", "derived-data", REGION_ID)
TILES_DIR = os.path.join(OUT_DIR, "tiles")

EARTH_RADIUS = 6_378_137.0
DEG_TO_RAD = math.pi / 180.0
RAD_TO_DEG = 180.0 / math.pi
TILE_SIZE = 300
DEM_COLS = 49
DEM_ROWS = 49


def round1(v: float) -> float:
    return round(float(v) * 10.0) / 10.0


def deterministic_unit(text: str) -> float:
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h / 4_294_967_295.0


def parse_gpkg_geometry(blob):
    """Strip OGC GeoPackage binary header and return (srs_id, shapely_geom)."""
    if not blob or not isinstance(blob, (bytes, bytearray, memoryview)):
        return 4326, None
    data = bytes(blob)
    if len(data) < 8:
        return 4326, None
    if data[0:2] == b"GP":
        flags = data[3]
        little_endian = bool(flags & 0x01)
        env_code = (flags >> 1) & 0x07
        empty_flag = bool((flags >> 4) & 0x01)
        if empty_flag:
            return 4326, None
        srs_id = struct.unpack("<i" if little_endian else ">i", data[4:8])[0]
        env_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
        offset = 8 + env_sizes.get(env_code, 0)
        if offset >= len(data):
            return srs_id, None
        return srs_id, shapely_wkb.loads(data[offset:])
    # Fallback: raw WKB
    try:
        return 4326, shapely_wkb.loads(data)
    except Exception:
        return 4326, None


def get_crs_transformer(conn: sqlite3.Connection, srs_id: int, cache: dict):
    if srs_id in cache:
        return cache[srs_id]
    if srs_id in (4326, 0, -1):
        cache[srs_id] = None
        return None
    cur = conn.cursor()
    row = cur.execute(
        "SELECT organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys WHERE srs_id=?",
        (srs_id,),
    ).fetchone()
    if row:
        org, code, wkt = row
        if org and org.upper() == "EPSG" and code == 4326:
            cache[srs_id] = None
            return None
        try:
            crs_src = f"{org}:{code}" if (org and code) else wkt
            tr = Transformer.from_crs(crs_src, "EPSG:4326", always_xy=True)
            cache[srs_id] = tr
            return tr
        except Exception:
            pass
    try:
        tr = Transformer.from_crs(f"EPSG:{srs_id}", "EPSG:4326", always_xy=True)
        cache[srs_id] = tr
        return tr
    except Exception:
        cache[srs_id] = None
        return None


def reproject_coords(coords, transformer):
    if transformer is None:
        return [(float(c[0]), float(c[1])) for c in coords]
    out = []
    for c in coords:
        lon, lat = transformer.transform(float(c[0]), float(c[1]))
        out.append((lon, lat))
    return out


def parse_height_meters(raw):
    if raw is None:
        return None
    s = str(raw).strip().lower().replace(",", ".")
    if not s:
        return None
    unit = "m"
    if s.endswith("ft") or s.endswith("feet"):
        unit = "ft"
        s = s.replace("feet", "").replace("ft", "").strip()
    elif s.endswith("m") or s.endswith("meters") or s.endswith("meter"):
        s = s.replace("meters", "").replace("meter", "").replace("m", "").strip()
    try:
        val = float(s)
        if not math.isfinite(val) or val <= 0:
            return None
        return val * 0.3048 if unit == "ft" else val
    except ValueError:
        return None


# Esenler / Namik Kemal is predominantly dense 4-6 floor residential apartment blocks
KIND_HEIGHT = {
    "mosque": 18.0,
    "apartments": 16.0,
    "residential": 14.5,
    "house": 9.5,
    "commercial": 13.5,
    "retail": 10.5,
    "office": 14.0,
    "school": 12.5,
    "kindergarten": 7.5,
    "public": 13.0,
    "civic": 13.0,
    "hospital": 16.0,
    "industrial": 9.0,
    "garage": 3.5,
    "kiosk": 3.5,
    "roof": 4.5,
    "yes": 14.0,
}


def resolve_height(bid: str, props: dict):
    h = parse_height_meters(props.get("height"))
    if h is not None:
        return max(3.2, min(75.0, round1(h))), "height"

    lvl_raw = props.get("building:levels") or props.get("building_levels") or props.get("levels")
    if lvl_raw is not None:
        try:
            lvl = float(str(lvl_raw).strip().replace(",", "."))
            if math.isfinite(lvl) and 0 < lvl <= 35:
                return max(3.4, min(75.0, round1(lvl * 3.15))), "levels"
        except ValueError:
            pass

    kind = str(props.get("building") or "yes").lower()
    base = KIND_HEIGHT.get(kind, 14.0)
    jitter = 0.78 + deterministic_unit(bid) * 0.44
    return max(4.5, min(25.0, round1(base * jitter))), "inferred"


def classify_palette(bid: str, kind: str, amenity: str):
    k = (kind or "").lower()
    a = (amenity or "").lower()
    if k == "mosque" or a == "place_of_worship":
        return "landmark"
    if k in ("school", "kindergarten", "public", "civic", "hospital") or a in ("school", "clinic", "hospital", "community_centre"):
        return "civic"
    if k in ("commercial", "retail", "office"):
        return "commercial"
    u = deterministic_unit(f"{bid}:pal")
    # Authentic Esenler apartment facade mix: warm plaster, terracotta brick, concrete beige, light commercial ground
    if u < 0.44:
        return "limestone"
    if u < 0.74:
        return "terracotta"
    if u < 0.88:
        return "commercial"
    return "ottoman_wood"


ROAD_SPECS = {
    "motorway": ("primary", 12.0, 70),
    "trunk": ("primary", 11.5, 65),
    "primary": ("primary", 10.5, 50),
    "primary_link": ("primary", 9.0, 45),
    "secondary": ("secondary", 9.2, 50),
    "secondary_link": ("secondary", 8.0, 40),
    "tertiary": ("tertiary", 7.6, 40),
    "tertiary_link": ("tertiary", 7.0, 35),
    "residential": ("residential", 5.8, 30),  # Narrow Esenler residential streets
    "living_street": ("residential", 5.2, 20),
    "unclassified": ("residential", 6.2, 30),
    "service": ("service", 4.4, 20),
    "pedestrian": ("pedestrian", 4.2, 10),
    "footway": ("pedestrian", 2.8, 8),
    "steps": ("pedestrian", 2.6, 5),
    "path": ("pedestrian", 2.6, 8),
}


def simplify_pts(pts, tol=0.7):
    if len(pts) <= 3:
        return pts
    tol_sq = tol * tol
    out = [pts[0]]
    for pt in pts[1:-1]:
        prev = out[-1]
        dx = pt[0] - prev[0]
        dz = pt[1] - prev[1]
        if dx * dx + dz * dz >= tol_sq:
            out.append(pt)
    out.append(pts[-1])
    return out


def fetch_overpass(bounds: dict):
    s, w, n, e = bounds["south"], bounds["west"], bounds["north"], bounds["east"]
    # Focused Overpass query for worship places, parks, water, and neighborhood POIs
    query = f"""
[out:json][timeout:60];
(
  node["amenity"="place_of_worship"]({s},{w},{n},{e});
  way["amenity"="place_of_worship"]({s},{w},{n},{e});
  relation["amenity"="place_of_worship"]({s},{w},{n},{e});
  way["leisure"~"^(park|playground|pitch|garden)$"]({s},{w},{n},{e});
  way["landuse"~"^(park|recreation_ground|grass|meadow)$"]({s},{w},{n},{e});
  way["natural"="water"]({s},{w},{n},{e});
  way["waterway"]({s},{w},{n},{e});
  node["amenity"~"^(school|kindergarten|cafe|marketplace|community_centre|fountain|pharmacy|clinic)$"]({s},{w},{n},{e});
  way["amenity"~"^(school|kindergarten|cafe|marketplace|community_centre)$"]({s},{w},{n},{e});
  node["shop"~"^(convenience|supermarket|bakery|greengrocer|butcher|kiosk|tea)$"]({s},{w},{n},{e});
  way["shop"~"^(convenience|supermarket|bakery|greengrocer)$"]({s},{w},{n},{e});
);
out body center;
>;
out skel qt;
""".strip()

    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    for mirror in OVERPASS_MIRRORS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(
                    mirror,
                    data=body,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": "IstanbulStreetsBuild/0.2 (https://github.com/eraslan19j/Aslan)",
                    },
                )
                with urllib.request.urlopen(req, timeout=70) as resp:
                    if resp.status == 200:
                        return json.loads(resp.read().decode("utf-8"))
            except Exception as exc:
                print(f"Overpass {mirror} attempt {attempt + 1} failed: {exc}")
                time.sleep(2)
    return None


def sample_copernicus_dem(bounds: dict, origin: dict, cache_tif: str):
    def ll_to_local(lon, lat):
        cos_lat = math.cos(origin["lat"] * DEG_TO_RAD)
        return (
            (lon - origin["lon"]) * DEG_TO_RAD * EARTH_RADIUS * cos_lat,
            -(lat - origin["lat"]) * DEG_TO_RAD * EARTH_RADIUS,
        )

    def local_to_ll(x, z):
        cos_lat = math.cos(origin["lat"] * DEG_TO_RAD)
        return (
            origin["lon"] + (x / (EARTH_RADIUS * cos_lat)) * RAD_TO_DEG,
            origin["lat"] - (z / EARTH_RADIUS) * RAD_TO_DEG,
        )

    sw_x, sw_z = ll_to_local(bounds["west"], bounds["south"])
    ne_x, ne_z = ll_to_local(bounds["east"], bounds["north"])
    min_x, max_x = min(sw_x, ne_x), max(sw_x, ne_x)
    min_z, max_z = min(sw_z, ne_z), max(sw_z, ne_z)

    if not os.path.exists(cache_tif):
        print(f"Downloading Copernicus DEM GLO-30 from {COG_URL} ...")
        urllib.request.urlretrieve(COG_URL, cache_tif)

    coords = []
    for r in range(DEM_ROWS):
        z = min_z + (max_z - min_z) * (r / (DEM_ROWS - 1))
        for c in range(DEM_COLS):
            x = min_x + (max_x - min_x) * (c / (DEM_COLS - 1))
            coords.append(local_to_ll(x, z))

    with rasterio.open(cache_tif) as src:
        raw_vals = [max(0.0, float(v[0])) for v in src.sample(coords)]

    # 2 gentle smoothing passes to filter out apartment rooftop DSM noise while preserving Esenler hills
    vals = raw_vals
    for _ in range(2):
        nxt = [0.0] * len(vals)
        for r in range(DEM_ROWS):
            for c in range(DEM_COLS):
                acc = 0.0
                wt = 0.0
                for dr in (-1, 0, 1):
                    rr = max(0, min(DEM_ROWS - 1, r + dr))
                    for dc in (-1, 0, 1):
                        cc = max(0, min(DEM_COLS - 1, c + dc))
                        w = 2.0 if (dr == 0 and dc == 0) else 1.0
                        acc += vals[rr * DEM_COLS + cc] * w
                        wt += w
                nxt[r * DEM_COLS + c] = acc / wt
        vals = nxt

    decimeters = [max(0, int(round(v * 10.0))) for v in vals]
    return {
        "minX": round(min_x, 2),
        "maxX": round(max_x, 2),
        "minZ": round(min_z, 2),
        "maxZ": round(max_z, 2),
        "cols": DEM_COLS,
        "rows": DEM_ROWS,
        "elevDecimeters": decimeters,
        "source": "Copernicus DEM GLO-30 (AWS s3://copernicus-dem-30m, N41 E028, 2-pass smoothed DSM)",
        "minMeters": round(min(decimeters) * 0.1, 1),
        "maxMeters": round(max(decimeters) * 0.1, 1),
    }


def sample_elev(terrain: dict, x: float, z: float) -> float:
    min_x, max_x = terrain["minX"], terrain["maxX"]
    min_z, max_z = terrain["minZ"], terrain["maxZ"]
    cols, rows = terrain["cols"], terrain["rows"]
    deci = terrain["elevDecimeters"]
    u = max(0.0, min(1.0, (x - min_x) / max(1e-6, max_x - min_x))) * (cols - 1)
    v = max(0.0, min(1.0, (z - min_z) / max(1e-6, max_z - min_z))) * (rows - 1)
    c0, r0 = int(math.floor(u)), int(math.floor(v))
    c1, r1 = min(cols - 1, c0 + 1), min(rows - 1, r0 + 1)
    fu, fv = u - c0, v - r0
    h00 = deci[r0 * cols + c0] * 0.1
    h10 = deci[r0 * cols + c1] * 0.1
    h01 = deci[r1 * cols + c0] * 0.1
    h11 = deci[r1 * cols + c1] * 0.1
    return (h00 * (1 - fu) + h10 * fu) * (1 - fv) + (h01 * (1 - fu) + h11 * fu) * fv


def main():
    zip_path = "/tmp/esenler_osm_data.zip"
    extract_dir = "/tmp/esenler_extracted"

    print(f"Downloading {ZIP_URL} ...")
    urllib.request.urlretrieve(ZIP_URL, zip_path)
    with open(zip_path, "rb") as f:
        raw = f.read()
    actual_sha = hashlib.sha256(raw).hexdigest()
    if actual_sha != EXPECTED_SHA256:
        raise RuntimeError(f"SHA-256 mismatch: expected {EXPECTED_SHA256}, got {actual_sha}")
    print(f"SHA-256 verified OK ({len(raw)} bytes): {actual_sha}")

    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)

    src_manifest_path = os.path.join(extract_dir, "manifest.json")
    gpkg_path = os.path.join(extract_dir, "osm_data.gpkg")
    with open(src_manifest_path, "r", encoding="utf-8") as f:
        src_manifest = json.load(f)

    conn = sqlite3.connect(gpkg_path)
    cur = conn.cursor()

    contents = cur.execute(
        "SELECT table_name, data_type, identifier, srs_id, min_x, min_y, max_x, max_y FROM gpkg_contents"
    ).fetchall()
    geom_cols = {
        row[0]: {"column": row[1], "geomType": row[2], "srsId": row[3]}
        for row in cur.execute(
            "SELECT table_name, column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns"
        ).fetchall()
    }

    srs_cache = {}
    layer_reports = {}

    raw_buildings = []
    raw_roads = []
    raw_areas = []  # (id, kind, lonlat_ring)
    raw_worship = []  # (id, lon, lat, radius_m)
    raw_pois = []  # (id, category, lon, lat)

    bbox = {"west": 999.0, "east": -999.0, "south": 999.0, "north": -999.0}

    def expand_bbox(lon, lat):
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            bbox["west"] = min(bbox["west"], lon)
            bbox["east"] = max(bbox["east"], lon)
            bbox["south"] = min(bbox["south"], lat)
            bbox["north"] = max(bbox["north"], lat)

    for table_name, data_type, identifier, srs_id, min_x, min_y, max_x, max_y in contents:
        col_info = cur.execute(f'PRAGMA table_info("{table_name}")').fetchall()
        col_names = [c[1] for c in col_info]
        gcol = geom_cols.get(table_name, {}).get("column")
        row_count = cur.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
        sample_rows = []
        gtype_counts = collections.Counter()
        key_val_counts = collections.defaultdict(collections.Counter)

        t_lower = table_name.lower()
        # Skip redundant graph tables for mesh extraction (already represented cleanly in 'roads' + 'paths')
        skip_for_geometry = t_lower in ("road_network_edges", "road_network_nodes")
        rows = cur.execute(f'SELECT * FROM "{table_name}"').fetchall()
        for idx, row in enumerate(rows):
            rec = dict(zip(col_names, row))
            blob = rec.pop(gcol, None) if gcol else None
            # Strip privacy-sensitive addr columns before inspecting or using
            props = {}
            for k, v in rec.items():
                if v is None or v == "":
                    continue
                kl = k.lower()
                if kl.startswith("addr"):
                    continue
                if kl in ("other_tags", "tags") and isinstance(v, str):
                    # Parse JSON or hstore-style tags if present
                    if v.startswith("{"):
                        try:
                            parsed = json.loads(v)
                            for tk, tv in parsed.items():
                                if not str(tk).lower().startswith("addr"):
                                    props[str(tk)] = tv
                        except Exception:
                            pass
                    else:
                        for pair in v.split(","):
                            if "=>" in pair:
                                tk, tv = pair.split("=>", 1)
                                tk = tk.strip().strip('"')
                                tv = tv.strip().strip('"')
                                if tk and not tk.lower().startswith("addr"):
                                    props[tk] = tv
                else:
                    props[k] = v

            if idx < 3:
                sample_rows.append({k: str(v)[:80] for k, v in list(props.items())[:14]})

            for interest in (
                "building", "highway", "amenity", "shop", "leisure", "landuse",
                "natural", "water", "waterway", "surface", "category", "type", "fclass", "kind",
            ):
                if interest in props:
                    key_val_counts[interest][str(props[interest])] += 1

            g_srs, geom = parse_gpkg_geometry(blob)
            if geom is None or geom.is_empty:
                continue
            gtype_counts[geom.geom_type] += 1
            if skip_for_geometry:
                continue
            tr = get_crs_transformer(conn, g_srs or srs_id or 4326, srs_cache)

            fid = f"gpkg_{table_name}_{rec.get('fid') or rec.get('ogc_fid') or rec.get('osm_id') or idx}"

            # Classify feature semantically
            bldg_val = str(props.get("building") or "").lower()
            hw_val = str(props.get("highway") or "").lower()
            amenity_val = str(props.get("amenity") or "").lower()
            shop_val = str(props.get("shop") or "").lower()
            leisure_val = str(props.get("leisure") or "").lower()
            landuse_val = str(props.get("landuse") or "").lower()
            natural_val = str(props.get("natural") or "").lower()
            water_val = str(props.get("water") or props.get("waterway") or "").lower()

            is_building = bool(bldg_val and bldg_val != "no") or ("building" in t_lower)
            is_road = bool(hw_val) or ("road" in t_lower or "street" in t_lower or "network" in t_lower or "edge" in t_lower)
            is_water = (
                natural_val == "water"
                or bool(water_val)
                or ("water" in t_lower)
            )
            is_park = (
                leisure_val in ("park", "playground", "pitch", "garden")
                or landuse_val in ("park", "recreation_ground", "grass", "meadow", "greenfield")
                or ("park" in t_lower or "green" in t_lower)
            )

            # Collect polygons
            polys = []
            if isinstance(geom, Polygon):
                polys = [geom]
            elif isinstance(geom, MultiPolygon):
                polys = list(geom.geoms)

            # Collect lines
            lines = []
            if isinstance(geom, LineString):
                lines = [geom]
            elif isinstance(geom, MultiLineString):
                lines = list(geom.geoms)

            # Centroid lon/lat for POIs and worship places
            c_pt = geom.centroid
            c_lon, c_lat = reproject_coords([(c_pt.x, c_pt.y)], tr)[0]
            expand_bbox(c_lon, c_lat)

            if amenity_val == "place_of_worship" or bldg_val == "mosque":
                raw_worship.append({"id": fid, "lon": c_lon, "lat": c_lat, "source": "gpkg"})

            # Categorize neighborhood POIs (anonymized!)
            if amenity_val in ("school", "kindergarten") or bldg_val in ("school", "kindergarten"):
                raw_pois.append({"id": fid, "cat": "school", "lon": c_lon, "lat": c_lat})
            elif amenity_val in ("cafe", "tea"):
                raw_pois.append({"id": fid, "cat": "tea_house", "lon": c_lon, "lat": c_lat})
            elif amenity_val == "marketplace":
                raw_pois.append({"id": fid, "cat": "bazaar", "lon": c_lon, "lat": c_lat})
            elif shop_val in ("convenience", "supermarket", "bakery", "greengrocer", "kiosk"):
                raw_pois.append({"id": fid, "cat": "bakkal", "lon": c_lon, "lat": c_lat})
            elif is_park:
                raw_pois.append({"id": fid, "cat": "park", "lon": c_lon, "lat": c_lat})

            if is_building and polys:
                for p_i, poly in enumerate(polys):
                    ring = reproject_coords(list(poly.exterior.coords), tr)
                    if len(ring) >= 4:
                        for lon, lat in ring:
                            expand_bbox(lon, lat)
                        raw_buildings.append({
                            "id": f"{fid}_{p_i}" if p_i else fid,
                            "ring": ring,
                            "props": props,
                        })
            elif is_road and lines:
                hw_type = hw_val or str(props.get("fclass") or props.get("type") or "residential").lower()
                for l_i, line in enumerate(lines):
                    pts = reproject_coords(list(line.coords), tr)
                    if len(pts) >= 2:
                        for lon, lat in pts:
                            expand_bbox(lon, lat)
                        raw_roads.append({
                            "id": f"{fid}_{l_i}" if l_i else fid,
                            "highway": hw_type,
                            "oneway": str(props.get("oneway") or "").lower() in ("yes", "1", "true"),
                            "pts": pts,
                        })
            elif is_water and polys:
                for p_i, poly in enumerate(polys):
                    ring = reproject_coords(list(poly.exterior.coords), tr)
                    if len(ring) >= 4:
                        raw_areas.append({"id": f"{fid}_{p_i}", "kind": "water", "ring": ring})
            elif is_park and polys:
                for p_i, poly in enumerate(polys):
                    ring = reproject_coords(list(poly.exterior.coords), tr)
                    if len(ring) >= 4:
                        raw_areas.append({"id": f"{fid}_{p_i}", "kind": "park", "ring": ring})

        layer_reports[table_name] = {
            "dataType": data_type,
            "srsId": srs_id,
            "geomColumn": gcol,
            "rowCount": row_count,
            "columns": col_names,
            "geometryTypes": dict(gtype_counts),
            "keyValueCounts": {k: dict(v.most_common(15)) for k, v in key_val_counts.items()},
            "sampleRows": sample_rows,
        }

    conn.close()

    # Use exact official archiveManifest bbox when available so outlier highway vertices don't stretch DEM
    mb = src_manifest.get("bbox")
    if isinstance(mb, dict) and all(k in mb for k in ("west", "south", "east", "north")):
        bounds = {
            "south": round(float(mb["south"]), 6),
            "north": round(float(mb["north"]), 6),
            "west": round(float(mb["west"]), 6),
            "east": round(float(mb["east"]), 6),
        }
    else:
        bounds = {
            "south": round(bbox["south"], 6),
            "north": round(bbox["north"], 6),
            "west": round(bbox["west"], 6),
            "east": round(bbox["east"], 6),
        }
    origin = {
        "lon": round((bounds["west"] + bounds["east"]) / 2.0, 6),
        "lat": round((bounds["south"] + bounds["north"]) / 2.0, 6),
    }

    # Filter out geometries far outside official Esenler bbox (e.g., long cross-district highways)
    pad_deg = 0.0025
    def in_bounds(lon: float, lat: float) -> bool:
        return (
            (bounds["west"] - pad_deg) <= lon <= (bounds["east"] + pad_deg)
            and (bounds["south"] - pad_deg) <= lat <= (bounds["north"] + pad_deg)
        )

    raw_buildings = [b for b in raw_buildings if in_bounds(b["ring"][0][0], b["ring"][0][1])]
    raw_roads = [
        {**r, "pts": [p for p in r["pts"] if in_bounds(p[0], p[1])]}
        for r in raw_roads
    ]
    raw_roads = [r for r in raw_roads if len(r["pts"]) >= 2]

    print(
        f"GPKG parsed: buildings={len(raw_buildings)}, roads={len(raw_roads)}, "
        f"areas={len(raw_areas)}, worship={len(raw_worship)}, pois={len(raw_pois)}, bounds={bounds}"
    )

    # Supplement missing OSM layers (place_of_worship, parks, water, POIs) via Overpass API
    overpass_supplement = {"ran": False, "worshipAdded": 0, "parksAdded": 0, "waterAdded": 0, "poisAdded": 0}
    ov = fetch_overpass(bounds)
    if ov and isinstance(ov.get("elements"), list):
        overpass_supplement["ran"] = True
        nodes_by_id = {}
        for el in ov["elements"]:
            if el.get("type") == "node" and "lat" in el and "lon" in el:
                nodes_by_id[el["id"]] = (float(el["lon"]), float(el["lat"]))

        for el in ov["elements"]:
            tags = el.get("tags") or {}
            if not tags:
                continue
            eid = f"ov_{el['type']}_{el['id']}"
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            if el.get("type") == "way" and el.get("nodes"):
                ring = [nodes_by_id[nid] for nid in el["nodes"] if nid in nodes_by_id]
            else:
                ring = []

            if lon is None and ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)

            amenity = str(tags.get("amenity") or "").lower()
            shop = str(tags.get("shop") or "").lower()
            leisure = str(tags.get("leisure") or "").lower()
            landuse = str(tags.get("landuse") or "").lower()
            natural = str(tags.get("natural") or "").lower()

            if amenity == "place_of_worship" and lon is not None and lat is not None:
                raw_worship.append({"id": eid, "lon": float(lon), "lat": float(lat), "source": "overpass"})
                overpass_supplement["worshipAdded"] += 1

            if (natural == "water" or tags.get("waterway")) and len(ring) >= 4:
                raw_areas.append({"id": eid, "kind": "water", "ring": ring})
                overpass_supplement["waterAdded"] += 1
            elif (
                leisure in ("park", "playground", "pitch", "garden")
                or landuse in ("park", "recreation_ground", "grass", "meadow")
            ) and len(ring) >= 4:
                raw_areas.append({"id": eid, "kind": "park", "ring": ring})
                overpass_supplement["parksAdded"] += 1

            if lon is not None and lat is not None:
                if amenity in ("school", "kindergarten"):
                    raw_pois.append({"id": eid, "cat": "school", "lon": float(lon), "lat": float(lat)})
                    overpass_supplement["poisAdded"] += 1
                elif amenity in ("cafe", "tea"):
                    raw_pois.append({"id": eid, "cat": "tea_house", "lon": float(lon), "lat": float(lat)})
                    overpass_supplement["poisAdded"] += 1
                elif amenity == "marketplace":
                    raw_pois.append({"id": eid, "cat": "bazaar", "lon": float(lon), "lat": float(lat)})
                    overpass_supplement["poisAdded"] += 1
                elif shop in ("convenience", "supermarket", "bakery", "greengrocer", "kiosk"):
                    raw_pois.append({"id": eid, "cat": "bakkal", "lon": float(lon), "lat": float(lat)})
                    overpass_supplement["poisAdded"] += 1
                elif leisure in ("park", "playground"):
                    raw_pois.append({"id": eid, "cat": "park", "lon": float(lon), "lat": float(lat)})
                    overpass_supplement["poisAdded"] += 1

    print("Overpass supplement:", overpass_supplement)

    # Sample Copernicus DEM GLO-30 for Esenler bounds
    terrain = sample_copernicus_dem(bounds, origin, "/tmp/copernicus_n41_e028.tif")
    print(f"Copernicus DEM sampled: {terrain['minMeters']}m .. {terrain['maxMeters']}m")

    def ll_to_local(lon: float, lat: float):
        cos_lat = math.cos(origin["lat"] * DEG_TO_RAD)
        return (
            (lon - origin["lon"]) * DEG_TO_RAD * EARTH_RADIUS * cos_lat,
            -(lat - origin["lat"]) * DEG_TO_RAD * EARTH_RADIUS,
        )

    # Tile buckets
    tiles = {}

    def get_tile(tx: int, tz: int):
        key = f"t_{tx}_{tz}"
        if key not in tiles:
            tiles[key] = {
                "key": key,
                "tx": tx,
                "tz": tz,
                "tileSize": TILE_SIZE,
                "buildings": [],
                "roads": [],
                "areas": [],
            }
        return tiles[key]

    height_from_tag = 0
    height_from_levels = 0
    height_inferred = 0
    building_count = 0
    building_aabbs = []

    for b in raw_buildings:
        pts = [ll_to_local(lon, lat) for lon, lat in b["ring"]]
        pts = simplify_pts(pts, 0.7)
        if len(pts) < 3:
            continue
        xs = [p[0] for p in pts]
        zs = [p[1] for p in pts]
        min_x, max_x = min(xs), max(xs)
        min_z, max_z = min(zs), max(zs)
        if max_x - min_x < 1.5 or max_z - min_z < 1.5:
            continue
        cx, cz = (min_x + max_x) / 2.0, (min_z + max_z) / 2.0
        h_m, h_src = resolve_height(b["id"], b["props"])
        if h_src == "height":
            height_from_tag += 1
        elif h_src == "levels":
            height_from_levels += 1
        else:
            height_inferred += 1

        kind = str(b["props"].get("building") or "residential")
        amenity = str(b["props"].get("amenity") or "")
        pal = classify_palette(b["id"], kind, amenity)
        base_y = round1(sample_elev(terrain, cx, cz))

        flat_ring = []
        for px, pz in pts:
            flat_ring.append(round1(px))
            flat_ring.append(round1(pz))

        tx = int(math.floor(cx / TILE_SIZE))
        tz = int(math.floor(cz / TILE_SIZE))
        get_tile(tx, tz)["buildings"].append({
            "id": b["id"],
            "ring": flat_ring,
            "minX": round1(min_x),
            "maxX": round1(max_x),
            "minZ": round1(min_z),
            "maxZ": round1(max_z),
            "height": h_m,
            "baseY": base_y,
            "heightSource": h_src,
            "palette": pal,
            "kind": kind if kind != "yes" else None,
        })
        building_aabbs.append((min_x, max_x, min_z, max_z))
        building_count += 1

    # Roads + Single-source RoadGraph for M2 AI traffic
    road_nodes = {}  # quantized key -> node dict
    road_edges = []
    road_seg_count = 0

    def get_or_create_node(x: float, z: float):
        # Quantize to 1.5m grid so meeting street endpoints share graph nodes cleanly
        qx = int(round(x / 1.5))
        qz = int(round(z / 1.5))
        nkey = f"n_{qx}_{qz}"
        if nkey not in road_nodes:
            road_nodes[nkey] = {
                "id": nkey,
                "x": round1(x),
                "y": round1(sample_elev(terrain, x, z)),
                "z": round1(z),
            }
        return nkey

    for r in raw_roads:
        spec = ROAD_SPECS.get(r["highway"], ("residential", 5.8, 30))
        rclass, width, speed_kph = spec
        pts = [ll_to_local(lon, lat) for lon, lat in r["pts"]]
        pts = simplify_pts(pts, 1.0)
        if len(pts) < 2:
            continue

        # Assign ribbon to every tile touched by its points
        flat_pts = []
        touched_tiles = set()
        for px, pz in pts:
            flat_pts.append(round1(px))
            flat_pts.append(round1(pz))
            touched_tiles.add((int(math.floor(px / TILE_SIZE)), int(math.floor(pz / TILE_SIZE))))

        # The v0.9.0 data harvest exposed sub-2 m "micro stubs" (tiny leftover path
        # fragments) that looked like road slivers on screen. Drop them here so the
        # pack can never regress (phase7Verification TEST 7 enforces this).
        total_len = 0.0
        for i in range(len(pts) - 1):
            total_len += math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        if total_len < 2.0:
            continue

        ribbon = {
            "id": r["id"],
            "roadClass": rclass,
            "width": width,
            "points": flat_pts,
        }
        for tx, tz in touched_tiles:
            get_tile(tx, tz)["roads"].append(ribbon)
        road_seg_count += 1

        # Add drivable edges to RoadGraph (exclude narrow pedestrian footways/steps)
        if rclass != "pedestrian":
            for i in range(len(pts) - 1):
                x0, z0 = pts[i]
                x1, z1 = pts[i + 1]
                seg_len = math.hypot(x1 - x0, z1 - z0)
                if seg_len < 2.0:
                    continue
                n_from = get_or_create_node(x0, z0)
                n_to = get_or_create_node(x1, z1)
                if n_from == n_to:
                    continue
                road_edges.append({
                    "id": f"e_{len(road_edges)}",
                    "from": n_from,
                    "to": n_to,
                    "roadClass": rclass,
                    "width": width,
                    "oneWay": bool(r["oneway"]),
                    "speedLimitKph": speed_kph,
                    "lengthMeters": round1(seg_len),
                })

    # Areas (parks & water) — deduplicate overlapping polygons by centroid proximity
    park_count = 0
    water_count = 0
    seen_area_centers = []
    for a in raw_areas:
        pts = [ll_to_local(lon, lat) for lon, lat in a["ring"]]
        pts = simplify_pts(pts, 1.0)
        if len(pts) < 3:
            continue
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        if any(math.hypot(cx - sx, cz - sz) < 12.0 and sk == a["kind"] for sx, sz, sk in seen_area_centers):
            continue
        seen_area_centers.append((cx, cz, a["kind"]))

        flat = []
        for px, pz in pts:
            flat.append(round1(px))
            flat.append(round1(pz))
        tx = int(math.floor(cx / TILE_SIZE))
        tz = int(math.floor(cz / TILE_SIZE))
        get_tile(tx, tz)["areas"].append({"id": a["id"], "kind": a["kind"], "ring": flat})
        if a["kind"] == "park":
            park_count += 1
        elif a["kind"] == "water":
            water_count += 1

    # Deduplicate ALL amenity=place_of_worship -> automatic Sanctuary Zones! (sorted nearest to center first)
    raw_worship.sort(key=lambda w: math.hypot(*ll_to_local(w["lon"], w["lat"])))
    sanctuary_zones = []
    landmarks = []
    worship_centers = []
    for w in raw_worship:
        if not in_bounds(w["lon"], w["lat"]):
            continue
        wx, wz = ll_to_local(w["lon"], w["lat"])
        if any(math.hypot(wx - ox, wz - oz) < 42.0 for ox, oz in worship_centers):
            continue
        worship_centers.append((wx, wz))
        idx = len(worship_centers)
        sid = f"namik-kemal-ibadethane-{idx}"
        wy = round1(sample_elev(terrain, wx, wz))
        name_tr = f"Namık Kemal Camii #{idx}" if idx > 1 else "Namık Kemal Merkez Camii"
        name_en = f"Namik Kemal Mosque #{idx}" if idx > 1 else "Namik Kemal Central Mosque"
        sanctuary_zones.append({
            "id": sid,
            "nameTr": f"{name_tr} (Güvenli Alan)",
            "nameEn": f"{name_en} (Safe Zone)",
            "x": round1(wx),
            "z": round1(wz),
            "radiusMeters": 52,
        })
        if idx <= 3:
            landmarks.append({
                "id": sid,
                "nameTr": name_tr,
                "nameEn": name_en,
                "kind": "mosque",
                "x": round1(wx),
                "y": wy,
                "z": round1(wz),
                "lon": round(w["lon"], 6),
                "lat": round(w["lat"], 6),
                "sanctuaryRadiusMeters": 52,
            })

    # Add anonymized neighborhood landmarks & mission points from real OSM POIs
    # Categories: bakkal, tea_house (cay ocagi), school (okul), park, bazaar (pazar yeri)
    poi_templates = {
        "bakkal": ("Mahalle Bakkalı", "Corner Bakkal", "bazaar", 2),
        "tea_house": ("Mahalle Çay Ocağı", "Neighborhood Tea House", "station", 2),
        "school": ("Semt Okulu", "District School", "monument", 2),
        "park": ("Namık Kemal Parkı", "Namik Kemal Park", "park", 2),
        "bazaar": ("Semt Pazar Yeri", "Weekly Market Square", "bazaar", 1),
    }
    used_poi_pos = list(worship_centers)
    cat_counts = collections.Counter()
    raw_pois.sort(key=lambda p: math.hypot(*ll_to_local(p["lon"], p["lat"])))
    for poi in raw_pois:
        if not in_bounds(poi["lon"], poi["lat"]):
            continue
        cat = poi["cat"]
        if cat not in poi_templates:
            continue
        label_tr, label_en, lm_kind, limit = poi_templates[cat]
        if cat_counts[cat] >= limit:
            continue
        px, pz = ll_to_local(poi["lon"], poi["lat"])
        if any(math.hypot(px - ux, pz - uz) < 65.0 for ux, uz in used_poi_pos):
            continue
        used_poi_pos.append((px, pz))
        cat_counts[cat] += 1
        n = cat_counts[cat]
        suffix_tr = f" {n}" if n > 1 else ""
        suffix_en = f" #{n}" if n > 1 else ""
        landmarks.append({
            "id": f"nk-{cat}-{n}",
            "nameTr": f"{label_tr}{suffix_tr}",
            "nameEn": f"{label_en}{suffix_en}",
            "kind": lm_kind,
            "x": round1(px),
            "y": round1(sample_elev(terrain, px, pz)),
            "z": round1(pz),
            "lon": round(poi["lon"], 6),
            "lat": round(poi["lat"], 6),
        })

    # Choose optimal spawn on a central drivable road outside buildings and outside sanctuary zones
    def in_building(x, z, pad=2.2):
        for bminx, bmaxx, bminz, bmaxz in building_aabbs:
            if (bminx - pad) <= x <= (bmaxx + pad) and (bminz - pad) <= z <= (bmaxz + pad):
                return True
        return False

    def in_sanctuary(x, z, pad=10.0):
        for s in sanctuary_zones:
            if math.hypot(x - s["x"], z - s["z"]) <= (s["radiusMeters"] + pad):
                return True
        return False

    best_spawn = {"x": 0.0, "z": 0.0, "heading": 0.0}
    best_score = 1e18
    for edge in road_edges:
        if edge["roadClass"] not in ("tertiary", "secondary", "residential", "primary"):
            continue
        nf = road_nodes[edge["from"]]
        nt = road_nodes[edge["to"]]
        mx = (nf["x"] + nt["x"]) * 0.5
        mz = (nf["z"] + nt["z"]) * 0.5
        if in_building(mx, mz, 2.0) or in_sanctuary(mx, mz, 12.0):
            continue
        dist_center = math.hypot(mx, mz)
        # Prefer wider streets near neighborhood center
        class_bonus = 0 if edge["roadClass"] in ("secondary", "tertiary") else 45
        score = dist_center + class_bonus
        if score < best_score:
            best_score = score
            heading = math.atan2(nt["x"] - nf["x"], nt["z"] - nf["z"])
            best_spawn = {
                "x": round1(mx),
                "z": round1(mz),
                "heading": round(heading, 3),
            }

    # Add Namık Kemal Caddesi / Spawn pin at top of landmarks list
    spawn_lon = origin["lon"] + (best_spawn["x"] / (EARTH_RADIUS * math.cos(origin["lat"] * DEG_TO_RAD))) * RAD_TO_DEG
    spawn_lat = origin["lat"] - (best_spawn["z"] / EARTH_RADIUS) * RAD_TO_DEG
    landmarks.insert(0, {
        "id": "nk-merkez-cadde",
        "nameTr": "Ana Cadde",
        "nameEn": "Main Avenue",
        "kind": "station",
        "x": best_spawn["x"],
        "y": round1(sample_elev(terrain, best_spawn["x"], best_spawn["z"])),
        "z": best_spawn["z"],
        "lon": round(spawn_lon, 6),
        "lat": round(spawn_lat, 6),
    })

    # Write clean output under public/derived-data/esenler-namik-kemal/
    os.makedirs(TILES_DIR, exist_ok=True)
    for fname in os.listdir(TILES_DIR):
        if fname.endswith(".json"):
            os.remove(os.path.join(TILES_DIR, fname))

    available_tiles = sorted(tiles.keys())
    for key in available_tiles:
        with open(os.path.join(TILES_DIR, f"{key}.json"), "w", encoding="utf-8") as f:
            json.dump(tiles[key], f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(OUT_DIR, "terrain.json"), "w", encoding="utf-8") as f:
        json.dump(terrain, f, ensure_ascii=False, separators=(",", ":"))

    road_graph = {
        "schemaVersion": 1,
        "regionId": REGION_ID,
        "nodes": list(road_nodes.values()),
        "edges": road_edges,
    }
    with open(os.path.join(OUT_DIR, "road-graph.json"), "w", encoding="utf-8") as f:
        json.dump(road_graph, f, ensure_ascii=False, separators=(",", ":"))

    manifest = {
        "schemaVersion": 1,
        "regionId": REGION_ID,
        # AGENTS.md: player-facing names must stay fictional — never leak the real
        # district name into the HUD ("site gibi görünüyor" feedback round, v0.9.0).
        "nameTr": "Tepe Mahallesi",
        "nameEn": "Hillside Quarter",
        "bounds": bounds,
        "origin": origin,
        "tileSize": TILE_SIZE,
        "spawn": {
            "x": best_spawn["x"],
            "z": best_spawn["z"],
            "heading": best_spawn["heading"],
            "labelTr": "Ana Cadde",
            "labelEn": "Main Avenue",
        },
        "availableTiles": available_tiles,
        "landmarks": landmarks,
        "sanctuaryZones": sanctuary_zones,
        "dataMode": "real-osm",
        "attributions": [
            "© OpenStreetMap contributors (ODbL 1.0) — via eraslan19j/ist v1.1-esenler-data + Overpass",
            "Copernicus DEM GLO-30 — © DLR e.V. & Airbus Defence and Space GmbH (EU / ESA)",
            "Kaynak: İBB Açık Veri Portalı (İBB Açık Veri Lisansı)",
        ],
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    quality_report = {
        "generatedAtIso": datetime.now(timezone.utc).isoformat(),
        "regionId": REGION_ID,
        "dataSource": f"osm_data.zip (SHA-256 {actual_sha[:12]}...) + Overpass supplement + Copernicus DEM GLO-30",
        "tileCount": len(available_tiles),
        "buildingCount": building_count,
        "heightFromTag": height_from_tag,
        "heightFromLevels": height_from_levels,
        "heightInferred": height_inferred,
        "roadSegmentCount": road_seg_count,
        "tramSegmentCount": 0,
        "roadGraphNodes": len(road_nodes),
        "roadGraphEdges": len(road_edges),
        "parkCount": park_count,
        "waterCount": water_count,
        "landmarkCount": len(landmarks),
        "sanctuaryCount": len(sanctuary_zones),
        "elevationSource": terrain["source"],
        "elevationMinMeters": terrain["minMeters"],
        "elevationMaxMeters": terrain["maxMeters"],
    }
    with open(os.path.join(OUT_DIR, "quality-report.json"), "w", encoding="utf-8") as f:
        json.dump(quality_report, f, ensure_ascii=False, indent=2)

    source_inspection = {
        "sourceUrl": ZIP_URL,
        "byteSize": len(raw),
        "sha256": actual_sha,
        "sha256Verified": True,
        "archiveManifest": src_manifest,
        "gpkgLayers": layer_reports,
        "overpassSupplement": overpass_supplement,
        "summary": {
            "hasBuildingsInGpkg": len(raw_buildings) > 0,
            "hasRoadsInGpkg": len(raw_roads) > 0,
            "hasParks": park_count > 0,
            "hasWater": water_count > 0,
            "worshipSanctuariesDetected": len(sanctuary_zones),
            "anonymizedPoisSelected": len(landmarks),
            "elevationSource": terrain["source"],
        },
    }
    with open(os.path.join(OUT_DIR, "source-inspection.json"), "w", encoding="utf-8") as f:
        json.dump(source_inspection, f, ensure_ascii=False, indent=2)

    print("ESENLER BUILD COMPLETE:")
    print(json.dumps(quality_report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
