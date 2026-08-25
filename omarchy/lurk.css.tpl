/*
 * Lurk theme for Omarchy.
 *
 * Installed to ~/.config/omarchy/themed/lurk.css.tpl, this is rendered to
 * ~/.local/state/omarchy/current/theme/lurk.css on every theme switch and
 * injected by Lurk over its own palette.
 *
 * Colours are derived from `background`, `foreground` and `accent` wherever
 * possible — every Omarchy theme defines those, and mixes keep the contrast
 * ratios sane on light themes as well as dark ones.
 *
 * The `!important` on each line is load-bearing: Lurk injects this with
 * webFrame.insertCSS, which lands at *user* origin, and a normal user-origin
 * declaration loses to the author-origin :root in renderer/styles.css. Only
 * an important user declaration outranks it.
 */

:root {
  --bg:            {{ background }} !important;
  --bg-raised:     {{ lighter_background }} !important;
  --bg-hover:      {{ mix background foreground 8% }} !important;

  --border:        {{ mix background foreground 16% }} !important;
  --border-hover:  {{ mix background foreground 28% }} !important;

  --text:          {{ foreground }} !important;
  --text-dim:      {{ mix background foreground 70% }} !important;
  --text-faint:    {{ mix background foreground 50% }} !important;

  --accent:        {{ accent }} !important;
  --accent-soft:   rgba({{ accent_rgb }}, 0.14) !important;

  /* Upvote arrows read as "orange" everywhere on Reddit; keep that association
     but let the theme pick the shade. */
  --up:            {{ orange }} !important;

  --scrollbar:       {{ mix background foreground 22% }} !important;
  --scrollbar-hover: {{ mix background foreground 34% }} !important;

  --danger:        {{ red }} !important;
  --danger-soft:   rgba({{ red_rgb }}, 0.12) !important;
}
