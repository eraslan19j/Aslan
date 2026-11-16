#!/usr/bin/env python3
"""
Downloads Esenler / Namik Kemal Mahallesi osm_data.zip, verifies SHA-256,
and writes a detailed structural & semantic layer inspection report.
"""
import collections
import hashlib
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ZIP_URL = "https://github.com/eraslan19j/ist/releases/download/v1.1-esenler-data/osm_data.zip"
EXPECTED_SHA256 = "8849228b90c2ac807e707bfc91e1b6d0bddb40107afb4962951b20654f621fff"


def update_bbox(bbox, lon, lat):
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return
    bbox["west"] = min(bbox["west"], lon)
    bbox["east"] = max(bbox["east"], lon)
    bbox["south"] = min(bbox["south"], lat)
    bbox["north"] = max(bbox["north"], lat)


def walk_coords(coords, bbox):
    if not isinstance(coords, list) or not coords:
        return
    if isinstance(coords[0], (int, float)) and len(coords) >= 2:
        update_bbox(bbox, float(coords[0]), float(coords[1]))
    else:
        for item in coords:
            walk_coords(item, bbox)


def inspect_geojson(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    features = data.get("features", []) if isinstance(data, dict) else []
    geom_types = collections.Counter()
    prop_keys = collections.Counter()
    key_values = collections.defaultdict(collections.Counter)
    poi_samples = []
    worship_samples = []
    bbox = {"west": 999.0, "east": -999.0, "south": 999.0, "north": -999.0}

    interesting_keys = (
        "building", "building:levels", "height", "highway", "surface", "oneway",
        "amenity", "shop", "leisure", "landuse", "natural", "water", "waterway",
        "railway", "public_transport", "place", "boundary", "religion",
    )

    for feat in features:
        geom = feat.get("geometry") or {}
        gtype = geom.get("type", "unknown")
        geom_types[gtype] += 1
        walk_coords(geom.get("coordinates"), bbox)
        props = feat.get("properties") or {}
        for k, v in props.items():
            if v is None or v == "":
                continue
            prop_keys[k] += 1
            if k in interesting_keys:
                key_values[k][str(v)] += 1

        amenity = str(props.get("amenity", ""))
        shop = str(props.get("shop", ""))
        leisure = str(props.get("leisure", ""))
        if amenity == "place_of_worship":
            worship_samples.append({
                "name": props.get("name"),
                "religion": props.get("religion"),
                "geomType": gtype,
                "props": {k: props[k] for k in list(props.keys())[:10]},
            })
        elif (
            amenity in ("school", "cafe", "tea", "marketplace", "pharmacy", "clinic", "hospital", "community_centre", "fountain")
            or shop in ("convenience", "supermarket", "bakery", "greengrocer", "butcher", "tea", "kiosk")
            or leisure in ("park", "playground", "pitch", "garden")
        ):
            if len(poi_samples) < 80:
                poi_samples.append({
                    "name": props.get("name"),
                    "amenity": props.get("amenity"),
                    "shop": props.get("shop"),
                    "leisure": props.get("leisure"),
                    "geomType": gtype,
                })

    return {
        "format": "geojson",
        "featureCount": len(features),
        "geometryTypes": dict(geom_types),
        "bbox": bbox if bbox["west"] < 900 else None,
        "topPropertyKeys": dict(prop_keys.most_common(40)),
        "keyValueCounts": {k: dict(v.most_common(20)) for k, v in key_values.items()},
        "worshipCount": len(worship_samples),
        "worshipSamples": worship_samples[:25],
        "poiSamples": poi_samples[:50],
        "sampleFeatureProperties": [
            (features[i].get("properties") or {}) for i in range(min(3, len(features)))
        ],
    }


def inspect_osm_xml(path):
    counts = collections.Counter()
    key_counts = collections.Counter()
    key_values = collections.defaultdict(collections.Counter)
    worship_samples = []
    poi_samples = []
    bbox = {"west": 999.0, "east": -999.0, "south": 999.0, "north": -999.0}
    interesting_keys = (
        "building", "building:levels", "height", "highway", "surface", "oneway",
        "amenity", "shop", "leisure", "landuse", "natural", "water", "waterway",
        "railway", "religion",
    )

    for _ev, elem in ET.iterparse(path, events=("end",)):
        tag = elem.tag
        if tag in ("node", "way", "relation"):
            counts[tag] += 1
            if tag == "node":
                lat = elem.attrib.get("lat")
                lon = elem.attrib.get("lon")
                if lat and lon:
                    update_bbox(bbox, float(lon), float(lat))
            tags = {t.attrib["k"]: t.attrib["v"] for t in elem.findall("tag") if "k" in t.attrib and "v" in t.attrib}
            for k, v in tags.items():
                key_counts[k] += 1
                if k in interesting_keys:
                    key_values[k][v] += 1
            if tags.get("amenity") == "place_of_worship":
                worship_samples.append({"type": tag, "id": elem.attrib.get("id"), "tags": tags})
            elif (
                tags.get("amenity") in ("school", "cafe", "marketplace", "fountain", "community_centre")
                or tags.get("shop") in ("convenience", "supermarket", "bakery", "greengrocer")
                or tags.get("leisure") in ("park", "playground", "pitch")
            ):
                if len(poi_samples) < 80:
                    poi_samples.append({"type": tag, "id": elem.attrib.get("id"), "tags": tags})
            elem.clear()

    return {
        "format": "osm-xml",
        "elementCounts": dict(counts),
        "bbox": bbox if bbox["west"] < 900 else None,
        "topTagKeys": dict(key_counts.most_common(40)),
        "keyValueCounts": {k: dict(v.most_common(20)) for k, v in key_values.items()},
        "worshipCount": len(worship_samples),
        "worshipSamples": worship_samples[:25],
        "poiSamples": poi_samples[:50],
    }


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "public/derived-data/esenler-namik-kemal/source-inspection.json"
    zip_path = "/tmp/esenler_osm_data.zip"
    extract_dir = "/tmp/esenler_extracted"

    print(f"Downloading {ZIP_URL} ...")
    urllib.request.urlretrieve(ZIP_URL, zip_path)

    with open(zip_path, "rb") as f:
        raw = f.read()
    actual_sha256 = hashlib.sha256(raw).hexdigest()
    print(f"Size: {len(raw)} bytes, SHA-256: {actual_sha256}")
    if actual_sha256 != EXPECTED_SHA256:
        raise RuntimeError(
            f"SHA-256 mismatch! expected={EXPECTED_SHA256} actual={actual_sha256}"
        )

    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)
        members = [
            {
                "filename": info.filename,
                "fileSize": info.file_size,
                "compressSize": info.compress_size,
            }
            for info in zf.infolist()
        ]

    inspected_files = {}
    for root, _dirs, files in os.walk(extract_dir):
        for fname in sorted(files):
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, extract_dir)
            ext = os.path.splitext(fname)[1].lower()
            size = os.path.getsize(full)
            try:
                if ext in (".geojson", ".json"):
                    with open(full, "r", encoding="utf-8") as f:
                        head = f.read(200).lstrip()
                    if '"FeatureCollection"' in head or ext == ".geojson":
                        inspected_files[rel] = inspect_geojson(full)
                    else:
                        with open(full, "r", encoding="utf-8") as f:
                            obj = json.load(f)
                        inspected_files[rel] = {
                            "format": "json",
                            "size": size,
                            "topKeys": list(obj.keys())[:30] if isinstance(obj, dict) else f"list[{len(obj)}]",
                        }
                elif ext in (".osm", ".xml"):
                    inspected_files[rel] = inspect_osm_xml(full)
                else:
                    with open(full, "rb") as f:
                        magic = f.read(32).hex()
                    inspected_files[rel] = {"format": ext or "binary", "size": size, "magicHex": magic}
            except Exception as exc:
                inspected_files[rel] = {"format": ext, "size": size, "error": str(exc)}

    report = {
        "sourceUrl": ZIP_URL,
        "byteSize": len(raw),
        "sha256": actual_sha256,
        "sha256Verified": True,
        "zipMembers": members,
        "files": inspected_files,
    }

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("INSPECTION SUMMARY:")
    print(json.dumps({
        "sha256Verified": True,
        "members": members,
        "fileKeys": list(inspected_files.keys()),
    }, indent=2))


if __name__ == "__main__":
    main()
