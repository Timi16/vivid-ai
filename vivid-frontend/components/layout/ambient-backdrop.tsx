// Glass needs something behind it. Over a flat page a blurred surface has
// nothing to refract and renders as a grey rectangle, so the material collapses.
// This is the light the glass picks up.
//
// The gradients are painted as stacked background layers rather than blurred
// divs. A CSS blur on a soft gradient spreads its peak and dilutes it, so the
// blurred version needed implausible alpha values and still read as nothing.
// Radial gradients are already soft and cost far less to composite.
//
// Greyscale on purpose: the palette is monochrome, so depth comes from
// luminance. The layers are defined in globals.css because they invert with the
// theme, which an inline style cannot do.
export function AmbientBackdrop() {
  return <div aria-hidden="true" className="vd-ambient pointer-events-none fixed inset-0 -z-10" />;
}
