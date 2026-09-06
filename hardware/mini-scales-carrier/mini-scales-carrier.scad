/*
 * Plantory / Unit Mini Scales (U177) removable dish carrier
 *
 * Print with the dish recess facing up. The shallow underside nest keeps the
 * scale centred while its floor transmits the load. Units: mm.
 */

$fn = 128;

// Measured dish dimensions
dish_foot_diameter = 81;
dish_foot_height = 2;

// Dish fit and carrier dimensions
pocket_clearance = 1;       // Total diameter clearance around the foot
pocket_depth = 2;           // Fully recesses the 2 mm-tall dish foot
carrier_diameter = 87;
carrier_thickness = 4;

// Unit Mini Scales dimensions from the official assembly drawing.
// The Grove connector is on the +Y end of the 24 x 40 mm nest.
scale_x = 24;
scale_y = 40;
scale_height = 18;
scale_clearance = 0.2;     // Snug no-screw fit; 0.2 mm clearance on each side
scale_nest_depth = 0.6;
guide_wall = 1;
guide_clearance = -0.2;    // 0.2 mm interference on each side for a firm fit
guide_drop = 6;
guide_overlap = 0.1;
corner_guide_length = 5;

// Outer shroud hides the scale without touching the surface below it.
skirt_wall = 1;
skirt_floor_clearance = 0.5;
skirt_drop = scale_height - scale_nest_depth - skirt_floor_clearance;
skirt_overlap = 0.1;
skirt_cable_hole_diameter = 10;
skirt_cable_hole_z = -8;

// The cable exits from the slot in the +Y wall. Rotate the carrier 180 degrees if needed.
show_dish_foot = false;
show_scale_preview = false;

module underside_locator() {
  // Four L-shaped guides wrap the outside of each corner. Their arms extend
  // toward the centre along the scale's sides, while their thickness remains
  // outside the 24 x 40 mm footprint.
  // They finish at the nest floor; they are not a separate load-bearing pad.
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

module carrier_top() {
  difference() {
    cylinder(d = carrier_diameter, h = carrier_thickness);

    // The high foot of the dish rests on this floor. The surrounding rim
    // prevents lateral movement while keeping all weight on the scale.
    translate([0, 0, carrier_thickness - pocket_depth])
      cylinder(d = dish_foot_diameter + (pocket_clearance * 2), h = pocket_depth + 0.01);

    // The complete 24 x 40 mm top face sits in this shallow nest. Unlike the
    // previous central pad, it does not concentrate force on one unknown part
    // of the scale. Its flat floor is the carrier's contact surface.
    translate([
      -(scale_x / 2 + scale_clearance),
      -(scale_y / 2 + scale_clearance),
      -0.01
    ]) cube([scale_x + 2 * scale_clearance, scale_y + 2 * scale_clearance, scale_nest_depth + 0.01]);
  }
}

module outer_skirt() {
  difference() {
    translate([0, 0, -skirt_drop])
      cylinder(d = carrier_diameter, h = skirt_drop + skirt_overlap);

    translate([0, 0, -skirt_drop - 0.01])
      cylinder(d = carrier_diameter - (2 * skirt_wall), h = skirt_drop + 0.02);
  }
}

module cable_passage() {
  // One uninterrupted cylindrical bore from the Mini Scales side to the
  // outside. It deliberately cuts through every intervening part.
  translate([0, carrier_diameter / 2 + 0.01, skirt_cable_hole_z])
    rotate([90, 0, 0])
      cylinder(
        d = skirt_cable_hole_diameter,
        h = carrier_diameter / 2 - scale_y / 2 + 0.02
      );
}

module carrier() {
  difference() {
    union() {
      carrier_top();
      underside_locator();
      outer_skirt();
    }
    cable_passage();
  }
}

module dish_foot_preview() {
  color([0.3, 0.55, 0.3, 0.45])
    translate([0, 0, carrier_thickness - pocket_depth])
      cylinder(d = dish_foot_diameter, h = dish_foot_height);
}

module scale_preview() {
  color([0.2, 0.2, 0.2, 0.35])
    translate([-scale_x / 2, -scale_y / 2, scale_nest_depth - scale_height])
      cube([scale_x, scale_y, scale_height]);
}

carrier();

if (show_dish_foot) dish_foot_preview();
if (show_scale_preview) scale_preview();
