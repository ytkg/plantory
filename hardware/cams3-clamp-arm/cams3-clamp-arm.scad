/* CamS3 5MP (U174-B / PY260), fully printed clamp arm. Units: mm.
 * No imported library. See README.md for print orientations and assembly.
 * Camera axes: X=24 mm width, Y=40 mm height, +Z=lens, -Y=Grove.
 */
use <printed-fasteners.scad>

/* [Output] */
part = "assembly"; // [assembly,assembly_two_arms,arm_60_base,arm_60_camera,plate_1,plate_2,clamp,arm,cradle,bezel,foot,clamp_screw,joint_screw,joint_nut,bezel_screw]
show_camera = true;
show_shelf = true;

/* [Fit - mm] */
shelf_thickness = 20; // [18:1:22]
arm_length = 120; // [80:5:140]
camera_clearance = 0.3; // [0.2:0.05:0.6]
thread_clearance = 0.35; // [0.2:0.05:0.5]

/* [Pose - display only, 15 degree steps] */
arm_angle = 45; // [15:15:90]
camera_angle = -30; // [-90:15:90]
elbow_angle = -30; // [-90:15:90]

/* [Hidden] */
$fn = 64;
eps = 0.02;
body_w = 24;
body_h = 40;
body_t = 8;
case_x = body_w + 2*camera_clearance;
case_y = body_h + 2*camera_clearance;
wall = 1.8;
back_t = 1.6; // Case rim seat: 1.6 mm clearance above the rear wall.
rear_wall_t = 1.6;
cradle_h = back_t + body_t + 0.4;
bezel_h = 1.6;
ear_x = 22;
gap = shelf_thickness + 10;
clamp_width = 30;
clamp_top_t = 6;
clamp_bottom_t = 8;
clamp_spine_t = 8;
clamp_outer_chamfer = 2; // 45-degree chamfers at the two outer spine corners.
clamp_thread_t = 10; // Preserve the tested engagement length at the screw only.
clamp_x = 34; // Keep the existing knob clear of the arm pivot on the upper jaw.
root = [-30,(-gap-clamp_bottom_t+clamp_top_t)/2]; // Outside the closed spine.
joint_r = 14;
joint_t = 6;
arm_t = 4;
tooth_h = 0.8;
tooth_count = 24;
pivot_depth = 20;

assert(shelf_thickness >= 18 && shelf_thickness <= 22, "Default screw supports 18-22 mm shelves.");
assert(arm_length >= 80 && arm_length <= 140, "A1 mini arm length range is 80-140 mm.");
assert(camera_clearance >= 0.2 && camera_clearance <= 0.6);
assert(thread_clearance >= 0.2 && thread_clearance <= 0.5);
assert(arm_angle % 15 == 0 && camera_angle % 15 == 0, "Joint poses must use 15 degree steps.");

module rounded_rect(w,h,r=3) {
    hull() for (x=[-w/2+r,w/2-r],y=[-h/2+r,h/2-r])
        translate([x,y]) circle(r=r);
}

// Triangular face teeth. Opposite face is shifted by half a tooth.
module face_teeth(phase=0) {
    for (i=[0:tooth_count-1]) rotate([0,0,i*360/tooth_count+phase]) {
        a=180/tooth_count;
        r0=9; r1=joint_r-0.5;
        polyhedron(
            points=[
                [r0*cos(-a),r0*sin(-a),-0.1], [r1*cos(-a),r1*sin(-a),-0.1],
                [r1*cos(a),r1*sin(a),-0.1], [r0*cos(a),r0*sin(a),-0.1],
                [r0,0,tooth_h], [r1,0,tooth_h]],
            // The flanks are slightly twisted: explicit triangles avoid
            // nonplanar polygon fallback in OpenSCAD 2021 / CGAL.
            faces=[[0,3,2],[0,2,1],[0,1,5],[0,5,4],
                   [1,2,5],[2,3,4],[2,4,5],[3,0,4]]);
    }
}

module pivot_plate(lower_teeth=false) {
    difference() {
        union() {
            cylinder(r=joint_r,h=joint_t);
            if(lower_teeth) mirror([0,0,1]) face_teeth(180/tooth_count);
            else translate([0,0,joint_t]) face_teeth();
        }
        translate([0,0,-2]) cylinder(d=10.8,h=joint_t+4);
    }
}

