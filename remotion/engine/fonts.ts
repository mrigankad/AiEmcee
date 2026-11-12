/**
 * Font faces load lazily: the browser only fetches one when text first needs
 * it. Asking for every face up front means the first frame already has them;
 * the runtime holds init() until these resolve.
 */
export const fontsReady: Promise<unknown>[] = [];

export function preloadFonts(faces: string[]) {
  if (typeof document === "undefined") return;
  for (const face of faces) {
    fontsReady.push(
      document.fonts.load(face).then(
        (found) => {
          if (!found.length) console.error(`motion: font did not load: ${face}`);
        },
        (e) => console.error(`motion: font failed: ${face}: ${e}`),
      ),
    );
  }
}
