export const campusIds = ["silverest", "massmedia", "leopards-hill"] as const;
export type CampusId = typeof campusIds[number];
export type Point = { latitude: number; longitude: number };
export type Campus = {
  id: CampusId;
  name: string;
  centre: [number, number];
  bounds: [[number, number], [number, number]];
  polygon: [number, number][];
  scopeKind: "outline" | "approximate";
  address: string;
  source: string;
};

// Keep synchronized with the portal's lib/campus/geography.ts.
// OSM outlines are community navigation data (ODbL), not surveyed property boundaries.
export const campuses: Campus[] = [
  {
    id: "silverest", name: "Silverest campus", centre: [-15.3554635, 28.4691588],
    bounds: [[-15.3570150, 28.4668484], [-15.3529952, 28.4714092]],
    polygon: [
      [28.4668484, -15.3534320], [28.4711082, -15.3529952],
      [28.4714092, -15.3565752], [28.4671190, -15.3570150],
      [28.4669179, -15.3543518], [28.4668484, -15.3534320],
    ],
    scopeKind: "outline",
    address: "Plot 23072/M, Silverest, Chongwe",
    source: "https://www.openstreetmap.org/way/1558103619",
  },
  {
    id: "massmedia", name: "Massmedia campus", centre: [-15.4102855, 28.3201885],
    bounds: [[-15.416, 28.314], [-15.405, 28.326]],
    polygon: [],
    scopeKind: "approximate",
    address: "Plot 37413, Alick Nkhata Road, Lusaka",
    source: "https://web.unilus.ac.zm/contact-us/",
  },
  {
    id: "leopards-hill", name: "Leopards Hill campus", centre: [-15.4535623, 28.3795288],
    bounds: [[-15.4542192, 28.3788731], [-15.4528840, 28.3801813]],
    polygon: [
      [28.3794944, -15.4528840], [28.3801813, -15.4537552],
      [28.3795785, -15.4542192], [28.3793208, -15.4539134],
      [28.3791836, -15.4537501], [28.3788731, -15.4533745],
      [28.3790602, -15.4532246], [28.3790957, -15.4532310],
      [28.3791346, -15.4532013], [28.3791333, -15.4531690],
      [28.3792513, -15.4531044], [28.3792513, -15.4530756],
      [28.3792211, -15.4531302], [28.3791869, -15.4531263],
      [28.3794944, -15.4528840],
    ],
    scopeKind: "outline",
    address: "Plot 17986, Leopards Hill Road, Lusaka",
    source: "https://www.openstreetmap.org/way/842714813",
  },
];

export function campusName(value: string | null | undefined): string {
  return campuses.find((campus) => campus.id === value)?.name ?? "Not assigned - contact campus staff";
}

export function insideCampus({ latitude: y, longitude: x }: Point, campus: Campus): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (campus.scopeKind === "approximate") {
    // This is only the approved street-area viewing scope, not a campus boundary.
    return y >= campus.bounds[0][0] && y <= campus.bounds[1][0] &&
      x >= campus.bounds[0][1] && x <= campus.bounds[1][1];
  }
  let inside = false;
  for (let i = 0, j = campus.polygon.length - 1; i < campus.polygon.length; j = i++) {
    const [xi, yi] = campus.polygon[i], [xj, yj] = campus.polygon[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) &&
        y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function campusFor(point: Point): Campus | undefined {
  return campuses.find((campus) => insideCampus(point, campus));
}

export function distanceMetres(a: Point, b: Point): number {
  const rad = (value: number) => value * Math.PI / 180;
  const latitude = rad(b.latitude - a.latitude), longitude = rad(b.longitude - a.longitude);
  const h = Math.sin(latitude / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
