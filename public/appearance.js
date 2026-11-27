// Apply the saved palette before the app stylesheet paints.
(() => {
  let preference;
  try {
    preference = localStorage.getItem("roomit-theme");
  } catch {
    // Restricted WebViews can still follow the system setting.
  }
  const { dataset } = document.documentElement;
  dataset.themePreference = preference === "light" || preference === "dark" ? preference : "system";
  dataset.theme = dataset.themePreference === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : dataset.themePreference;
})();
