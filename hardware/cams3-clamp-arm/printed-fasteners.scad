/*
 * Printed fasteners for the CamS3 clamp arm. Millimetres; OpenSCAD 2021.01.
 * Self-contained: no external screw/thread library and no top-level geometry.
 *
 * plastic_thread(diameter, pitch, length, depth, clearance=0)
 *   Right-hand, single-start external thread, axis +Z, ends z=0 and z=length.
 *   diameter is the nominal MAJOR diameter; depth is the radial thread depth.
 *   Positive clearance REDUCES every male radius: major = diameter-2*clearance.
 * thread_cutter(diameter, pitch, length, depth, clearance=0.35)
 *   Matching solid to subtract for a genuinely helical female hole, z=0..length.
 *   Positive clearance INCREASES every cutter radius: major=diameter+2*clearance.
 *   Its phase matches plastic_thread() at the same local Z and rotation.
 *   Extend holes past both end faces and add an entry chamfer in the parent part.
 *
 * clamp_screw(clearance=0): thread z=0..36, captive tip to z=42; knob z=-5..0.
 * joint_screw(clearance=0): shaft z=0..24; knob z=-4..0, maximum diameter 26.
 * joint_nut(clearance=0.35): z=0..8, maximum diameter 26, matching D10/P2.5 hole.
 * Translate screws by +5 or +4 in Z to put their knob bottoms on the print bed.
 * Nuts print flat as defined. Use 0.20 mm layers and no thread supports.
 *
 * Nominal male sizes: clamp major/root D12/D9.8, pitch 3; joint D10/D8, pitch 2.5.
 * Default female major/root diameters: clamp D12.7/D10.5, joint D10.7/D8.7.
 * The 0.35 mm default is RADIAL, i.e. 0.70 mm diametric allowance. Validate with
 * a small sample after changing printer/material settings: extrusion and
 * elephant-foot compensation change fit. The current clearance was physically
 * checked by the user. These are custom plastic threads, not metal metric ones.
 */

PRINTED_THREAD_RADIAL_CLEARANCE = 0.35;
PRINTED_THREAD_SEGMENTS_PER_TURN = 72;

// A helical trapezoidal rib, with its root buried in the core for a solid union.
// Crest width 0.16*pitch; root width 0.96*pitch; radial rise is over 0.40*pitch.
// Including the buried root overlap gives 45..48 degree underside flanks.
module _printed_thread_rib(major_radius, root_radius, pitch, length) {
    root_overlap = 0.10;
    turns = length / pitch + 2;
    steps = ceil(turns * PRINTED_THREAD_SEGMENTS_PER_TURN);
    profile = [
        [root_radius-root_overlap, -0.48*pitch],
        [major_radius,             -0.08*pitch],
        [major_radius,              0.08*pitch],
        [root_radius-root_overlap,  0.48*pitch]
    ];
    points = [
        for (i=[0:steps], j=[0:3])
            let(angle=360*turns*i/steps,
                radius=profile[j][0],
                z=-pitch+pitch*turns*i/steps+profile[j][1])
            [radius*cos(angle), radius*sin(angle), z]
    ];
    faces = concat(
        [[3,2,1,0]],
        // Sweep quads are slightly twisted; explicit triangles keep CGAL 2021
        // from encountering nonplanar faces when intersecting the female hole.
        [for (i=[0:steps-1], j=[0:3], half=[0:1])
            let(a=4*i+j, b=4*i+(j+1)%4,
                c=4*(i+1)+(j+1)%4, d=4*(i+1)+j)
            half==0 ? [a,b,c] : [a,c,d]],
        [[4*steps,4*steps+1,4*steps+2,4*steps+3]]
    );
    polyhedron(points=points, faces=faces, convexity=ceil(turns*2)+2);
}

