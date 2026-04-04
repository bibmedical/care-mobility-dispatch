import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DriverAlertsSection } from '../components/driver/DriverAlertsSection';
import { DriverControlSection } from '../components/driver/DriverControlSection';
import { DriverDashboardSection } from '../components/driver/DriverDashboardSection';
import { DriverDocumentsSection } from '../components/driver/DriverDocumentsSection';
import { DriverDrawerMenu } from '../components/driver/DriverDrawerMenu';
import { DriverGpsSection } from '../components/driver/DriverGpsSection';
import { DriverHelpSection } from '../components/driver/DriverHelpSection';
import { DriverHistorySection } from '../components/driver/DriverHistorySection';
import { DriverMessagesSection } from '../components/driver/DriverMessagesSection';
import { DriverProfileSection } from '../components/driver/DriverProfileSection';
import { DriverTripsSection } from '../components/driver/DriverTripsSection';
import { getDriverAccentColor, withDriverAccentAlpha } from '../components/driver/driverColor';
import { driverSharedStyles, driverTheme } from '../components/driver/driverTheme';
import { DriverRuntime } from '../hooks/useDriverRuntime';
import { DriverAppTab } from '../types/driver';
import { useState } from 'react';

type Props = {
  runtime: DriverRuntime;
};

const SCREEN_TITLES: Record<DriverAppTab, string> = {
  home: 'Home',
  trips: 'Trips',
  messages: 'Messages',
  alerts: 'Alerts',
  gps: 'GPS',
  settings: 'Settings',
  profile: 'Profile',
  history: 'History',
  documents: 'Documents',
  help: 'Help'
};

export const DriverOperationsScreen = ({ runtime }: Props) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const driverAccent = getDriverAccentColor({
    id: runtime.driverSession?.driverId,
    name: runtime.driverSession?.name || runtime.driverCode
  });

  const renderBody = () => {
    if (runtime.activeTab === 'home') return <DriverDashboardSection runtime={runtime} />;
    if (runtime.activeTab === 'trips') return <DriverTripsSection runtime={runtime} />;
    if (runtime.activeTab === 'messages') return <DriverMessagesSection runtime={runtime} />;
    if (runtime.activeTab === 'alerts') return <DriverAlertsSection runtime={runtime} />;
    if (runtime.activeTab === 'gps') return <DriverGpsSection runtime={runtime} />;
    if (runtime.activeTab === 'profile') return <DriverProfileSection runtime={runtime} />;
    if (runtime.activeTab === 'history') return <DriverHistorySection runtime={runtime} />;
    if (runtime.activeTab === 'documents') return <DriverDocumentsSection runtime={runtime} />;
    if (runtime.activeTab === 'help') return <DriverHelpSection runtime={runtime} />;
    return <DriverControlSection runtime={runtime} />;
  };

  return <View style={styles.screen}>
      <View style={[styles.topBar, { borderBottomColor: withDriverAccentAlpha(driverAccent, 0.2) }]}>
        <Pressable style={[styles.menuButton, { backgroundColor: driverAccent, borderColor: withDriverAccentAlpha(driverAccent, 0.55) }]} onPress={() => setIsDrawerOpen(true)}>
          <Text style={styles.menuButtonText}>Menu</Text>
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={[styles.titleEyebrow, { color: driverAccent }]}>Driver App</Text>
          <Text style={styles.titleText}>{SCREEN_TITLES[runtime.activeTab]}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={driverSharedStyles.screen}>
        {renderBody()}
      </ScrollView>

      {isDrawerOpen ? <DriverDrawerMenu activeTab={runtime.activeTab} onChange={runtime.setActiveTab} onClose={() => setIsDrawerOpen(false)} driverName={runtime.driverSession?.name || runtime.driverCode || 'Driver'} driverKey={runtime.driverSession?.driverId || runtime.driverSession?.name || runtime.driverCode || 'driver'} /> : null}
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: driverTheme.colors.appBg
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: driverTheme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: driverTheme.colors.border
  },
  menuButton: {
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  menuButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  titleBlock: {
    flex: 1
  },
  titleEyebrow: {
    color: driverTheme.colors.primaryText,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  titleText: {
    color: driverTheme.colors.text,
    fontSize: 23,
    fontWeight: '800'
  }
});
