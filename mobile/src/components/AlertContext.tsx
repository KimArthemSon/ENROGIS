import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type ToastType = "success" | "error" | "warning" | "info";
type Toast = { id: number; type: ToastType; title: string; message?: string };

type ConfirmOptions = {
  type?: "warning" | "error";
  confirmText?: string;
  cancelText?: string;
};

type AlertApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  confirm: (title: string, message: string, onConfirm: () => void, opts?: ConfirmOptions) => void;
  toast: Toast | null;
};

const AlertCtx = createContext<AlertApi | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((type: ToastType, title: string, message?: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), type, title, message });
    timer.current = setTimeout(() => setToast(null), type === "error" ? 4500 : 3000);
  }, []);

  const confirm = useCallback<AlertApi["confirm"]>((title, message, onConfirm, opts) => {
    Alert.alert(title, message, [
      { text: opts?.cancelText ?? "Cancel", style: "cancel" },
      {
        text: opts?.confirmText ?? "OK",
        style: opts?.type === "error" ? "destructive" : "default",
        onPress: onConfirm,
      },
    ]);
  }, []);

  const api: AlertApi = {
    success: (t, m) => show("success", t, m),
    error: (t, m) => show("error", t, m),
    warning: (t, m) => show("warning", t, m),
    info: (t, m) => show("info", t, m),
    confirm,
    toast,
  };

  return (
    <AlertCtx.Provider value={api}>
      {children}
      <ToastHost />
    </AlertCtx.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertCtx);
  if (!ctx) throw new Error("useAlert must be used inside <AlertProvider>");
  return ctx;
}

const toastStyle: Record<ToastType, { bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: "#15803D", icon: "checkmark-circle" },
  error: { bg: "#B91C1C", icon: "alert-circle" },
  warning: { bg: "#B45309", icon: "warning" },
  info: { bg: "#1D4ED8", icon: "information-circle" },
};

/**
 * Renders the current toast. Native <Modal>s cover the app root, so put a
 * <ToastHost /> inside each Modal too if toasts should show over it.
 */
export function ToastHost() {
  const ctx = useContext(AlertCtx);
  const opacity = useRef(new Animated.Value(0)).current;
  const toast = ctx?.toast ?? null;

  useEffect(() => {
    Animated.timing(opacity, { toValue: toast ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [toast?.id]);

  if (!toast) return null;
  const s = toastStyle[toast.type];
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.toast, { backgroundColor: s.bg, opacity }]}>
        <Ionicons name={s.icon} size={20} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{toast.title}</Text>
          {toast.message ? <Text style={styles.message}>{toast.message}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 56, left: 16, right: 16, zIndex: 9999, elevation: 9999 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { color: "#fff", fontWeight: "700", fontSize: 14 },
  message: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
});
