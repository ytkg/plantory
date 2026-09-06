/*
 * Plantory / Unit Mini Scales (U177) integrated saucer
 *
 * A one-piece water-catching saucer and Mini Scales carrier. Print with the
 * saucer opening facing up. Units: mm.
 */

$fn = 128;

// Saucer dimensions
saucer_diameter = 130;
saucer_depth = 6;
saucer_floor_thickness = 2;
saucer_rim_width = 4;
saucer_height = saucer_floor_thickness + saucer_depth;
saucer_well_radius = saucer_diameter / 2 - saucer_rim_width;
// Radius calculated from the desired 6 mm-deep spherical cap.
saucer_bowl_radius = (pow(saucer_well_radius, 2) + pow(saucer_depth, 2)) / (2 * saucer_depth);

// Unit Mini Scales dimensions from the official assembly drawing.
// The Grove connector is on the +Y end of the 24 x 40 mm nest.
scale_x = 24;
scale_y = 40;
scale_height = 18;
scale_clearance = 0.2;
scale_nest_depth = 0.6;
guide_wall = 1;
guide_clearance = -0.2;
guide_drop = 6;
guide_overlap = 1.5;       // Firmly joins the curved underside of the saucer shell
corner_guide_length = 5;

// The shroud is kept inside the saucer footprint so it hides the scale while
// leaving the outer saucer unsupported and clear of the table.
shroud_diameter = 87;
skirt_wall = 1;
skirt_floor_clearance = 0.5;
skirt_drop = scale_height - scale_nest_depth - skirt_floor_clearance;
// Extends into the curved saucer shell, keeping the shroud structurally joined.
skirt_overlap = 4;
skirt_cable_hole_diameter = 10;
skirt_cable_hole_z = -8;

show_scale_preview = false;

module underside_locator() {
  // Four inward-facing L-guides clamp each scale corner. The scale top enters
  // the shallow nest above, so the floor remains the only load path.
  for (x_side = [-1, 1], y_side = [-1, 1]) {
    translate([
      x_side < 0 ? -(scale_x / 2 + guide_clearance + guide_wall) : scale_x / 2 + guide_clearance,
      y_side < 0 ? -(scale_y / 2 + guide_clearance + guide_wall) : scale_y / 2 + guide_clearance - corner_guide_length,
      -guide_drop
    ]) cube([guide_wall, corner_guide_length + guide_wall, guide_drop + scale_nest_depth + guide_overlap]);

    translate([
      x_side < 0 ? -(scale_x / 2 + guide_clearance + guide_wall) : scale_x / 2 + guide_clearance - corner_guide_length,
      y_side < 0 ? -(scale_y / 2 + guide_clearance + guide_wall) : scale_y / 2 + guide_clearance,
      -guide_drop
    ]) cube([corner_guide_length + guide_wall, guide_wall, guide_drop + scale_nest_depth + guide_overlap]);
  }
}

module saucer() {
  difference() {
    // The outside rises smoothly from the central mounting area toward the
    // rim. This leaves a light, bowl-like shell rather than a solid disc.
    intersection() {
      cylinder(d = saucer_diameter, h = saucer_height);
      translate([0, 0, saucer_bowl_radius])
        sphere(r = saucer_bowl_radius);
    }

    // A smooth spherical bowl: 6 mm deep at the centre and rising to the
    // 4 mm-wide rim. The shell remains 2 mm thick at the centre.
    translate([0, 0, saucer_floor_thickness + saucer_bowl_radius])
      sphere(r = saucer_bowl_radius);

    // The Mini Scales top face sits in this shallow underside nest.
    translate([
      -(scale_x / 2 + scale_clearance),
      -(scale_y / 2 + scale_clearance),
      -0.01
    ]) cube([scale_x + 2 * scale_clearance, scale_y + 2 * scale_clearance, scale_nest_depth + 0.01]);
  }
}

module outer_shroud() {
  difference() {
    translate([0, 0, -skirt_drop])
      cylinder(d = shroud_diameter, h = skirt_drop + skirt_overlap);

    translate([0, 0, -skirt_drop - 0.01])
      cylinder(d = shroud_diameter - (2 * skirt_wall), h = skirt_drop + 0.02);
  }
}

module cable_passage() {
  // A continuous bore from the Mini Scales side to the outside of its shroud.
  translate([0, shroud_diameter / 2 + 0.01, skirt_cable_hole_z])
    rotate([90, 0, 0])
      cylinder(d = skirt_cable_hole_diameter, h = shroud_diameter / 2 - scale_y / 2 + 0.02);
}

module integrated_saucer() {
  difference() {
    union() {
      saucer();
      underside_locator();
      outer_shroud();
    }
    cable_passage();
  }
}

module scale_preview() {
  color([0.2, 0.2, 0.2, 0.35])
    translate([-scale_x / 2, -scale_y / 2, scale_nest_depth - scale_height])
      cube([scale_x, scale_y, scale_height]);
}

integrated_saucer();

if (show_scale_preview) scale_preview();
