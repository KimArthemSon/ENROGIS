import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider } from "expo-sqlite";
import { migrateDb } from "@/db/schema";
import { AlertProvider } from "@/components/AlertContext";
import { colors } from "@/components/ui";

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="enrogis.db" onInit={migrateDb}>
      <AlertProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "800", fontSize: 17 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false, title: "Projects" }} />
          <Stack.Screen name="project/[projectId]" options={{ title: "Project" }} />
          <Stack.Screen name="assessment/[assessmentId]" options={{ title: "Assessment" }} />
        </Stack>
      </AlertProvider>
    </SQLiteProvider>
  );
}
