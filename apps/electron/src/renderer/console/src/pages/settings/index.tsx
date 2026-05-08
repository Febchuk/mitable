import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Wrench, User, ShieldBan, Shield, Settings, RefreshCw } from "lucide-react";
import { useSettingsState } from "./useSettingsState";
import SetupTab from "./SetupTab";
import AccountTab from "./AccountTab";
import BlockedAppsTab from "./BlockedAppsTab";
import PermissionsTab from "./PermissionsTab";
import PreferencesTab from "./PreferencesTab";
import UpdateTab from "./UpdateTab";

type TabId = "setup" | "account" | "blocked-apps" | "permissions" | "preferences" | "update";

const allTabs: { id: TabId; label: string; icon: typeof Wrench; macOnly?: boolean }[] = [
  { id: "setup", label: "Setup", icon: Wrench },
  { id: "account", label: "Account", icon: User },
  { id: "blocked-apps", label: "Blocked Apps", icon: ShieldBan },
  { id: "permissions", label: "Permissions", icon: Shield, macOnly: true },
  { id: "preferences", label: "Preferences", icon: Settings },
  { id: "update", label: "Update", icon: RefreshCw },
];

export default function UserProfilePage() {
  const [searchParams] = useSearchParams();
  const [platform, setPlatform] = useState<string>("win32");
  const state = useSettingsState();

  useEffect(() => {
    window.consoleAPI
      ?.onDeviceGetPlatform?.()
      .then((p: string) => {
        if (p) setPlatform(p);
      })
      .catch(() => {});
  }, []);

  const tabs = allTabs.filter((t) => {
    if (t.macOnly && platform !== "darwin") return false;
    return true;
  });
  const validTabIds = tabs.map((t) => t.id);

  const initialTab = validTabIds.includes(searchParams.get("tab") as TabId)
    ? (searchParams.get("tab") as TabId)
    : "setup";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabId;
    if (tabParam && validTabIds.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams, validTabIds]);

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Settings sidebar */}
      <div
        style={{
          width: 200,
          minWidth: 200,
          borderRight: "var(--border-hairline)",
          padding: "28px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            color: "var(--text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.2px",
            margin: "0 0 16px",
            padding: "0 10px",
          }}
        >
          Settings
        </h2>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 400,
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                background: isActive ? "rgba(var(--ui-rgb), 0.06)" : "none",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                textAlign: "left",
                width: "100%",
                transition: "color 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                  e.currentTarget.style.background = "none";
                }
              }}
            >
              <tab.icon size={14} strokeWidth={1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: activeTab === "blocked-apps" ? "none" : 640,
            padding: activeTab === "blocked-apps" ? "28px 48px" : "28px 36px",
          }}
        >
          {activeTab === "setup" && <SetupTab />}

          {activeTab === "account" && (
            <AccountTab
              user={state.user}
              organization={state.organization}
              planLabel={state.planLabel}
              currentPassword={state.currentPassword}
              setCurrentPassword={state.setCurrentPassword}
              newPassword={state.newPassword}
              setNewPassword={state.setNewPassword}
              confirmPassword={state.confirmPassword}
              setConfirmPassword={state.setConfirmPassword}
              showCurrentPassword={state.showCurrentPassword}
              setShowCurrentPassword={state.setShowCurrentPassword}
              showNewPassword={state.showNewPassword}
              setShowNewPassword={state.setShowNewPassword}
              showConfirmPassword={state.showConfirmPassword}
              setShowConfirmPassword={state.setShowConfirmPassword}
              isChangingPassword={state.isChangingPassword}
              handlePasswordChange={state.handlePasswordChange}
            />
          )}

          {activeTab === "blocked-apps" && (
            <BlockedAppsTab
              blockedApps={state.blockedApps}
              detectedApps={state.detectedApps}
              isBlockListLoading={state.isBlockListLoading}
              isRefreshingApps={state.isRefreshingApps}
              appSearchQuery={state.appSearchQuery}
              setAppSearchQuery={state.setAppSearchQuery}
              cleanAppName={state.cleanAppName}
              handleRefreshAppList={state.handleRefreshAppList}
              handleAddBlockedApp={state.handleAddBlockedApp}
              handleRemoveBlockedApp={state.handleRemoveBlockedApp}
            />
          )}

          {activeTab === "permissions" && (
            <PermissionsTab
              screenPermission={state.screenPermission === "granted"}
              accessibilityPermission={!!state.accessibilityPermission}
              requestAccessibility={state.requestAccessibility}
              openScreenRecording={state.openScreenRecording}
            />
          )}

          {activeTab === "preferences" && (
            <PreferencesTab
              currentTheme={state.currentTheme}
              setTheme={state.setTheme}
              pillDisplayMode={state.pillDisplayMode}
              isPillDisplayModeLoading={state.isPillDisplayModeLoading}
              handlePillDisplayModeChange={state.handlePillDisplayModeChange}
              audioDevices={state.audioDevices}
              audioOutputDevices={state.audioOutputDevices}
              selectedMicId={state.selectedMicId}
              selectedOutputId={state.selectedOutputId}
              isAudioPrefsLoading={state.isAudioPrefsLoading}
              isMicTesting={state.isMicTesting}
              micLevel={state.micLevel}
              handleMicrophoneChange={state.handleMicrophoneChange}
              handleOutputDeviceChange={state.handleOutputDeviceChange}
              startMicTest={state.startMicTest}
              stopMicTest={state.stopMicTest}
            />
          )}

          {activeTab === "update" && (
            <UpdateTab
              appVersion={state.appVersion}
              updateStatus={state.updateStatus}
              updateError={state.updateError}
              downloadedVersion={state.downloadedVersion}
              isCheckingForUpdates={state.isCheckingForUpdates}
              handleCheckForUpdates={state.handleCheckForUpdates}
              handleInstallUpdate={state.handleInstallUpdate}
            />
          )}
        </div>
      </div>
    </div>
  );
}
