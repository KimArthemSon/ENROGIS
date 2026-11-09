import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Project, saveProject } from "@/db/repo";
import { FieldLabel, Input, colors } from "@/components/ui";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ToastHost, useAlert } from "@/components/AlertContext";

type Props = {
  visible: boolean;
  project?: Project | null;
  onClose: () => void;
  onSaved: (id: number) => void;
};

export default function ProjectFormModal({ visible, project, onClose, onSaved }: Props) {
  const db = useSQLiteContext();
  const { warning, success, error } = useAlert();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(project?.name ?? "");
    setLocation(project?.location ?? "");
    setDescription(project?.description ?? "");
  }, [visible, project]);

  const save = async () => {
    if (!name.trim()) {
      warning("Missing Name", "Please enter a project name.");
      return;
    }
    setSaving(true);
    try {
      const id = await saveProject(db, {
        id: project?.id,
        name: name.trim(),
        location: location.trim(),
        description: description.trim(),
      });
      success(project ? "Project Updated" : "Project Created");
      onSaved(id);
    } catch (e) {
      console.error(e);
      error("Error", "Could not save the project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.headRow}>
            <View style={styles.headIcon}>
              <MaterialCommunityIcons name="pine-tree" size={22} color={colors.leaf} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{project ? "Edit Project" : "New Project"}</Text>
              <Text style={styles.subtitle}>A reforestation site or program</Text>
            </View>
          </View>

          <FieldLabel label="Project Name" />
          <Input value={name} onChangeText={setName} placeholder="e.g., Mangrove Rehab – Brgy. San Isidro" autoFocus />

          <FieldLabel label="Location" optional />
          <Input value={location} onChangeText={setLocation} placeholder="e.g., Ormoc City, Leyte" />

          <FieldLabel label="Description" optional />
          <Input value={description} onChangeText={setDescription} placeholder="Notes about this project" multiline />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveText}>{project ? "Update" : "Create"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ToastHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: "#fff", borderRadius: 22, padding: 20, gap: 8 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  headIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.leafSoft, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "900", color: colors.text },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: colors.muted, fontWeight: "600", fontSize: 14 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 26, borderRadius: 12 },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
