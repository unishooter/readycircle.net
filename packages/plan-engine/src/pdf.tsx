import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import {
  channelPlanContentSchema,
  checkInScheduleContentSchema,
  planOverviewContentSchema,
  planRosterContentSchema,
  recommendationsContentSchema,
  roleAssignmentsContentSchema,
} from '@readycircle/contracts';
import { READYCIRCLE_LOGO_PNG_DATA_URI } from './logo.js';

/**
 * Renders a plan version to a printable PDF via @react-pdf/renderer --
 * chosen because it runs as plain JavaScript in the worker process, with no
 * headless-browser dependency on the EC2 host (ADR 0010).
 */

export interface PdfSectionInput {
  sectionKey: string;
  title: string;
  content: unknown;
}

export interface RenderPlanPdfInput {
  planTitle: string;
  circleName: string;
  versionNumber: number;
  publishedAt: string | null;
  sections: PdfSectionInput[];
}

// Brand palette (matches apps/web/tailwind.config.js navy/ember scales).
const NAVY_900 = '#141c26';
const NAVY_700 = '#33465c';
const NAVY_600 = '#4c6b8a';
const NAVY_100 = '#d6dce3';
const EMBER_600 = '#d9772a';
const INK_MUTED = '#5b6673';

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 54, paddingHorizontal: 48, fontSize: 10, color: NAVY_900, fontFamily: 'Helvetica' },
  // Source PNG is 822x247; only the width is set so the aspect ratio holds.
  headerLogo: { width: 150, marginBottom: 12 },
  headerTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: NAVY_900 },
  headerMeta: { fontSize: 10, color: INK_MUTED, marginTop: 4 },
  headerRule: { borderBottomWidth: 2, borderBottomColor: EMBER_600, marginTop: 10, marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY_700, marginBottom: 6 },
  paragraph: { marginBottom: 6, lineHeight: 1.4 },
  muted: { color: INK_MUTED },
  label: { fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: NAVY_100, paddingVertical: 4 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: NAVY_600, paddingVertical: 4 },
  tableHeaderCell: { fontFamily: 'Helvetica-Bold', color: NAVY_700 },
  listItem: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 12 },
  itemBlock: { marginBottom: 8 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: INK_MUTED,
  },
});

function Paragraph({ children }: { children: string }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.listItem}>
      <Text style={styles.bullet}>•</Text>
      <Text style={{ flex: 1, lineHeight: 1.4 }}>{children}</Text>
    </View>
  );
}

function OverviewSection({ content }: { content: unknown }) {
  const parsed = planOverviewContentSchema.safeParse(content);
  if (!parsed.success) return <FallbackSection content={content} />;
  const overview = parsed.data;
  return (
    <View>
      <Paragraph>
        {`${overview.circleName} — ${overview.circleTypeLabel}, covering ${overview.areaLabel}. ${overview.memberCount} participating station${overview.memberCount === 1 ? '' : 's'}.`}
      </Paragraph>
      {overview.purpose ? <Paragraph>{overview.purpose}</Paragraph> : null}
      <Text style={[styles.paragraph, styles.muted]}>
        {`Generated ${new Date(overview.generatedAt).toLocaleDateString('en-US', { dateStyle: 'long' })}.`}
      </Text>
    </View>
  );
}

