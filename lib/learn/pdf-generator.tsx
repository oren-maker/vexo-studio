// PDF generator disabled in vexo-studio (broken peer dep on @react-pdf/svg).
export type PdfSourceData = unknown;
export async function generatePdfBuffer(_: unknown): Promise<Buffer> {
  throw new Error("PDF generation disabled in vexo-studio (port @react-pdf/renderer to re-enable)");
}
export async function generatePdf(): Promise<Buffer> { return generatePdfBuffer(null); }
