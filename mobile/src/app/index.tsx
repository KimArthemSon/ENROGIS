import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Project, ProjectWithStats, deleteProject, listProjects } from "@/db/repo";
import ProjectFormModal from "@/components/ProjectFormModal";
import { Chip, EmptyState, colors, formatDate, shadow } from "@/components/ui";
import { useAlert } from "@/components/AlertContext";

const logo = require("../../assets/logo-round.png");

export default function ProjectsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { confirm, success } = useAlert();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const load = useCallback(() => {
    listProjects(db).then(setProjects);
  }, [db]);

  useFocusEffect(load);

  const totals = useMemo(
    () => ({
      projects: projects.length,
      assessments: projects.reduce((s, p) => s + p.assessment_count, 0),
      hectares: projects.reduce((s, p) => s + p.total_area_sqm, 0) / 10000,
    }),
    [projects],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => [p.name, p.location, p.description].some((v) => v?.toLowerCase().includes(q)));
  }, [projects, query]);

  const onDelete = (p: ProjectWithStats) =>
    confirm(
      "Delete Project",
      `Delete "${p.name}" and its ${p.assessment_count} assessment(s)? Photos already saved to your device are kept.`,
      async () => {
        await deleteProject(db, p.id);
        success("Project Deleted");
        load();
      },
      { type: "error", confirmText: "Delete" },
    );

  const header = (
    <View>
      <View style={[styles.hero, { paddingTop: insets.top + 18 }]}>
        <View style={[styles.blob, styles.blobA]} />
        <View style={[styles.blob, styles.blobB]} />
        <View style={styles.brandRow}>
          <View style={styles.logoWrap}>
            <Image source={logo} style={styles.logo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>ENROGIS</Text>
            <Text style={styles.office}>Environment & Natural Resources Office</Text>
            <Text style={styles.city}>Ormoc City</Text>
          </View>
        </View>
        <Text style={styles.tagline}>Offline reforestation boundary & site recorder</Text>

        <View style={styles.statsRow}>
          <Stat icon="folder-multiple-outline" value={String(totals.projects)} label="Projects" />
          <View style={styles.statDivider} />
          <Stat icon="clipboard-check-outline" value={String(totals.assessments)} label="Assessments" />
          <View style={styles.statDivider} />
          <Stat icon="pine-tree" value={totals.hectares.toFixed(2)} label="Hectares" />
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          style={styles.search}
          placeholder="Search projects or locations"
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </TouchableOpacity>
        ) : null}
      </View>

      {projects.length > 0 && (
        <Text style={styles.sectionLabel}>
          {query ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : "Your Projects"}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="sprout"
            title={query ? "No matching projects" : "Start your first project"}
            subtitle={query ? "Try a different name or location." : "A project groups the boundary assessments and photos of one reforestation site."}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={() => router.push(`/project/${item.id}`)}>
            <View style={styles.cardTop}>
              <View style={styles.cardIcon}>
                <MaterialCommunityIcons name="pine-tree" size={24} color={colors.leaf} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.location ? `📍 ${item.location}` : `Updated ${formatDate(item.updated_at)}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </View>
            <View style={styles.cardBottom}>
              <Chip icon="clipboard-text-outline" label={`${item.assessment_count} assessment${item.assessment_count !== 1 ? "s" : ""}`} color={colors.primary} bg={colors.tealSoft} />
              <Chip icon="vector-square" label={`${(item.total_area_sqm / 10000).toFixed(2)} ha`} color={colors.bark} bg={colors.barkSoft} />
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.iconBtn}
                hitSlop={6}
                onPress={() => {
                  setEditing(item);
                  setFormOpen(true);
                }}
              >
                <Ionicons name="pencil" size={15} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: "#FDECEC" }]} hitSlop={6} onPress={() => onDelete(item)}>
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        activeOpacity={0.9}
        onPress={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>New Project</Text>
      </TouchableOpacity>

      <ProjectFormModal
        visible={formOpen}
        project={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => {
          setFormOpen(false);
          load();
          if (!editing) router.push(`/project/${id}`);
        }}
      />
    </View>
  );
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon as any} size={16} color={colors.teal} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 46,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  blob: { position: "absolute", borderRadius: 999, backgroundColor: colors.teal },
  blobA: { width: 220, height: 220, top: -90, right: -70, opacity: 0.16 },
  blobB: { width: 140, height: 140, bottom: -60, left: -40, opacity: 0.12, backgroundColor: colors.leaf },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#fff", padding: 3,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  logo: { width: "100%", height: "100%", borderRadius: 33 },
  appName: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: 1.5 },
  office: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600", marginTop: 1 },
  city: { color: colors.teal, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginTop: 1 },
  tagline: { color: "rgba(255,255,255,0.7)", fontSize: 12.5, marginTop: 14 },
  statsRow: {
    flexDirection: "row", alignItems: "center", marginTop: 16, backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "900" },
  statLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10.5, fontWeight: "600" },
  statDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.15)" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: -24,
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, ...shadow, elevation: 6,
  },
  search: { flex: 1, paddingVertical: 14, fontSize: 14, color: colors.text },
  sectionLabel: {
    fontSize: 12, fontWeight: "800", color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase",
    marginHorizontal: 20, marginTop: 20, marginBottom: 10,
  },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 14, marginHorizontal: 16, marginBottom: 12, ...shadow },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: colors.leafSoft, justifyContent: "center", alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  cardBottom: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  iconBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  fab: {
    position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 15, borderRadius: 30, elevation: 8,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
