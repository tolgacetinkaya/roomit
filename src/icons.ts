import overview from "@phosphor-icons/core/assets/regular/squares-four.svg";
import project from "@phosphor-icons/core/assets/regular/code-block.svg";
import ai from "@phosphor-icons/core/assets/regular/sparkle.svg";
import folder from "@phosphor-icons/core/assets/regular/folder-open.svg";
import disk from "@phosphor-icons/core/assets/regular/hard-drive.svg";
import computer from "@phosphor-icons/core/assets/regular/desktop.svg";
import details from "@phosphor-icons/core/assets/regular/sliders-horizontal.svg";
import shield from "@phosphor-icons/core/assets/regular/shield-check.svg";
import arrow from "@phosphor-icons/core/assets/regular/arrow-right.svg";

const icons = { overview, project, ai, folder, disk, computer, details, shield, arrow };
export type IconName = keyof typeof icons;
export function icon(name: IconName, className = "ui-icon"): HTMLImageElement {
  const image = document.createElement("img"); image.src = icons[name]; image.alt = "";
  image.className = className; image.width = 20; image.height = 20; image.setAttribute("aria-hidden", "true"); return image;
}
