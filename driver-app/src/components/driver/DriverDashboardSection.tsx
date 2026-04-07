import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { getDriverAccentColor, withDriverAccentAlpha } from './driverColor';
import { driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

const getInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'DR';
const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const normalizeServiceDateKey = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const mm = String(slashMatch[1]).padStart(2, '0');
    const dd = String(slashMatch[2]).padStart(2, '0');
    const yyyy = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
};

export const DriverDashboardSection = ({ runtime }: Props) => {
  const driverName = runtime.driverSession?.name || runtime.driverCode || 'Driver';
  const driverAccent = getDriverAccentColor({ id: runtime.driverSession?.driverId, name: driverName });
  const initials = getInitials(driverName);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayKey = toDateKey(today);
  const tomorrowKey = toDateKey(tomorrow);
  const todayTripCount = runtime.assignedTrips.filter(trip => normalizeServiceDateKey(trip.serviceDate) === todayKey).length;
  const nextDayTripCount = runtime.assignedTrips.filter(trip => normalizeServiceDateKey(trip.serviceDate) === tomorrowKey || trip.isNextDayTrip).length;
  const tripCount = todayTripCount + nextDayTripCount;
  const urgentMessages = runtime.messages.filter(message => String(message.source || '').toLowerCase() !== 'mobile-driver-app').length;
  const activeRouteName = runtime.activeTrip?.rider || 'No active route';

  return <View style={styles.screen}>
      <View style={styles.topRow}>
        <View style={[styles.avatarBubble, { backgroundColor: withDriverAccentAlpha(driverAccent, 0.12), borderColor: withDriverAccentAlpha(driverAccent, 0.28) }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.identityBlock}>
          <Text style={styles.welcomeText}>Welcome back</Text>
          <Text style={styles.driverName}>{driverName}</Text>
        </View>

        <Pressable style={[styles.profileChip, { borderColor: withDriverAccentAlpha(driverAccent, 0.24), backgroundColor: withDriverAccentAlpha(driverAccent, 0.06) }]} onPress={() => runtime.setActiveTab('profile')}>
          <Text style={[styles.profileChipText, { color: driverAccent }]}>Profile</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.primaryCard, { backgroundColor: driverAccent, borderColor: withDriverAccentAlpha(driverAccent, 0.52) }]} onPress={() => runtime.setActiveTab('trips')}>
        <View style={styles.primaryCardCopy}>
          <Text style={styles.primaryLabel}>Trips</Text>
          <View style={styles.tripSplitRow}>
            <View style={styles.tripSplitBlock}>
              <Text style={styles.tripSplitLabel}>Today</Text>
              <Text style={styles.primaryValue}>{todayTripCount}</Text>
            </View>
            <View style={styles.tripSplitBlock}>
              <Text style={styles.tripSplitLabel}>Next day</Text>
              <Text style={styles.primaryValue}>{nextDayTripCount}</Text>
            </View>
          </View>
          <Text style={styles.primaryMeta}>{tripCount === 1 ? '1 trip in queue' : `${tripCount} trips in queue`}</Text>
        </View>
        <View style={[styles.primaryBadge, { backgroundColor: withDriverAccentAlpha('#ffffff', 0.18), borderColor: withDriverAccentAlpha('#ffffff', 0.26) }]}>
          <Text style={styles.primaryBadgeText}>{tripCount}</Text>
        </View>
      </Pressable>

      <Text style={styles.sectionTitle}>Quick access</Text>

      <View style={styles.quickMoodRow}>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('messages')}>
          <Text style={styles.moodCode}>MSG</Text>
          <Text style={styles.moodLabel}>Messages</Text>
        </Pressable>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('alerts')}>
          <Text style={styles.moodCode}>ALT</Text>
          <Text style={styles.moodLabel}>Alerts</Text>
        </Pressable>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('profile')}>
          <Text style={styles.moodCode}>PRF</Text>
          <Text style={styles.moodLabel}>Profile</Text>
        </Pressable>
        <Pressable style={styles.moodCard} onPress={() => runtime.setActiveTab('settings')}>
          <Text style={styles.moodCode}>SET</Text>
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
    borderRadius: driverTheme.radius.md,
    backgroundColor: driverTheme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  avatarText: {
    color: '#1f2937',
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
    borderRadius: driverTheme.radius.sm,
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
    borderRadius: driverTheme.radius.xl,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  primaryCardCopy: {
    flex: 1,
    gap: 4
  },
  tripSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 12
  },
  tripSplitBlock: {
    flex: 1
  },
  tripSplitLabel: {
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6
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
    borderRadius: driverTheme.radius.md,
    borderWidth: 1,
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
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  quickMoodRow: {
    flexDirection: 'row',
    gap: 8
  },
  moodCard: {
    flex: 1,
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  moodCode: {
    color: driverTheme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1
  },
  moodLabel: {
    color: driverTheme.colors.text,
    fontSize: 11,
    fontWeight: '700'
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  featureCard: {
    width: '48%',
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    padding: 16,
    minHeight: 130,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  featureWide: {
    width: '100%',
    minHeight: 100,
    backgroundColor: driverTheme.colors.surfaceElevated,
    borderColor: driverTheme.colors.primary
  },
  featureValueLarge: {
    color: driverTheme.colors.primaryText,
    fontSize: 22,
    fontWeight: '800'
  },
  featureValue: {
    color: driverTheme.colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  featureLabel: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  featureSubtext: {
    color: driverTheme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17
  }
});
