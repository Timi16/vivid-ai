// The package's own typings declare only the default component, but its
// index.js also exports the converter. This adds the missing signature.
import "react-native-mathjax-svg";

declare module "react-native-mathjax-svg" {
  export function texToSvg(tex: string, fontSize?: number): string;
}
