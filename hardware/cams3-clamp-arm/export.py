#!/usr/bin/env python3
"""Export OpenSCAD parts and verify closed, connected, A1-mini-sized meshes."""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import shutil
import struct
import subprocess

HERE = Path(__file__).resolve().parent
PARTS = {
    "clamp": 1, "arm": 1, "cradle": 1, "bezel": 1, "foot": 1,
    "clamp_screw": 1, "joint_screw": 1, "joint_nut": 1,
    "bezel_screw": 1, "plate_1": 4, "plate_2": 8,
    "arm_60_base": 1, "arm_60_camera": 1,
}


def inspect_mesh(path, expected_components):
    data = path.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0]
    if len(data) != 84 + 50 * count:
        raise ValueError(f"{path.name}: expected a binary STL")
    edges = defaultdict(list)
    vertices = []
    parent = list(range(count))
    volume = 0.0

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(count):
        raw = struct.unpack_from("<12fH", data, 84 + i * 50)
        # CGAL can emit very short but valid edges. Keep exact binary STL
        # vertices: rounding would merge them and invent nonmanifold edges.
        tri = [tuple(raw[k:k+3]) for k in (3, 6, 9)]
        vertices.extend(tri)
        a, b, c = tri
        volume += (a[0]*(b[1]*c[2]-b[2]*c[1])
                   + a[1]*(b[2]*c[0]-b[0]*c[2])
                   + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6
        for a, b in ((tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])):
            edges[tuple(sorted((a, b)))].append((i, 1 if a < b else -1))
    invalid = sum(len(e) != 2 or sum(sign for _, sign in e) != 0 for e in edges.values())
    if invalid:
        raise ValueError(f"{path.name}: {invalid} open/nonmanifold/inconsistently wound edges")
    for e in edges.values():
        parent[root(e[0][0])] = root(e[1][0])
    components = len({root(i) for i in range(count)})
    low = [min(v[k] for v in vertices) for k in range(3)]
    high = [max(v[k] for v in vertices) for k in range(3)]
    size = [round(high[k] - low[k], 3) for k in range(3)]
    if components != expected_components:
        raise ValueError(f"{path.name}: {components} shells, expected {expected_components}")
    if max(size) > 180.01 or abs(low[2]) > 0.01 or volume <= 0:
        raise ValueError(f"{path.name}: bad print bounds or orientation: {low}, {size}, {volume}")
    return {"triangles": count, "closed": True, "components": components,
            "size_mm": size, "min_z_mm": low[2], "volume_mm3": round(volume, 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--openscad", default=shutil.which("openscad"))
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--check-only", action="store_true", help="Verify existing STLs without rendering again")
    parser.add_argument("--parts", nargs="+", choices=PARTS, default=list(PARTS))
    args = parser.parse_args()
    if not args.openscad:
        parser.error("OpenSCAD was not found; supply --openscad /path/to/openscad")
    output = HERE
    output.mkdir(exist_ok=True)

    def export(part):
        path = output / f"{part}.stl"
        if not args.check_only:
            result = subprocess.run(
                [args.openscad, "--hardwarnings", "--export-format=binstl",
                 "-D", f'part="{part}"', "-o", str(path), str(HERE / "cams3-clamp-arm.scad")],
                capture_output=True, text=True, timeout=900)
            if result.returncode or any(marker in result.stderr.lower() for marker in
                                        ("error:", "warning:", "nonplanar faces")):
                raise RuntimeError(f"{part}: {result.stdout}\n{result.stderr}")
        report = inspect_mesh(path, PARTS[part])
        print(f"{part}: closed, {report['components']} shell(s), {report['size_mm']} mm", flush=True)
        return part, report

    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        reports = dict(pool.map(export, args.parts))
    report_path = HERE / "mesh-checks.json"
    previous = json.loads(report_path.read_text()) if report_path.exists() else {}
    previous.update(reports)
    report_path.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