module clamp_body() {
    difference() {
        union() {
            linear_extrude(clamp_width) union() {
                translate([-clamp_spine_t,-gap-clamp_bottom_t])
                    square([clamp_spine_t,gap+clamp_bottom_t+clamp_top_t]);
                translate([-clamp_spine_t,0]) square([46+clamp_spine_t,clamp_top_t]);
                translate([-clamp_spine_t,-gap-clamp_bottom_t])
                    square([46+clamp_spine_t,clamp_bottom_t]);
                // Fillets at the inner spine / jaw corners.
                polygon([[0,0],[7,0],[0,-7]]);
                polygon([[0,-gap],[0,-gap+7],[7,-gap]]);
            }
            // Local screw seat: the broad jaw can be thinner while the female
            // thread retains its full 10 mm engagement and original phase.
            translate([clamp_x,clamp_thread_t,clamp_width/2]) rotate([90,0,0])
                cylinder(d=22,h=clamp_thread_t);
            translate([root[0],root[1],joint_t]) rotate([0,180,0]) pivot_plate(true);
            linear_extrude(joint_t) hull() {
                translate([-clamp_spine_t-2,root[1]-10]) square([4,20]);
                translate([root[0]+8,root[1]]) circle(r=7);
            }
        }
        // Upper jaw, axis -Y. Rotate to retain right-handed threads.
        translate([clamp_x,clamp_thread_t+eps,clamp_width/2]) rotate([90,0,0])
            thread_cutter(12,3,clamp_thread_t+2*eps,1.1,thread_clearance);
        // Clear the pivot hole through the neck union as well.
        translate([root[0],root[1],-2]) cylinder(d=10.8,h=joint_t+4);
        // Small outer corner cuts across the full width; retain inner braces.
        translate([-clamp_spine_t,clamp_top_t,-eps])
            linear_extrude(clamp_width+2*eps)
                polygon([[-eps,eps],[clamp_outer_chamfer+eps,eps],
                         [-eps,-clamp_outer_chamfer-eps]]);
        translate([-clamp_spine_t,-gap-clamp_bottom_t,-eps])
            linear_extrude(clamp_width+2*eps)
                polygon([[-eps,-eps],[clamp_outer_chamfer+eps,-eps],
                         [-eps,clamp_outer_chamfer+eps]]);
    }
}

module arm_link() {
    difference() {
        union() {
            linear_extrude(arm_t) hull() {
                circle(r=joint_r);
                translate([arm_length,0]) circle(r=joint_r);
            }
            for(x=[0,arm_length]) {
                translate([x,0,0]) cylinder(r=joint_r,h=joint_t);
                translate([x,0,joint_t]) face_teeth();
            }
        }
        for(x=[0,arm_length]) translate([x,0,-eps]) cylinder(d=10.8,h=joint_t+2);
        // Leave a broad continuous beam and solid material around both pivots.
        translate([arm_length/2,0,-eps]) linear_extrude(joint_t+2*eps)
            rounded_rect(arm_length-50,12,6);
        // Two cable tie / reusable printed cord positions, optional.
        for(x=[28,arm_length-28]) translate([x,10,-eps])
            linear_extrude(joint_t+2*eps) rounded_rect(5,3,1);
    }
}

// 60 mm pair: camera-link proximal teeth are half a tooth out of phase
// so the opposed faces interlock at 15-degree elbow positions.
module short_arm(camera_side=false) {
    difference() {
        union() {
            linear_extrude(arm_t) hull() {
                circle(r=joint_r);
                translate([60,0]) circle(r=joint_r);
            }
            for(x=[0,60]) {
                translate([x,0,0]) cylinder(r=joint_r,h=joint_t);
                translate([x,0,joint_t])
                    face_teeth(camera_side && x==0 ? 180/tooth_count : 0);
            }
        }
        for(x=[0,60]) translate([x,0,-eps]) cylinder(d=10.8,h=joint_t+2);
        // Offset centre slot identifies the proximal (middle-joint) end.
        translate([25,0,-eps]) linear_extrude(arm_t+2*eps) rounded_rect(5,3,1);
    }
}

