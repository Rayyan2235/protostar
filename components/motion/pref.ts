/**
 * The visitor's saved Motion switch choice (Kiln §10), in one place. MotionSwitch writes it;
 * `motionOk()` reads it on first load, before the switch has written data-motion on <html>
 * (layout effects that start the first animations run before the switch's own effect).
 */
export const MOTION_KEY = "protostar-motion";

/** "on" | "off" when the visitor chose; undefined when nothing is saved or storage is blocked. */
export function savedMotion(): "on" | "off" | undefined {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    return v === "on" || v === "off" ? v : undefined;
  } catch {
    return undefined;
  }
}
