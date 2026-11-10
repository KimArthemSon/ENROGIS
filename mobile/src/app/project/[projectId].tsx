import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AssessmentListItem, Project, deleteAssessment, deleteProject, getProject, listAssessments,
} from "@/db/repo";
import ProjectFormModal from "@/components/ProjectFormModal";
import { Chip, EmptyState, colors, formatDate, shadow } from "@/components/ui";
import { useAlert } from "@/components/AlertContext";
import { formatDistance } from "@/lib/geo";
import { useGeoTransfer } from "@/components/useGeoTransfer";
import { buildProjectGeoJSON } from "@/lib/geojson";

export default function ProjectScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const id = Number(projectId);
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { confirm, success } = useAlert();
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<AssessmentListItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const transfer = useGeoTransfer();

  const load = useCallback(() => {
    getProject(db, id).then(setProject);
    listAssessments(db, id).then(setItems);
  }, [db, id]);

  useFocusEffect(load);

  const totalArea = items.reduce((s, a) => s + a.area_sqm, 0);
  const totalPhotos = items.reduce((s, a) => s + a.photo_count, 0);

  const onDeleteProject = () =>
    confirm(
      "Delete Project",
      `Delete this project and all ${items.length} assessment(s)? Photos saved to your device are kept.`,
      async () => {
        await deleteProject(db, id);
        success("Project Deleted");
        router.back();
      },
      { type: "error", confirmText: "Delete" },
    );

  const onDeleteAssessment = (a: AssessmentListItem) =>
    confirm(
      "Delete Assessment",
      `Delete "${a.title}"?`,
      async () => {
        await deleteAssessment(db, a.id);
        success("Assessment Deleted");
        load();
      },
      { type: "error", confirmText: "Delete" },
    );

  if (!project) return <Stack.Screen options={{ title: "Project" }} />;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: "Project",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 18 }}>
              <TouchableOpacity hitSlop={8} onPress={() => setEditOpen(true)}>
                <Ionicons name="create-outline" size={21} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={8} onPress={onDeleteProject}>
                <Ionicons name="trash-outline" size={20} color="#FCA5A5" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <View style={styles.blob} />
              <Text style={styles.name}>{project.name}</Text>
              {project.location ? (
                <View style={styles.locRow}>
                  <Ionicons name="location" size={13} color={colors.teal} />
                  <Text style={styles.loc}>{project.location}</Text>
                </View>
              ) : null}
              {project.description ? <Text style={styles.desc}>{project.description}</Text> : null}
              <Text style={styles.created}>Created {formatDate(project.created_at)}</Text>
            </View>

            <View style={styles.summary}>
              <Summary icon="clipboard-check-outline" color={colors.primary} bg={colors.tealSoft} value={String(items.length)} label="Assessments" />
              <Summary icon="vector-square" color={colors.bark} bg={colors.barkSoft} value={(totalArea / 10000).toFixed(2)} label="Hectares" />
              <Summary icon="camera-outline" color={colors.water} bg={colors.waterSoft} value={String(totalPhotos)} label="Photos" />
            </View>

            <View style={styles.transferRow}>
              <TouchableOpacity style={styles.transferBtn} disabled={transfer.busy} onPress={() => transfer.importIntoProject(id, load)}>
                <MaterialCommunityIcons name="file-import-outline" size={17} color={colors.primary} />
                <Text style={styles.transferText}>Import GeoJSON</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.transferBtn, !items.length && { opacity: 0.5 }]}
                disabled={transfer.busy || !items.length}
                onPress={() => transfer.exportGeoJSON(() => buildProjectGeoJSON(db, id))}
              >
                <MaterialCommunityIcons name="file-export-outline" size={17} color={colors.primary} />
                <Text style={styles.transferText}>Export GeoJSON</Text>
              </TouchableOpacity>
            </View>

            {items.length > 0 && <Text style={styles.sectionLabel}>Assessments</Text>}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="map-marker-path" title="No assessments yet" subtitle="Tap “New Assessment” to record a boundary polygon and site photos." />
        }
        renderItem={({ item }) => {
          const complete = item.point_count >= 3;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.88}
              onPress={() => router.push(`/assessment/${item.id}?projectId=${id}`)}
            >
              <View style={styles.cardTop}>
                <View style={[styles.cardIcon, { backgroundColor: complete ? colors.tealSoft : "#FEF3C7" }]}>
                  <MaterialCommunityIcons name="vector-polygon" size={22} color={complete ? colors.polygon : colors.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.area, !complete && { color: colors.amber }]}>
                    {complete ? `${(item.area_sqm / 10000).toFixed(4)} ha` : "Polygon incomplete"}
                    {complete ? <Text style={styles.perim}>{`  ·  ${formatDistance(item.perimeter_m)} perimeter`}</Text> : null}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </View>
              <View style={styles.cardBottom}>
                <Chip icon="map-marker-multiple-outline" label={`${item.point_count} pts`} color={colors.polygon} bg={colors.tealSoft} />
                <Chip icon="camera-outline" label={`${item.photo_count}`} color={colors.water} bg={colors.waterSoft} />
                <Text style={styles.date}>{formatDate(item.updated_at)}</Text>
                <TouchableOpacity style={styles.delBtn} hitSlop={6} onPress={() => onDeleteAssessment(item)}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        activeOpacity={0.9}
        onPress={() => router.push(`/assessment/new?projectId=${id}`)}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>New Assessment</Text>
      </TouchableOpacity>

      <ProjectFormModal
        visible={editOpen}
        project={project}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          load();
        }}
      />
    </View>
  );
}

function Summary({ icon, value, label, color, bg }: { icon: string; value: string; label: string; color: string; bg: string }) {
  return (
    <View style={styles.sumItem}>
      <View style={[styles.sumIcon, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.sumValue}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden",
  },
  blob: {
    position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: colors.teal,
    opacity: 0.14, top: -80, right: -60,
  },
  name: { color: "#fff", fontSize: 22, fontWeight: "900" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  loc: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600" },
  desc: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 8, lineHeight: 19 },
  created: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 10 },
  summary: {
    flexDirection: "row", marginHorizontal: 16, marginTop: -30, backgroundColor: "#fff", borderRadius: 18,
    paddingVertical: 14, ...shadow, elevation: 6,
  },
  sumItem: { flex: 1, alignItems: "center", gap: 3 },
  sumIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  sumValue: { color: colors.text, fontWeight: "900", fontSize: 17 },
  sumLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "600" },
  transferRow: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginTop: 12 },
  transferBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.tealSoft, backgroundColor: "#fff",
  },
  transferText: { color: colors.primary, fontWeight: "800", fontSize: 12.5 },
  sectionLabel: {
    fontSize: 12, fontWeight: "800", color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase",
    marginHorizontal: 20, marginTop: 22, marginBottom: 10,
  },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 14, marginHorizontal: 16, marginBottom: 12, ...shadow },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 46, height: 46, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  cardTitle: { fontSize: 15.5, fontWeight: "800", color: colors.text },
  area: { fontSize: 13, color: colors.polygon, fontWeight: "800", marginTop: 3 },
  perim: { fontSize: 11.5, color: colors.muted, fontWeight: "600" },
  cardBottom: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  date: { flex: 1, textAlign: "right", fontSize: 11, color: colors.faint, marginRight: 6 },
  delBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#FDECEC", justifyContent: "center", alignItems: "center" },
  fab: {
    position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 15, borderRadius: 30, elevation: 8,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
