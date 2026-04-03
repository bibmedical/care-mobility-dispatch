import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

const getInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'DR';

export const DriverDashboardSection = ({ runtime }: Props) => {
  const driverName = runtime.driverSession?.name || runtime.driverCode || 'Driver';
  const initials = getInitials(driverName);
  const tripCount = runtime.assignedTrips.length;
  const urgentMessages = runtime.messages.filter(message => String(message.source || '').toLowerCase() !== 'mobile-driver-app').length;
  const activeRouteName = runtime.activeTrip?.rider || 'No active route';

  return <View style={styles.screen}>
      <View style={styles.topRow}>
        <View style={styles.avatarBubble}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.identityBlock}>
          <Text style={styles.welcomeText}>Welcome back</Text>
          <Text style={styles.driverName}>{driverName}</Text>
        </View>

        <Pressable style={styles.profileChip} onPress={() => runtime.setActiveTab('profile')}>
          <Text style={styles.profileChipText}>Profile</Text>
        </Pressable>
      </View>

      <Pressable style={styles.primaryCard} onPress={() => runtime.setActiveTab('trips')}>
        <View style={styles.primaryCardCopy}>
          <Text style={styles.primaryLabel}>Trips</Text>
          <Text style={styles.primaryValue}>{tripCount}</Text>
          <Text style={styles.primaryMeta}>{tripCount === 1 ? '1 trip assigned today' : `${tripCount} trips assigned today`}</Text>
        </View>
        <View style={styles.primaryBadge}>
          <Text style={styles.primaryBadgeText}>{tripCount}</Text>
        </View>
      </Pressable>

      <Text style={styles.sectionTitle}>Quick pages</Text>

      <View style={styles.quickMoodRow}>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('messages')}>
          <Text style={styles.moodEmoji}>🙂</Text>
          <Text style={styles.moodLabel}>Messages</Text>
        </Pressable>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('alerts')}>
          <Text style={styles.moodEmoji}>😎</Text>
          <Text style={styles.moodLabel}>Alerts</Text>
        </Pressable>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('profile')}>
          <Text style={styles.moodEmoji}>😊</Text>
          <Text style={styles.moodLabel}>Profile</Text>
        </Pressable>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('settings')}>
          <Text style={styles.moodEmoji}>⚙️</Text>
          <Text style={styles.moodLabel}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.featureGrid}>
        <Pressable style={[styles.featureCard, styles.featureWide]} onPress={() => runtime.setActiveTab('trips')}>
          <Text style={styles.featureValueLarge}>{runtime.activeTrip ? 'Route ready' : 'Waiting'}</Text>
          <Text style={styles.featureLabel}>Active route</Text>
          <Text style={styles.featureSubtext}>{activeRouteName}</Text>
        </Pressable>

        <Pressable style={styles.featureCard} onPress={() => runtime.setActiveTab('settings')}>
          <Text style={styles.featureValue}>Settings</Text>
          <Text style={styles.featureLabel}>GPS, permissions, sync</Text>
          <Text style={styles.featureSubtext}>Open device and route settings</Text>
        </Pressable>

        <Pressable style={styles.featureCard} onPress={() => runtime.setActiveTab('messages')}>
          <Text style={styles.featureValue}>{urgentMessages}</Text>
          <Text style={styles.featureLabel}>Messages</Text>
          <Text style={styles.featureSubtext}>Open dispatch inbox</Text>
        </Pressable>

        <Pressable style={styles.featureCard} onPress={() => runtime.setActiveTab('alerts')}>
          <Text style={styles.featureValue}>{runtime.currentAlert ? 'Live' : 'Clear'}</Text>
          <Text style={styles.featureLabel}>Alerts</Text>
          <Text style={styles.featureSubtext}>{runtime.currentAlert ? runtime.currentAlert.title : 'No active alerts'}</Text>
        </Pressable>

        <Pressable style={styles.featureCard} onPress={() => runtime.setActiveTab('gps')}>
          <Text style={styles.featureValue}>{runtime.trackingEnabled ? 'On' : 'Off'}</Text>
          <Text style={styles.featureLabel}>GPS</Text>
          <Text style={styles.featureSubtext}>Live location and permissions</Text>
        </Pressable>

        <Pressable style={styles.featureCard} onPress={() => runtime.setActiveTab('history')}>
          <Text style={styles.featureValue}>History</Text>
          <Text style={styles.featureLabel}>Separated page</Text>
          <Text style={styles.featureSubtext}>Past and completed work</Text>
        </Pressable>

        <Pressable style={styles.featureCard} onPress={() => runtime.setActiveTab('documents')}>
          <Text style={styles.featureValue}>Docs</Text>
          <Text style={styles.featureLabel}>Driver records</Text>
          <Text style={styles.featureSubtext}>License, files, and status</Text>
        </Pressable>

        <Pressable style={styles.featureCard} onPress={() => runtime.setActiveTab('help')}>
          <Text style={styles.featureValue}>Help</Text>
          <Text style={styles.featureLabel}>Support</Text>
          <Text style={styles.featureSubtext}>GPS and dispatch assistance</Text>
        </Pressable>
      </View>
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    gap: 16
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatarBubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: driverTheme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#2d3b4c',
    fontSize: 18,
    fontWeight: '800'
  },
  identityBlock: {
    flex: 1
  },
  welcomeText: {
    color: driverTheme.colors.textSoft,
    fontSize: 12
  },
  driverName: {
    color: driverTheme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2
  },
  profileChip: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  profileChipText: {
    color: driverTheme.colors.text,
    fontWeight: '700'
  },
  primaryCard: {
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: 28,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  primaryCardCopy: {
    flex: 1,
    gap: 4
  },
  primaryLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  primaryValue: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800'
  },
  primaryMeta: {
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20
  },
  primaryBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: driverTheme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryBadgeText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800'
  },
  sectionTitle: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  quickMoodRow: {
    flexDirection: 'row',
    gap: 10
  },
  moodCard: {
    flex: 1,
    backgroundColor: driverTheme.colors.surfaceElevated,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  moodEmoji: {
    fontSize: 22
  },
  moodLabel: {
    color: '#1f2c39',
    fontSize: 12,
    fontWeight: '700'
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  featureCard: {
    width: '48%',
    backgroundColor: driverTheme.colors.surfaceElevated,
    borderRadius: 22,
    padding: 18,
    minHeight: 150,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  featureWide: {
    width: '100%',
    minHeight: 120,
    backgroundColor: driverTheme.colors.surfaceMuted
  },
  featureValueLarge: {
    color: '#1f2c39',
    fontSize: 28,
    fontWeight: '800'
  },
  featureValue: {
    color: '#1f2c39',
    fontSize: 24,
    fontWeight: '800'
  },
  featureLabel: {
    color: driverTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700'
  },
  featureSubtext: {
    color: driverTheme.colors.textSoft,
    lineHeight: 18
  }
});