module cradle_frame() {
    difference() {
        union() {
            linear_extrude(cradle_h) rounded_rect(case_x+2*wall,case_y+2*wall,5);
            for(s=[-1,1]) linear_extrude(cradle_h) hull() {
                translate([s*ear_x,0]) circle(r=7);
                translate([s*(case_x/2+wall-2),0]) circle(r=7);
            }
            // Closed rear wall; exposed PCB stays above it by back_t.
            translate([0,0,-rear_wall_t]) linear_extrude(rear_wall_t+eps) union() {
                rounded_rect(case_x+2*wall,case_y+2*wall,5);
                // Carry the side screw bosses down to the same print plane.
                for(s=[-1,1]) hull() {
                    translate([s*ear_x,0]) circle(r=7);
                    translate([s*(case_x/2+wall-2),0]) circle(r=7);
                }
            }
        }
        // Only the outer ~1 mm rim touches the case; stop at the rear wall.
        translate([0,0,0]) linear_extrude(cradle_h+eps)
            rounded_rect(body_w-2,body_h-2,2);
        translate([0,0,back_t]) linear_extrude(cradle_h)
            rounded_rect(case_x,case_y,3+camera_clearance);
        // One continuous port opening through front, back and bottom edge.
        translate([-9,-case_y/2-wall-eps,-rear_wall_t-eps])
            cube([18,9,cradle_h+rear_wall_t+2*eps]);
        for(s=[-1,1]) translate([s*ear_x,0,-eps])
            thread_cutter(6,1.5,cradle_h+2*eps,0.55,thread_clearance);
    }
}

module camera_cradle() {
    cradle_frame();
    // Tapered root distributes pivot load over the closed rear panel.
    hull() {
        translate([-joint_t/2,-7,-6]) cube([joint_t,14,2]);
        translate([-6,-7,-rear_wall_t]) cube([12,14,rear_wall_t]);
    }
    // Pivot normal is X; this changes lens tilt rather than merely camera roll.
    translate([joint_t/2,0,-pivot_depth]) rotate([0,-90,0]) pivot_plate(true);
    translate([-joint_t/2,-7,-pivot_depth+7]) cube([joint_t,14,pivot_depth-11+eps]);
}

module camera_bezel() {
    difference() {
        linear_extrude(bezel_h) union() {
            rounded_rect(case_x+2*wall,case_y+2*wall,5);
            for(s=[-1,1]) hull() {
                translate([s*ear_x,0]) circle(r=7);
                translate([s*(case_x/2+wall-2),0]) circle(r=7);
            }
        }
        translate([0,0,-eps]) linear_extrude(bezel_h+2*eps)
            rounded_rect(body_w-2,body_h-2,2);
        translate([-9,-case_y/2-wall-eps,-eps]) cube([18,9,bezel_h+2*eps]);
        for(s=[-1,1]) translate([s*ear_x,0,-eps]) cylinder(d=6.8,h=bezel_h+2*eps);
    }
}

module bezel_screw() {
    translate([0,0,-4]) cylinder(d=13,h=4.1,$fn=12);
    plastic_thread(6,1.5,11,0.55);
}

// Flat contact face is z=0. Four split fingers capture the D8 screw tip.
// The solid floor takes compression; the fingers only retain the unloaded foot.
module pressure_foot() {
    difference() {
        union() {
            cylinder(d=22,h=2.4);
            translate([0,0,2.3]) cylinder(d=11.6,h=5.7);
        }
        translate([0,0,2]) cylinder(d=8.6,h=3.3+eps);
        translate([0,0,5.3]) cylinder(d1=8.6,d2=7.2,h=1);
        translate([0,0,6.3-eps]) cylinder(d=7.2,h=0.7+2*eps);
        translate([0,0,7]) cylinder(d1=7.2,d2=9.2,h=1+eps);
        for(a=[0:90:270]) rotate([0,0,a])
            translate([0,-0.6,2.4]) cube([7,1.2,5.6+eps]);
    }
}

module camera_dummy() {
    color([0.9,0.91,0.87]) translate([0,0,back_t])
        linear_extrude(body_t) rounded_rect(body_w,body_h,3);
    color([0.10,0.13,0.16]) translate([0,6,back_t+body_t]) cylinder(d=9,h=3);
    color([0.02,0.03,0.04]) translate([0,6,back_t+body_t+3]) cylinder(d=5,h=0.1);
}

