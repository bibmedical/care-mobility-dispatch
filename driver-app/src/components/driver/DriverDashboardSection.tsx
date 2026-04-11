import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { DriverAppTab } from '../../types/driver';
import { getDriverAccentColor, withDriverAccentAlpha } from './driverColor';
import { driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

type QuickItem = {
  key: DriverAppTab;
  label: string;
  subtitle: string;
};

const QUICK_ITEMS: QuickItem[] = [
  { key: 'fuel', label: 'Fuel', subtitle: 'Request fuel & submit receipt' },
  { key: 'trips', label: 'Next Day Trips', subtitle: 'Tomorrow routes only' },
  { key: 'messages', label: 'Messages', subtitle: 'Dispatch inbox' },
  { key: 'alerts', label: 'Alerts', subtitle: 'Active notifications' },
  { key: 'gps', label: 'GPS', subtitle: 'Location and permissions' },
  { key: 'timeoff', label: 'Time Off', subtitle: 'Appointment and excuse note' },
  { key: 'settings', label: 'Settings', subtitle: 'App and device settings' },
  { key: 'profile', label: 'Profile', subtitle: 'Driver profile details' },
  { key: 'history', label: 'History', subtitle: 'Completed trips' },
  { key: 'documents', label: 'Documents', subtitle: 'Driver records' }
];

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
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayKey = toDateKey(today);
  const tomorrowKey = toDateKey(tomorrow);
  const todayTripCount = runtime.assignedTrips.filter(trip => normalizeServiceDateKey(trip.serviceDate) === todayKey).length;
  const nextDayTripCount = runtime.assignedTrips.filter(trip => normalizeServiceDateKey(trip.serviceDate) === tomorrowKey || trip.isNextDayTrip).length;

  const incomingMessages = runtime.messages.filter(message => String(message.source || '').toLowerCase() !== 'mobile-driver-app');
  const unreadIncomingCount = Number(runtime.unreadIncomingMessageCount || 0);
  const hasActiveIncoming = unreadIncomingCount > 0;
  const hasReadIncoming = incomingMessages.length > 0 && !hasActiveIncoming;
  const hasAnyIncoming = incomingMessages.length > 0;
  const messagesPanelColor = hasAnyIncoming ? '#d1d5db' : '#374151';
  const messagesPanelTextColor = hasAnyIncoming ? '#111827' : '#ffffff';
  const messagesPanelSubTextColor = hasAnyIncoming ? '#374151' : 'rgba(255,255,255,0.9)';
  const messagesPanelBadgeBg = hasAnyIncoming ? '#e5e7eb' : withDriverAccentAlpha('#ffffff', 0.18);
  const messagesPanelBadgeBorder = hasAnyIncoming ? '#111827' : withDriverAccentAlpha('#ffffff', 0.26);
  const messagesPanelBadgeText = hasAnyIncoming ? '#111827' : '#ffffff';
  const messagesBadgeValue = unreadIncomingCount;
  const reviewSummary = runtime.driverReviewSummary;
  const averageRating = Number(reviewSummary?.averageRating || 0);
  const totalReviews = Number(reviewSummary?.totalReviews || 0);
  const completedTrips = Number(reviewSummary?.completedTrips || 0);
  const yearsWithCompany = Number(reviewSummary?.yearsWithCompany || 0);
  const profilePhotoUrl = String(runtime.driverSession?.profilePhotoUrl || '').trim();
  const vehicleLabel = String(reviewSummary?.vehicle || runtime.driverSession?.vehicleId || '').trim() || 'Vehicle pending';
  const ratingText = totalReviews > 0 ? `${averageRating.toFixed(1)}★` : 'New';

  return <View style={styles.screen}>
      <View style={styles.profileHeroCard}>
        <View style={styles.profileHeroTop}>
          {profilePhotoUrl
            ? <Image source={{ uri: profilePhotoUrl }} style={styles.profileHeroPhoto} resizeMode="cover" />
            : <View style={[styles.profileHeroPhoto, styles.profileHeroPhotoFallback]}>
                <Image source={require('../../../assets/iconnew-cropped.png')} style={styles.profileHeroLogoFallback} resizeMode="contain" />
              </View>}
          <Text style={styles.profileHeroName}>{driverName}</Text>
          <Text style={styles.profileHeroVehicle}>{vehicleLabel}</Text>
        </View>

        <View style={styles.profileHeroStatsRow}>
          <View style={styles.profileHeroStatBlock}>
            <Text style={styles.profileHeroStatValue}>{completedTrips.toLocaleString()}</Text>
            <Text style={styles.profileHeroStatLabel}>Trips</Text>
          </View>
          <View style={styles.profileHeroStatBlock}>
            <Text style={styles.profileHeroStatValue}>{ratingText}</Text>
            <Text style={styles.profileHeroStatLabel}>{totalReviews > 0 ? `${totalReviews} reviews` : 'Rating'}</Text>
          </View>
          <View style={styles.profileHeroStatBlock}>
            <Text style={styles.profileHeroStatValue}>{yearsWithCompany}</Text>
            <Text style={styles.profileHeroStatLabel}>Years</Text>
          </View>
        </View>

        {runtime.driverReviewError ? <Text style={styles.reviewErrorText}>{runtime.driverReviewError}</Text> : null}
      </View>

      <Pressable style={[styles.primaryCard, styles.tripsPrimaryCard]} onPress={() => {
        runtime.setTripDateFilter('today');
        runtime.setActiveTab('trips');
      }}>
        <View style={styles.primaryCardCopy}>
          <Text style={styles.primaryLabel}>Today Trips</Text>
          <View style={styles.tripSplitRow}>
            <Pressable style={styles.tripSplitBlock} onPress={() => {
              runtime.setTripDateFilter('today');
              runtime.setActiveTab('trips');
            }}>
              <Text style={styles.tripSplitLabel}>Today</Text>
              <Text style={styles.primaryValue}>{todayTripCount}</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.primaryBadge, { backgroundColor: withDriverAccentAlpha('#ffffff', 0.18), borderColor: withDriverAccentAlpha('#ffffff', 0.26) }]}>
          <Text style={styles.primaryBadgeText}>{todayTripCount}</Text>
        </View>
      </Pressable>

      <Pressable style={[styles.primaryCard, { backgroundColor: messagesPanelColor, borderColor: '#000000' }]} onPress={() => runtime.setActiveTab('messages')}>
        <View style={styles.primaryCardCopy}>
          <Text style={[styles.primaryLabel, { color: messagesPanelTextColor }]}>Messages</Text>
          <Text style={[styles.messageStatusText, { color: messagesPanelTextColor }]}>{hasActiveIncoming ? 'New message' : hasReadIncoming ? 'All read' : 'No messages'}</Text>
          <Text style={[styles.messageNamesText, { color: messagesPanelSubTextColor }]}>{incomingMessages.length > 0 ? `${incomingMessages.length} conversation(s)` : 'No conversations yet'}</Text>
        </View>
        <View style={[styles.primaryBadge, { backgroundColor: messagesPanelBadgeBg, borderColor: messagesPanelBadgeBorder }]}>
          <Text style={[styles.primaryBadgeText, { color: messagesPanelBadgeText }]}>{messagesBadgeValue}</Text>
        </View>
      </Pressable>

      <View style={styles.quickGrid}>
        {QUICK_ITEMS.map(item => <Pressable key={item.key} style={styles.quickCard} onPress={() => {
            if (item.key === 'trips') runtime.setTripDateFilter('next-day');
            runtime.setActiveTab(item.key);
          }}>
            <Text style={styles.quickCardTitle}>{item.label}</Text>
            <Text style={styles.quickCardMeta}>{item.subtitle}</Text>
          </Pressable>)}
      </View>
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    gap: 8
  },
  profileHeroCard: {
    backgroundColor: '#1f2937',
    borderRadius: driverTheme.radius.xl,
    borderWidth: 1,
    borderColor: '#111827',
    overflow: 'hidden'
  },
  profileHeroTop: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111827'
  },
  profileHeroPhoto: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#ffffff'
  },
  profileHeroPhotoFallback: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileHeroLogoFallback: {
    width: 66,
    height: 66
  },
  profileHeroName: {
    color: '#f9fafb',
    fontSize: 36,
    fontWeight: '500'
  },
  profileHeroVehicle: {
    color: '#cbd5e1',
    fontSize: 20,
    fontWeight: '500'
  },
  profileHeroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  profileHeroStatBlock: {
    flex: 1,
    alignItems: 'center'
  },
  profileHeroStatValue: {
    color: '#f9fafb',
    fontSize: 34,
    fontWeight: '500'
  },
  profileHeroStatLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    marginTop: 2
  },
  reviewErrorText: {
    color: '#fda4af',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    textAlign: 'center'
  },
  primaryCard: {
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: driverTheme.radius.xl,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.8,
    borderColor: '#000000'
  },
  tripsPrimaryCard: {
    backgroundColor: '#1f2937',
    borderColor: '#000000'
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
    fontSize: 28,
    fontWeight: '800'
  },
  messageStatusText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2
  },
  messageNamesText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2
  },
  primaryBadge: {
    width: 56,
    height: 56,
    borderRadius: driverTheme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryBadgeText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800'
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2
  },
  quickCard: {
    width: '48%',
    minHeight: 86,
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.md,
    borderWidth: 0.8,
    borderColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between'
  },
  quickCardTitle: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  quickCardMeta: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  }
});
