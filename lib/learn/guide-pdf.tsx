// React-PDF renderer for guides — RTL-aware, supports all 5 languages.

import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer, Image } from "@react-pdf/renderer";
import { isRtl, langName } from "./guide-languages";

Font.register({
  family: "Heebo",
  fonts: [{ src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/heebo/Heebo%5Bwght%5D.ttf" }],
});

const PALETTE = {
  ink: "#0f172a",
  text: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  accent: "#0891b2",
  accent2: "#7c3aed",
};

const baseStyles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Heebo", fontSize: 11, color: PALETTE.text, backgroundColor: "#ffffff" },
  cover: { flexDirection: "column", marginBottom: 30 },
  coverImage: { width: "100%", height: 200, objectFit: "cover", marginBottom: 16 },
  title: { fontSize: 28, color: PALETTE.ink, marginBottom: 8, fontWeight: 700 },
  description: { fontSize: 13, color: PALETTE.muted, marginBottom: 12 },
  meta: { fontSize: 10, color: PALETTE.muted, marginBottom: 4 },
  divider: { borderBottom: 1, borderColor: PALETTE.border, marginBottom: 24 },
  stage: { marginBottom: 28, paddingBottom: 16, borderBottom: 1, borderColor: PALETTE.border },
  stageNum: { fontSize: 10, color: PALETTE.accent, marginBottom: 4, fontWeight: 700 },
  stageTitle: { fontSize: 18, color: PALETTE.ink, marginBottom: 8, fontWeight: 700 },
  stageContent: { fontSize: 11, lineHeight: 1.6, color: PALETTE.text, marginBottom: 10 },
  stageImage: { width: "100%", maxHeight: 250, objectFit: "contain", marginTop: 8, marginBottom: 8 },
  caption: { fontSize: 9, color: PALETTE.muted, fontStyle: "italic", marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: PALETTE.muted, textAlign: "center" },
});

type GuideStageData = {
  order: number;
  type: string;
  title: string;
  content: string;
  images: Array<{ blobUrl: string; caption: string | null }>;
};

type GuidePdfData = {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  authorName: string | null;
  category: string | null;
  estimatedMinutes: number | null;
  lang: string;
  stages: GuideStageData[];
};

function GuidePdf({ data }: { data: GuidePdfData }) {
  const rtl = isRtl(data.lang);
  const dynStyles = StyleSheet.create({
    rtlText: { textAlign: rtl ? "right" : "left" },
  });

  return (
    <Document>
      <Page size="A4" style={baseStyles.page}>
        <View style={baseStyles.cover}>
          {data.coverImageUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.coverImageUrl} style={baseStyles.coverImage} />
          )}
          <Text style={[baseStyles.title, dynStyles.rtlText]}>{data.title}</Text>
          {data.description && <Text style={[baseStyles.description, dynStyles.rtlText]}>{data.description}</Text>}
          <Text style={[baseStyles.meta, dynStyles.rtlText]}>
            {data.authorName ? `${data.authorName} · ` : ""}
            {data.category ? `${data.category} · ` : ""}
            {data.estimatedMinutes ? `${data.estimatedMinutes} min · ` : ""}
            {langName(data.lang)} · {data.stages.length} stages
          </Text>
        </View>

        <View style={baseStyles.divider} />

        {data.stages.map((stage) => (
          <View key={stage.order} style={baseStyles.stage} wrap={false}>
            <Text style={[baseStyles.stageNum, dynStyles.rtlText]}>
              {stage.type === "start" ? "INTRO" : stage.type === "end" ? "WRAP-UP" : "STAGE"} · {stage.order + 1} / {data.stages.length}
            </Text>
            <Text style={[baseStyles.stageTitle, dynStyles.rtlText]}>{stage.title}</Text>
            <Text style={[baseStyles.stageContent, dynStyles.rtlText]}>{stage.content}</Text>
            {stage.images.map((img, i) => (
              <View key={i}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={img.blobUrl} style={baseStyles.stageImage} />
                {img.caption && <Text style={[baseStyles.caption, dynStyles.rtlText]}>{img.caption}</Text>}
              </View>
            ))}
          </View>
        ))}

        <Text style={baseStyles.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function renderGuidePdf(data: GuidePdfData): Promise<Buffer> {
  return await renderToBuffer(<GuidePdf data={data} />);
}