module holder_assembly() {
    color([0.23,0.45,0.38]) camera_cradle();
    color([0.38,0.65,0.52]) translate([0,0,cradle_h]) camera_bezel();
    for(s=[-1,1]) color([0.86,0.61,0.29]) translate([s*ear_x,0,cradle_h+bezel_h])
        rotate([180,0,0]) bezel_screw();
    if(show_camera) camera_dummy();
}

module assembled(two_arms=false) {
    color([0.23,0.45,0.38]) clamp_body();
    if(show_shelf) color([0.71,0.61,0.47,0.32])
        translate([8,-gap,-30]) cube([71,shelf_thickness,84]);
    color([0.86,0.61,0.29])
        translate([clamp_x,-gap+shelf_thickness+2+42,clamp_width/2])
            rotate([90,0,0]) clamp_screw();
    color([0.38,0.65,0.52]) translate([clamp_x,-gap+shelf_thickness,clamp_width/2])
        rotate([-90,0,0]) pressure_foot();
    translate([root[0],root[1],2*joint_t+tooth_h]) rotate([0,180,0]) {
        color([0.30,0.55,0.45]) rotate([0,0,arm_angle])
            if(two_arms) short_arm(); else arm_link();
        color([0.86,0.61,0.29]) joint_screw();
        color([0.86,0.61,0.29]) translate([0,0,2*joint_t+tooth_h]) joint_nut(thread_clearance);
        if(two_arms) {
            assert(elbow_angle % 15 == 0);
            translate([60*cos(arm_angle),60*sin(arm_angle),0]) {
                color([0.86,0.61,0.29]) joint_screw();
                color([0.86,0.61,0.29]) translate([0,0,2*joint_t+tooth_h])
                    joint_nut(thread_clearance);
                translate([0,0,2*joint_t+tooth_h]) rotate([0,180,0])
                    rotate([0,0,180-arm_angle-elbow_angle]) {
                        color([0.38,0.65,0.52]) short_arm(true);
                        translate([60,0,0]) arm_tip_assembly();
                    }
            }
        } else translate([arm_length*cos(arm_angle),arm_length*sin(arm_angle),0])
            arm_tip_assembly();
    }
}

module arm_tip_assembly() {
            color([0.86,0.61,0.29]) joint_screw();
            color([0.86,0.61,0.29]) translate([0,0,2*joint_t+tooth_h]) joint_nut(thread_clearance);
            translate([0,0,joint_t+tooth_h+joint_t/2]) rotate([0,0,camera_angle])
                translate([pivot_depth,0,0]) rotate([0,90,0]) holder_assembly();
}

// STL outputs all sit on z=0 in their recommended print orientation.
module print_clamp() { clamp_body(); } // Flat pivot back on bed; teeth face up.
module print_cradle() { translate([0,0,cradle_h]) rotate([180,0,0]) camera_cradle(); }
module plate_1() {
    translate([54,48,0]) print_clamp();
    translate([20,150,0]) arm_link();
    translate([135,92,0]) print_cradle();
    translate([44,96,0]) camera_bezel();
}
module plate_2() {
    translate([24,24,5]) clamp_screw();
    for(x=[63,101]) translate([x,24,4]) joint_screw();
    for(x=[24,63]) translate([x,62,0]) joint_nut(thread_clearance);
    translate([101,62,0]) pressure_foot();
    for(x=[24,48]) translate([x,99,4]) bezel_screw();
}
if(part=="assembly") rotate([90,0,0]) assembled();
else if(part=="assembly_two_arms") rotate([90,0,0]) assembled(true);
else if(part=="arm_60_base") short_arm();
else if(part=="arm_60_camera") short_arm(true);
else if(part=="plate_1") plate_1();
else if(part=="plate_2") plate_2();
else if(part=="clamp") print_clamp();
else if(part=="arm") arm_link();
else if(part=="cradle") print_cradle();
else if(part=="bezel") camera_bezel();
else if(part=="foot") pressure_foot();
else if(part=="clamp_screw") translate([0,0,5]) clamp_screw();
else if(part=="joint_screw") translate([0,0,4]) joint_screw();
else if(part=="joint_nut") joint_nut(thread_clearance);
else if(part=="bezel_screw") translate([0,0,4]) bezel_screw();
else assert(false,"Unknown part selector");
