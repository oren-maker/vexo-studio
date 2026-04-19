// PDF renderer disabled in vexo-studio (avoid @react-pdf/renderer broken peer dep).
// Re-enable by reinstalling the dep and restoring from vexo-learn.
export async function renderGuidePdf(_data: unknown): Promise<Buffer> {
  throw new Error("PDF generation disabled in vexo-studio (port @react-pdf/renderer to enable)");
}
