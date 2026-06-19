/**
 * Site-level branding config.
 *
 * AUTHORS controls the author credit shown in the header, footer and exported
 * report. Override per-deployment with the NEXT_PUBLIC_AUTHORS environment
 * variable (e.g. set it to "Krutika Dwivedi" on the solo Vercel project).
 * Defaults to both authors so the existing site is unchanged.
 *
 * Note: NEXT_PUBLIC_* vars are inlined at build time, so changing this on
 * Vercel requires a redeploy to take effect.
 */
export const AUTHORS =
  process.env.NEXT_PUBLIC_AUTHORS?.trim() || "Krutika Dwivedi & Ciarán Daly";
