import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// Palette taken from the ENRO Ormoc logo.
export const colors = {
  primary: "#0B5D45", // deep forest green (headers, main buttons)
  primaryDark: "#073F2F",
  teal: "#05C89C", // logo ring
  tealSoft: "#E3FAF3",
  leaf: "#24B24E", // logo leaves
  leafSoft: "#E8F7EC",
  water: "#0393D6", // logo water drop
  waterSoft: "#E3F4FC",
  bark: "#4C3221", // logo trunk
  barkSoft: "#F4EEE9",
  polygon: "#0E8A6C",
  amber: "#D97706",
  danger: "#DC2626",
  bg: "#F3F6F4",
  card: "#FFFFFF",
  text: "#14231C",
  muted: "#5B6B63",
  faint: "#94A39B",
  border: "#E1E8E4",
  inputBg: "#F8FAF9",
};

export const shadow = {
  shadowColor: "#0B2A1F",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 3,
};

type SectionCardProps = {
  title: string;
  subtitle?: string;
  iconName: string;
  iconLib?: "ion" | "mci";
  accentColor: string;
  accentSoft: string;
  step?: number;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function SectionCard({
  title, subtitle, iconName, iconLib = "ion", accentColor, accentSoft, step, right, children,
}: SectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: accentSoft }]}>
          {iconLib === "mci" ? (
            <MaterialCommunityIcons name={iconName as any} size={20} color={accentColor} />
          ) : (
            <Ionicons name={iconName as any} size={20} color={accentColor} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {step != null && <Text style={[styles.stepText, { color: accentColor }]}>STEP {step}</Text>}
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {optional && <Text style={styles.optionalTag}>optional</Text>}
    </View>
  );
}

export function Input({ multiline, style, editable = true, onFocus, onBlur, ...rest }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      editable={editable}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.input, multiline && styles.textArea, focused && styles.inputFocused, !editable && styles.disabled, style]}
      {...rest}
    />
  );
}

export function HintBox({ text, color = colors.primary, bg = colors.tealSoft }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={[styles.hintBox, { backgroundColor: bg }]}>
      <Ionicons name="information-circle-outline" size={15} color={color} />
      <Text style={[styles.hintText, { color }]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon as any} size={40} color={colors.leaf} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Chip({ icon, label, color = colors.muted, bg = colors.bg }: { icon?: string; label: string; color?: string; bg?: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon ? <MaterialCommunityIcons name={icon as any} size={12} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 14, ...shadow },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  iconBadge: { width: 42, height: 42, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  stepText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardSubtitle: { fontSize: 12, color: colors.faint, marginTop: 1, fontWeight: "500" },
  cardBody: { gap: 10 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: -2 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.muted },
  optionalTag: {
    fontSize: 10, color: colors.faint, fontWeight: "600", backgroundColor: colors.bg,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.teal, backgroundColor: "#fff" },
  textArea: { minHeight: 96, paddingTop: 12 },
  disabled: { opacity: 0.7 },
  hintBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10 },
  hintText: { flex: 1, fontSize: 11.5, lineHeight: 16, fontWeight: "500" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8, paddingHorizontal: 24 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.leafSoft,
    justifyContent: "center", alignItems: "center", marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  emptySub: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 18 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: "700" },
});
