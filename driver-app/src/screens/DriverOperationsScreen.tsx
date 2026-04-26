import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { DriverAlertsSection } from '../components/driver/DriverAlertsSection';
import { DriverControlSection } from '../components/driver/DriverControlSection';
import { DriverDashboardSection } from '../components/driver/DriverDashboardSection';
import { DriverDocumentsSection } from '../components/driver/DriverDocumentsSection';
import { DriverFuelReceiptsSection } from '../components/driver/DriverFuelReceiptsSection';
import { DriverGpsSection } from '../components/driver/DriverGpsSection';
import { DriverHelpSection } from '../components/driver/DriverHelpSection';
import { DriverHistorySection } from '../components/driver/DriverHistorySection';
import { DriverMessagesSection } from '../components/driver/DriverMessagesSection';
import { DriverProfileSection } from '../components/driver/DriverProfileSection';
import { DriverTimeOffSection } from '../components/driver/DriverTimeOffSection';
import { DriverTripsSection } from '../components/driver/DriverTripsSection';
import { getDriverAccentColor, withDriverAccentAlpha } from '../components/driver/driverColor';
import { driverSharedStyles, driverTheme } from '../components/driver/driverTheme';
import { DriverRuntime } from '../hooks/useDriverRuntime';
import { DriverAppTab } from '../types/driver';

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
  help: 'Help',
  fuel: 'Fuel & Mileage',
  timeoff: 'Time Off'
};

export const DriverOperationsScreen = ({ runtime }: Props) => {
  const driverAccent = getDriverAccentColor({
    id: runtime.driverSession?.driverId,
    name: runtime.driverSession?.name || runtime.driverCode
  });
  const showTopBar = runtime.activeTab !== 'home';

  useEffect(() => {
    if (runtime.activeTab !== 'trips') return;
    if (runtime.tripDateFilter === 'all') return;
    runtime.setTripDateFilter('all');
  }, [runtime]);

  const renderBody = () => {
    if (runtime.activeTab === 'home') return <DriverDashboardSection runtime={runtime} />;
    if (runtime.activeTab === 'trips') return <DriverTripsSection runtime={runtime} />;
    if (runtime.activeTab === 'messages') return <DriverMessagesSection runtime={runtime} />;
    if (runtime.activeTab === 'alerts') return <DriverAlertsSection runtime={runtime} />;
    if (runtime.activeTab === 'gps') return <DriverGpsSection runtime={runtime} />;
    if (runtime.activeTab === 'profile') return <DriverProfileSection runtime={runtime} />;
    if (runtime.activeTab === 'history') return <DriverHistorySection runtime={runtime} />;
    if (runtime.activeTab === 'documents') return <DriverDocumentsSection runtime={runtime} />;
    if (runtime.activeTab === 'fuel') return <DriverFuelReceiptsSection runtime={runtime} />;
    if (runtime.activeTab === 'timeoff') return <DriverTimeOffSection runtime={runtime} />;
    if (runtime.activeTab === 'help') return <DriverHelpSection runtime={runtime} />;
    return <DriverControlSection runtime={runtime} />;
  };

  // Messages and trips already contain their own section layouts, but only messages
  // need a fixed wrapper. Trips should stay scrollable to keep action buttons reachable.
  const useStaticBodyWrap = runtime.activeTab === 'messages';
  const logoutButton = <Pressable style={styles.logoutButton} onPress={() => void runtime.signOut()}>
      <Text style={styles.logoutButtonText}>Logout</Text>
    </Pressable>;

  return <View style={styles.screen}>
      {showTopBar ? <View style={[styles.topBar, { borderBottomColor: withDriverAccentAlpha(driverAccent, 0.2) }]}>
        {runtime.activeTab !== 'home' ? <Pressable style={[styles.homeBackButton, { backgroundColor: driverAccent }]} onPress={() => runtime.setActiveTab('home')}>
            <Text style={styles.homeBackButtonText}>{'← Home'}</Text>
          </Pressable> : null}
        <View style={styles.titleBlock}>
          {runtime.activeTab !== 'trips' ? <Text style={styles.titleText}>{SCREEN_TITLES[runtime.activeTab]}</Text> : null}
        </View>
        <View style={styles.topBarRightActions}>
          {runtime.activeTab === 'trips' ? <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>All Trips</Text>
            </View> : null}
          {logoutButton}
        </View>
      </View> : null}

      {!showTopBar ? <View style={styles.homeLogoutWrap}>
          {logoutButton}
        </View> : null}

      {useStaticBodyWrap ? <View style={styles.messagesBodyWrap}>{renderBody()}</View> : <ScrollView contentContainerStyle={driverSharedStyles.screen}>
          {renderBody()}
        </ScrollView>}


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
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 0
  },
  menuButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5
  },
  homeBackButton: {
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  homeBackButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13
  },
  titleBlock: {
    flex: 1
  },
  topBarRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  logoutButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  logoutButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  homeLogoutWrap: {
    position: 'absolute',
    right: 12,
    top: 10,
    zIndex: 20
  },
  titleText: {
    color: driverTheme.colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  messagesBodyWrap: {
    flex: 1,
    padding: 12
  },
  todayBadge: {
    backgroundColor: driverTheme.colors.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  todayBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5
  }
});
