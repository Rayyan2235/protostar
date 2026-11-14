/**
 * A faint paper texture over the whole page: one fixed, aria-hidden div behind content, painted
 * by the --grain token (CSS gradients from ink, so it follows each theme). Static, no children,
 * no pointer events; hidden under forced colours and in print (app/globals.css .paper-grain).
 * Behaviour adapted from Cult UI Texture Overlay; rebuilt as one token-driven div.
 * Cult UI © Jordan Gilliam, MIT licence.
 */
export function PaperGrain() {
  return <div aria-hidden="true" className="paper-grain" />;
}