module _printed_thread_shape(diameter, pitch, length, depth, radial_offset=0) {
    major_radius = diameter/2 + radial_offset;
    root_radius = major_radius-depth;
    assert(pitch > 0 && length > 0 && depth > 0,
           "Thread pitch, length and radial depth must be positive.");
    assert(root_radius > 0.5, "Thread core is too small for the selected clearance.");
    intersection() {
        union() {
            cylinder(r=root_radius, h=length, $fn=PRINTED_THREAD_SEGMENTS_PER_TURN);
            _printed_thread_rib(major_radius, root_radius, pitch, length);
        }
        // Clip the overrun cleanly so both ends have a flat, printable face.
        translate([-major_radius-1,-major_radius-1,0])
            cube([2*major_radius+2,2*major_radius+2,length]);
    }
}

module plastic_thread(diameter, pitch, length, depth, clearance=0) {
    _printed_thread_shape(diameter, pitch, length, depth, -clearance);
}

module thread_cutter(diameter, pitch, length, depth,
                     clearance=PRINTED_THREAD_RADIAL_CLEARANCE) {
    _printed_thread_shape(diameter, pitch, length, depth, clearance);
}

// Six large scallops supply finger grip without fragile decorative knurling.
// The first 0.6 mm is bevelled inward to limit elephant-foot interference.
module _printed_thumb_knob(diameter, height) {
    difference() {
        union() {
            cylinder(d1=diameter-1.2,d2=diameter,h=0.6,$fn=96);
            translate([0,0,0.6]) cylinder(d=diameter,h=height-1.2,$fn=96);
            translate([0,0,height-0.6])
                cylinder(d1=diameter,d2=diameter-1.2,h=0.6,$fn=96);
        }
        for (angle=[0:60:300])
            rotate([0,0,angle]) translate([diameter/2+2.4,0,-0.1])
                cylinder(r=4,h=height+0.2,$fn=32);
    }
}

module _printed_screw(diameter, pitch, length, depth, knob_d, knob_h, clearance) {
    union() {
        translate([0,0,-knob_h]) _printed_thumb_knob(knob_d,knob_h);
        // Deliberate 0.15 mm overlap avoids coplanar contact at the knob/shaft join.
        translate([0,0,-0.15])
            cylinder(d=diameter-2*depth-2*clearance,h=0.3,
                     $fn=PRINTED_THREAD_SEGMENTS_PER_TURN);
        intersection() {
            plastic_thread(diameter,pitch,length,depth,clearance);
            union() {
                cylinder(d=diameter+0.2,h=length-1.2,$fn=96);
                translate([0,0,length-1.2])
                    cylinder(d1=diameter+0.2,d2=diameter-2*depth-2*clearance,
                             h=1.2,$fn=96);
            }
        }
    }
}

module clamp_screw(clearance=0) {
    _printed_screw(diameter=12,pitch=3,length=36,depth=1.1,
                   knob_d=26,knob_h=5,clearance=clearance);
    // D8 head passes through the existing female thread's D10.5 minor bore.
    // Narrow neck lets the split socket rotate after the head snaps past its lip.
    translate([0,0,35.8]) cylinder(d=6.4,h=3.4,$fn=64);
    translate([0,0,38.2]) cylinder(d1=6.4,d2=8,h=0.8,$fn=64);
    translate([0,0,39]) cylinder(d=8,h=1,$fn=64);
    translate([0,0,40]) cylinder(d1=8,d2=6,h=2,$fn=64);
}

module joint_screw(clearance=0) {
    _printed_screw(diameter=10,pitch=2.5,length=24,depth=1,
                   knob_d=26,knob_h=4,clearance=clearance);
}

module joint_nut(clearance=PRINTED_THREAD_RADIAL_CLEARANCE) {
    difference() {
        _printed_thumb_knob(diameter=26,height=8);
        // A whole-pitch translation preserves the male/female helix phase at z=0.
        translate([0,0,-2.5])
            thread_cutter(diameter=10,pitch=2.5,length=13,depth=1,clearance=clearance);
        // Both entrances have a 1 mm lead-in; the female helix remains inside.
        translate([0,0,-0.01])
            cylinder(d1=12+2*clearance,d2=8+2*clearance,h=1.01,$fn=96);
        translate([0,0,7])
            cylinder(d1=8+2*clearance,d2=12+2*clearance,h=1.01,$fn=96);
    }
}
