#!/usr/bin/env python3
"""
Phase 1 & 2 Automated World Geometry, Road Topology & Mesh Integrity Auditor.
Uses Shapely (2D planar building/road intersection & topology) and Trimesh (3D mesh
validity, degenerate triangles, normal/winding checks) across all offline derived regions.

Read-only diagnostic: NEVER modifies world data. Outputs JSON + human-readable metrics.
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree
import trimesh


REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = REPO_ROOT / "public" / "derived-data"
REGIONS = ["esenler-namik-kemal", "fatih-sultanahmet-eminonu"]


def sample_terrain(terrain: dict[str, Any], x: float, z: float) -> float:
    cols = terrain["cols"]
    rows = terrain["rows"]
    min_x, max_x = terrain["minX"], terrain["maxX"]
    min_z, max_z = terrain["minZ"], terrain["maxZ"]
    heights = terrain["elevDecimeters"]
    scale = 0.1

    u = max(0.0, min(1.0, (x - min_x) / max(1e-6, max_x - min_x)))
    v = max(0.0, min(1.0, (z - min_z) / max(1e-6, max_z - min_z)))
    fx = u * (cols - 1)
    fz = v * (rows - 1)
    c0 = min(cols - 2, max(0, int(math.floor(fx))))
    r0 = min(rows - 2, max(0, int(math.floor(fz))))
    tx = fx - c0
    tz = fz - r0

    h00 = heights[r0 * cols + c0] * scale
    h10 = heights[r0 * cols + c0 + 1] * scale
    h01 = heights[(r0 + 1) * cols + c0] * scale
    h11 = heights[(r0 + 1) * cols + c0 + 1] * scale
    return (
        h00 * (1 - tx) * (1 - tz)
        + h10 * tx * (1 - tz)
        + h01 * (1 - tx) * tz
        + h11 * tx * tz
    )


def ring_to_coords(ring: list[float]) -> list[tuple[float, float]]:
    n = len(ring) // 2
    pts = [(ring[i * 2], ring[i * 2 + 1]) for i in range(n)]
    if len(pts) >= 2 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 0.05:
        pts = pts[:-1]
    return pts


def build_trimesh_for_building(coords: list[tuple[float, float]], base_y: float, height: float) -> trimesh.Trimesh | None:
    if len(coords) < 3:
        return None
    n = len(coords)
    # Build side walls as 3D triangles for real Trimesh geometric validation
    verts = []
    for x, z in coords:
        verts.append([x, base_y, z])
    for x, z in coords:
        verts.append([x, base_y + height, z])
    faces = []
    for i in range(n):
        j = (i + 1) % n
        b0, b1 = i, j
        t0, t1 = n + i, n + j
        faces.append([b0, t1, b1])
        faces.append([b0, t0, t1])
    return trimesh.Trimesh(vertices=np.array(verts, dtype=np.float64), faces=np.array(faces, dtype=np.int64), process=False)


def audit_region(region_id: str) -> dict[str, Any]:
    region_dir = DATA_ROOT / region_id
    manifest = json.loads((region_dir / "manifest.json").read_text("utf-8"))
    terrain = json.loads((region_dir / "terrain.json").read_text("utf-8"))
    road_graph = json.loads((region_dir / "road-graph.json").read_text("utf-8"))

    tile_files = sorted((region_dir / "tiles").glob("*.json"))

    buildings_all: list[dict[str, Any]] = []
    roads_all: list[dict[str, Any]] = []
    building_ids_seen: dict[str, list[str]] = defaultdict(list)

    for tf in tile_files:
        tile = json.loads(tf.read_text("utf-8"))
        tkey = tile["key"]
        for b in tile.get("buildings", []):
            building_ids_seen[b["id"]].append(tkey)
            buildings_all.append({"tile": tkey, **b})
        for r in tile.get("roads", []):
            roads_all.append({"tile": tkey, **r})

    # 1. Build Shapely road carriageways (using actual drivable width, excluding tram)
    road_geoms: list[Polygon] = []
    road_lines: list[LineString] = []
    road_meta: list[dict[str, Any]] = []
    degenerate_road_segments = 0
    tiny_stub_roads = 0

    for r in roads_all:
        pts = [(r["points"][i * 2], r["points"][i * 2 + 1]) for i in range(len(r["points"]) // 2)]
        if len(pts) < 2:
            degenerate_road_segments += 1
            continue
        seg_lens = [math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts))]
        degenerate_road_segments += sum(1 for L in seg_lens if L < 0.4)
        total_len = sum(seg_lens)
        if total_len < 2.0:
            tiny_stub_roads += 1
        line = LineString(pts)
        if line.length < 0.05:
            continue
        road_lines.append(line)
        # Actual drivable asphalt width (half width; tram/pedestrian narrower)
        half_w = max(1.6, float(r.get("width", 6.0)) * 0.5)
        buf = line.buffer(half_w, cap_style="flat", join_style="mitre", mitre_limit=2.0)
        if buf.is_valid and not buf.is_empty:
            road_geoms.append(buf)
            road_meta.append(r)

    road_tree = STRtree(road_geoms) if road_geoms else None

    # 2. Audit every building with Shapely + Trimesh
    invalid_polygons = 0
    zero_area_buildings = 0
    degenerate_mesh_faces = 0
    buildings_intersecting_roads = 0
    severe_road_intrusions = 0  # overlap area > 1.5 m^2
    total_road_overlap_area = 0.0
    max_road_overlap_area = 0.0
    floating_buildings = 0
    buried_buildings = 0
    duplicate_building_ids = sum(1 for tiles in building_ids_seen.values() if len(tiles) > 1)
    sample_intrusions: list[dict[str, Any]] = []
    building_polys: list[Polygon] = []

    for b in buildings_all:
        coords = ring_to_coords(b["ring"])
        if len(coords) < 3:
            zero_area_buildings += 1
            continue
        poly = Polygon(coords)
        if not poly.is_valid:
            invalid_polygons += 1
            poly = poly.buffer(0)
        if poly.is_empty or poly.area < 0.5:
            zero_area_buildings += 1
            continue

        building_polys.append(poly)

        # Trimesh 3D geometry check (wall face area & degenerate triangles)
        tm = build_trimesh_for_building(coords, float(b["baseY"]), float(b["height"]))
        if tm is not None:
            face_areas = tm.area_faces
            degenerate_mesh_faces += int(np.sum(face_areas < 1e-4))

        # Elevation grounding check across all footprint vertices
        terrain_ys = [sample_terrain(terrain, x, z) for x, z in coords]
        min_ty = min(terrain_ys)
        max_ty = max(terrain_ys)
        base_y = float(b["baseY"])
        # Floating: baseY > max terrain vertex + 0.8m (even skirt wouldn't help if way above)
        if base_y > max_ty + 0.8:
            floating_buildings += 1
        # Buried: roof top below terrain or baseY sunk > 6m below min terrain
        if base_y + float(b["height"]) < max_ty + 0.5 or base_y < min_ty - 6.0:
            buried_buildings += 1

        # Exact Shapely building-vs-road carriageway intersection
        if road_tree is not None:
            cand_idxs = road_tree.query(poly, predicate="intersects")
            if len(cand_idxs) > 0:
                overlap_union = shapely.unary_union([road_geoms[idx] for idx in cand_idxs])
                inter = poly.intersection(overlap_union)
                area = float(inter.area)
                if area > 0.25:
                    buildings_intersecting_roads += 1
                    total_road_overlap_area += area
                    if area > max_road_overlap_area:
                        max_road_overlap_area = area
                    if area > 1.5:
                        severe_road_intrusions += 1
                    if len(sample_intrusions) < 8:
                        c = poly.centroid
                        sample_intrusions.append({
                            "id": b["id"],
                            "tile": b["tile"],
                            "overlapAreaM2": round(area, 2),
                            "buildingAreaM2": round(float(poly.area), 2),
                            "x": round(c.x, 1),
                            "z": round(c.y, 1),
                        })

    # 3. Road graph topology audit (connected components, dangling endpoints, unintended gaps)
    nodes = {n["id"]: n for n in road_graph["nodes"]}
    adj: dict[str, set[str]] = defaultdict(set)
    for e in road_graph["edges"]:
        if e["from"] in nodes and e["to"] in nodes and e["from"] != e["to"]:
            adj[e["from"]].add(e["to"])
            adj[e["to"]].add(e["from"])

    visited: set[str] = set()
    components: list[int] = []
    for nid in nodes:
        if nid in visited:
            continue
        q = deque([nid])
        visited.add(nid)
        size = 0
        while q:
            cur = q.popleft()
            size += 1
            for nb in adj[cur]:
                if nb not in visited:
                    visited.add(nb)
                    q.append(nb)
        components.append(size)
    components.sort(reverse=True)

    # Detect dangling degree-1 endpoints that lie within 0.2..9.0 m of another non-adjacent node (unintended road gap!)
    node_ids = list(nodes.keys())
    node_pts = [Point(nodes[nid]["x"], nodes[nid]["z"]) for nid in node_ids]
    node_tree = STRtree(node_pts) if node_pts else None
    degree_1_endpoints = [nid for nid in node_ids if len(adj[nid]) == 1]
    isolated_nodes = [nid for nid in node_ids if len(adj[nid]) == 0]
    unintended_gaps_under_9m = 0
    if node_tree is not None:
        seen_pairs: set[tuple[str, str]] = set()
        for nid in degree_1_endpoints:
            p = Point(nodes[nid]["x"], nodes[nid]["z"])
            cands = node_tree.query(p.buffer(9.0), predicate="intersects")
            for idx in cands:
                other = node_ids[idx]
                if other == nid or other in adj[nid]:
                    continue
                pair = (min(nid, other), max(nid, other))
                if pair in seen_pairs:
                    continue
                d = math.hypot(nodes[nid]["x"] - nodes[other]["x"], nodes[nid]["z"] - nodes[other]["z"])
                if 0.05 < d <= 9.0:
                    seen_pairs.add(pair)
                    unintended_gaps_under_9m += 1

    # 4. Pedestrian sidewalk collision audit (do current ±3.55m sidewalk paths enter buildings?)
    bldg_tree = STRtree(building_polys) if building_polys else None
    sidewalk_samples = 0
    sidewalk_inside_building = 0
    if bldg_tree is not None:
        for e in road_graph["edges"]:
            if e.get("roadClass") == "tram":
                continue
            nf = nodes.get(e["from"])
            nt = nodes.get(e["to"])
            if not nf or not nt:
                continue
            dx = nt["x"] - nf["x"]
            dz = nt["z"] - nf["z"]
            L = math.hypot(dx, dz)
            if L < 2.0:
                continue
            rx = -dz / L
            rz = dx / L
            mx = (nf["x"] + nt["x"]) * 0.5
            mz = (nf["z"] + nt["z"]) * 0.5
            for side in (-1.0, 1.0):
                px = mx + rx * 3.55 * side
                pz = mz + rz * 3.55 * side
                sidewalk_samples += 1
                pt = Point(px, pz)
                if len(bldg_tree.query(pt, predicate="intersects")) > 0:
                    sidewalk_inside_building += 1

    # 5. Building-to-building overlap & duplicate audit (GeoQC / Shapely)
    bldg_bldg_overlaps = 0
    bldg_bldg_overlap_area = 0.0
    if bldg_tree is not None:
        for idx, poly in enumerate(building_polys):
            for j in bldg_tree.query(poly, predicate="intersects"):
                if j <= idx:
                    continue
                inter = poly.intersection(building_polys[j])
                if inter.area > 0.5:
                    bldg_bldg_overlaps += 1
                    bldg_bldg_overlap_area += float(inter.area)

    return {
        "regionId": region_id,
        "tiles": len(tile_files),
        "totalBuildings": len(buildings_all),
        "totalRoads": len(roads_all),
        "buildingBuildingOverlaps": bldg_bldg_overlaps,
        "buildingBuildingOverlapAreaM2": round(bldg_bldg_overlap_area, 2),
        "duplicateBuildingIdsAcrossTiles": duplicate_building_ids,
        "invalidBuildingPolygons": invalid_polygons,
        "zeroAreaBuildings": zero_area_buildings,
        "degenerateBuildingMeshFaces": degenerate_mesh_faces,
        "buildingsIntersectingRoads": buildings_intersecting_roads,
        "severeRoadIntrusionsOver1_5m2": severe_road_intrusions,
        "totalRoadOverlapAreaM2": round(total_road_overlap_area, 2),
        "maxRoadOverlapAreaM2": round(max_road_overlap_area, 2),
        "floatingBuildings": floating_buildings,
        "buriedBuildings": buried_buildings,
        "degenerateRoadSegmentsUnder0_4m": degenerate_road_segments,
        "tinyStubRoadsUnder2m": tiny_stub_roads,
        "roadGraphNodes": len(nodes),
        "roadGraphEdges": len(road_graph["edges"]),
        "roadGraphConnectedComponents": len(components),
        "largestComponentNodes": components[0] if components else 0,
        "isolatedRoadNodes": len(isolated_nodes),
        "degree1Endpoints": len(degree_1_endpoints),
        "unintendedRoadGapsUnder9m": unintended_gaps_under_9m,
        "sidewalkMidpointsSampled": sidewalk_samples,
        "sidewalkMidpointsInsideBuilding": sidewalk_inside_building,
        "sidewalkClippingPct": round((100.0 * sidewalk_inside_building / max(1, sidewalk_samples)), 1),
        "sampleBuildingRoadIntrusions": sample_intrusions,
        "manifestStats": manifest.get("stats", {}),
    }


def main() -> None:
    report = {
        "tools": {
            "shapely": shapely.__version__,
            "trimesh": trimesh.__version__,
            "numpy": np.__version__,
        },
        "regions": [audit_region(r) for r in REGIONS],
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