function RosterSection({ content }: { content: unknown }) {
  const parsed = planRosterContentSchema.safeParse(content);
  if (!parsed.success) return <FallbackSection content={content} />;
  return (
    <View>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 2.2 }]}>Station / operator</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1.6 }]}>Capabilities</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1.6 }]}>Location</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1.6 }]}>Participation</Text>
      </View>
      {parsed.data.entries.map((entry) => {
        const participation = [
          entry.willingToActAsNetControl ? 'Net control' : null,
          entry.willingToRelay ? 'Relay' : null,
          entry.participatesInScheduledChecks ? 'Check-ins' : null,
          entry.receiveOnly ? 'Receive only' : null,
        ]
          .filter(Boolean)
          .join(', ');
        const location = [entry.areaLabel, entry.gridIdentifier].filter(Boolean).join(' · ');
        return (
          <View key={entry.stationId} style={styles.tableRow} wrap={false}>
            <View style={{ flex: 2.2, paddingRight: 4 }}>
              <Text style={styles.label}>{entry.stationName}</Text>
              <Text style={styles.muted}>{`${entry.operatorName} · ${entry.circleRoleLabel}`}</Text>
            </View>
            <Text style={{ flex: 1.6, paddingRight: 4 }}>{entry.capabilityLabels.join(', ') || '—'}</Text>
            <Text style={{ flex: 1.6, paddingRight: 4 }}>{location || 'Not shared'}</Text>
            <Text style={{ flex: 1.6 }}>{participation || '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ChannelPlanSection({ content }: { content: unknown }) {
  const parsed = channelPlanContentSchema.safeParse(content);
  if (!parsed.success) return <FallbackSection content={content} />;
  return (
    <View>
      <Paragraph>{parsed.data.narrative}</Paragraph>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Use</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Service</Text>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Channel / frequency</Text>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Who can use it</Text>
      </View>
      {parsed.data.entries.map((entry, index) => (
        <View key={index} wrap={false}>
          <View style={styles.tableRow}>
            <Text style={{ flex: 1, textTransform: 'capitalize' }}>{entry.purpose}</Text>
            <Text style={{ flex: 1.4, paddingRight: 4 }}>{entry.service}</Text>
            <Text style={{ flex: 2, paddingRight: 4 }}>{entry.channelOrFrequency}</Text>
            <Text style={{ flex: 2 }}>{entry.whoCanUse}</Text>
          </View>
          {entry.notes ? <Text style={[styles.muted, { marginTop: 2, marginBottom: 2 }]}>{`Note: ${entry.notes}`}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function RoleAssignmentsSection({ content }: { content: unknown }) {
  const parsed = roleAssignmentsContentSchema.safeParse(content);
  if (!parsed.success) return <FallbackSection content={content} />;
  const roleLabels: Record<string, string> = {
    net_control: 'Net control',
    backup_net_control: 'Backup net control',
    relay: 'Relay',
  };
  return (
    <View>
      <Paragraph>{parsed.data.narrative}</Paragraph>
      {parsed.data.assignments.map((assignment, index) => (
        <View key={index} style={styles.itemBlock} wrap={false}>
          <Text>
            <Text style={styles.label}>{`${roleLabels[assignment.role] ?? assignment.role}: `}</Text>
            {assignment.stationName}
          </Text>
          <Text style={styles.muted}>{assignment.rationale}</Text>
        </View>
      ))}
    </View>
  );
}

function CheckInScheduleSection({ content }: { content: unknown }) {
  const parsed = checkInScheduleContentSchema.safeParse(content);
  if (!parsed.success) return <FallbackSection content={content} />;
  const schedule = parsed.data;
  return (
    <View>
      <Paragraph>{schedule.narrative}</Paragraph>
      <Paragraph>
        {`${schedule.cadence} — ${schedule.dayAndTime} (about ${schedule.durationMinutes} minutes).`}
      </Paragraph>
      {schedule.procedure.map((step, index) => (
        <Bullet key={index}>{`${index + 1}. ${step}`}</Bullet>
      ))}
    </View>
  );
}

function RecommendationsSection({ content }: { content: unknown }) {
  const parsed = recommendationsContentSchema.safeParse(content);
  if (!parsed.success) return <FallbackSection content={content} />;
  return (
    <View>
      <Paragraph>{parsed.data.narrative}</Paragraph>
      {parsed.data.items.map((item, index) => (
        <View key={index} style={styles.itemBlock} wrap={false}>
          <Text style={styles.label}>{item.title}</Text>
          <Text>{item.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function FallbackSection({ content }: { content: unknown }) {
  return <Text style={styles.muted}>{JSON.stringify(content)}</Text>;
}

const SECTION_RENDERERS: Record<string, (props: { content: unknown }) => JSX.Element> = {
  overview: OverviewSection,
  roster: RosterSection,
  channel_plan: ChannelPlanSection,
  role_assignments: RoleAssignmentsSection,
  check_in_schedule: CheckInScheduleSection,
  recommendations: RecommendationsSection,
};

export async function renderPlanPdf(input: RenderPlanPdfInput): Promise<Uint8Array> {
  const document = (
    <Document title={input.planTitle} author="ReadyCircle">
      <Page size="LETTER" style={styles.page}>
        <View>
          <Image style={styles.headerLogo} src={READYCIRCLE_LOGO_PNG_DATA_URI} />
          <Text style={styles.headerTitle}>{input.planTitle}</Text>
          <Text style={styles.headerMeta}>
            {`${input.circleName} · Version ${input.versionNumber}${
              input.publishedAt
                ? ` · Published ${new Date(input.publishedAt).toLocaleDateString('en-US', { dateStyle: 'long' })}`
                : ''
            }`}
          </Text>
          <View style={styles.headerRule} />
        </View>
        {input.sections.map((section) => {
          const Renderer = SECTION_RENDERERS[section.sectionKey] ?? FallbackSection;
          return (
            <View key={section.sectionKey} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Renderer content={section.content} />
            </View>
          );
        })}
        <View style={styles.footer} fixed>
          <Text>Generated by ReadyCircle.net — keep a printed copy with your radio equipment.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(document);
  return new Uint8Array(buffer);
}
